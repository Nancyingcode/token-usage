import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPricingStore } from '../src/main/pricingStore';
import { createPricingSyncService } from '../src/main/pricingSyncService';
import { fetchPricingCatalog } from '../src/main/pricingTransport';
import {
  PRICING_MAX_BYTES,
  PRICING_RETRY_INTERVAL_MS,
  decodePricingCatalog,
} from '../src/shared/pricingCatalog';
import { catalogFixture } from './helpers/pricingFixture';

const createHarness = () => {
  const store = {
    load: vi.fn(async () => ({ autoUpdate: true })),
    save: vi.fn(async () => undefined),
  };
  const download = vi.fn(async () => decodePricingCatalog(catalogFixture()));
  const applyPrices = vi.fn();
  const service = createPricingSyncService({ store, download, builtIn: [], applyPrices });
  return { store, download, applyPrices, service };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('pricing sync', () => {
  it('deduplicates refresh, persists before applying and keeps valid data on failure', async () => {
    const h = createHarness();
    await h.service.initialize();
    await Promise.all([h.service.refresh(), h.service.refresh()]);
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.store.save).toHaveBeenCalled();
    expect(h.service.getSnapshot()).toMatchObject({
      status: 'ready',
      version: catalogFixture().version,
    });
    h.download.mockRejectedValueOnce(new Error('offline'));
    await h.service.refresh();
    expect(h.service.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'network',
      version: catalogFixture().version,
    });
    expect(h.applyPrices).toHaveBeenCalledTimes(2);
  });
  it('does not activate an update when cache write fails', async () => {
    const h = createHarness();
    await h.service.initialize();
    h.store.save.mockRejectedValueOnce(new Error('disk full'));
    await h.service.refresh();
    expect(h.service.getSnapshot()).toMatchObject({ status: 'error', error: 'storage' });
    expect(h.service.getSnapshot().version).toBeUndefined();
    expect(h.applyPrices).toHaveBeenCalledTimes(1);
  });
  it('honors the switch, retries unknown models at most hourly and clears timers', async () => {
    vi.useFakeTimers();
    const h = createHarness();
    await h.service.initialize();
    await h.service.setAutoUpdate(false);
    h.service.start();
    await vi.advanceTimersByTimeAsync(PRICING_RETRY_INTERVAL_MS);
    expect(h.download).not.toHaveBeenCalled();
    await h.service.refresh();
    expect(h.download).toHaveBeenCalledTimes(1);
    await h.service.setAutoUpdate(true);
    await h.service.check(true);
    expect(h.download).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PRICING_RETRY_INTERVAL_MS);
    await h.service.check(true);
    expect(h.download).toHaveBeenCalledTimes(2);
    h.service.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('aborts in-flight work and does not apply it after destroy', async () => {
    const h = createHarness();
    await h.service.initialize();
    let resolve: (value: ReturnType<typeof decodePricingCatalog>) => void = () => undefined;
    h.download.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const pending = h.service.refresh();
    await Promise.resolve();
    h.service.destroy();
    resolve(decodePricingCatalog(catalogFixture()));
    await pending;
    expect(h.applyPrices).toHaveBeenCalledTimes(1);
  });
});

describe('pricing storage and transport', () => {
  it('round-trips preferences and catalog in an independent directory and rejects corrupt cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pricing-test-'));
    try {
      const path = join(directory, 'pricing.json');
      const store = createPricingStore(path);
      expect(await store.load()).toEqual({ autoUpdate: true });
      const state = { autoUpdate: false, catalog: decodePricingCatalog(catalogFixture()) };
      await store.save(state);
      expect(await store.load()).toEqual(state);
      expect(JSON.parse(await readFile(path, 'utf8')).catalog).toEqual(state.catalog);
      await writeFile(path, '{broken');
      await expect(store.load()).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('requests only the fixed public URL and rejects oversized or invalid responses', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(catalogFixture())));
    expect(await fetchPricingCatalog(new AbortController().signal, fetcher)).toMatchObject({
      currency: 'USD',
    });
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/Nancyingcode/token-usage/pricing/catalog.json'
    );
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', credentials: 'omit' });
    fetcher.mockResolvedValueOnce(new Response('x'.repeat(PRICING_MAX_BYTES + 1)));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
    fetcher.mockResolvedValueOnce(new Response('{}'));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
  });
});
