import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPricingStore, type PricingState } from '../src/main/pricingStore';
import { createPricingSyncService } from '../src/main/pricingSyncService';
import { fetchPricingCatalog } from '../src/main/pricingTransport';
import { decodePricingCatalog, PRICING_REQUEST_TIMEOUT_MS } from '../src/shared/pricingCatalog';
import type { PricingCatalog } from '../src/shared/pricingCatalogTypes';
import { catalogFixture } from './helpers/pricingFixture';

const CATALOG_ROOT = 'https://raw.githubusercontent.com/Nancyingcode/token-usage/pricing';
const catalogV3 = (cachedInputUsdPerMillion: number | null = null): PricingCatalog => {
  const original = decodePricingCatalog(catalogFixture());
  return {
    ...original,
    schemaVersion: 3,
    models: [{ ...original.models[0], cachedInputUsdPerMillion }],
  };
};

// 每个测试拥有独立临时目录；afterEach 清理，绝不使用真实会话或应用数据目录。
const directories: string[] = [];
const createDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'pricing-v3-test-'));
  directories.push(directory);
  return directory;
};

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('v3 pricing transport', () => {
  it('downloads explicit null pricing from the v3 endpoint without extra requests', async () => {
    const catalog = catalogV3();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(catalog)));
    expect(await fetchPricingCatalog(new AbortController().signal, fetcher)).toEqual(catalog);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(`${CATALOG_ROOT}/catalog-v3.json`, {
      signal: expect.any(AbortSignal),
      redirect: 'error',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
  });

  it.each([1, 2] as const)('falls back only through absent endpoints to v%i', async (version) => {
    const catalog = { ...catalogFixture(), schemaVersion: version };
    const fetcher = vi.fn<typeof fetch>();
    fetcher.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    if (version === 1) {
      fetcher.mockResolvedValueOnce(new Response('missing', { status: 404 }));
    }
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify(catalog)));
    expect(await fetchPricingCatalog(new AbortController().signal, fetcher)).toEqual(catalog);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
      version === 2
        ? [`${CATALOG_ROOT}/catalog-v3.json`, `${CATALOG_ROOT}/catalog-v2.json`]
        : [
            `${CATALOG_ROOT}/catalog-v3.json`,
            `${CATALOG_ROOT}/catalog-v2.json`,
            `${CATALOG_ROOT}/catalog.json`,
          ]
    );
  });

  it.each([
    { body: 'unavailable', status: 503 },
    { body: 'forbidden', status: 403 },
    { body: '{broken', status: 200 },
    { body: JSON.stringify(catalogFixture()), status: 200 },
  ])('does not fall back after an invalid or unsuccessful v3 response: %j', async (response) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(response.body, { status: response.status }));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a v1 body served by the v2 fallback endpoint', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture())));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not fall back on a network failure or an unsuccessful fallback response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('offline'));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow(
      'offline'
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    fetcher
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('fails after all three endpoints are missing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('missing', { status: 404 }));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('uses one timeout across fallback requests and stops without more requests', async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockImplementationOnce(
        async (_url, options) =>
          new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          })
      );
    const pending = fetchPricingCatalog(new AbortController().signal, fetcher);
    const rejected = expect(pending).rejects.toThrow('aborted');
    await vi.advanceTimersByTimeAsync(PRICING_REQUEST_TIMEOUT_MS);
    await rejected;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('v3 pricing cache migration', () => {
  it.each([1, 2] as const)(
    'imports v%i preferences and catalog without changing the old file',
    async (version) => {
      const directory = await createDirectory();
      const legacyPath = join(directory, 'pricing-cache.json');
      const path = join(directory, 'pricing-cache-v3.json');
      const state = {
        autoUpdate: false,
        lastCheckedAt: '2026-10-20T00:00:00.000Z',
        catalog: { ...catalogFixture(), schemaVersion: version },
      };
      const legacy = JSON.stringify({ schemaVersion: 1, ...state });
      await writeFile(legacyPath, legacy);
      const store = createPricingStore(path, legacyPath);
      expect(await store.load()).toEqual(state);
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ schemaVersion: 1, ...state });
      expect(await readFile(legacyPath, 'utf8')).toBe(legacy);
      const next = { ...state, autoUpdate: true, catalog: catalogV3() };
      await store.save(next);
      expect(await store.load()).toEqual(next);
      expect(await readFile(legacyPath, 'utf8')).toBe(legacy);
    }
  );

  it('preserves preferences even if the legacy state has no catalog', async () => {
    const directory = await createDirectory();
    const legacyPath = join(directory, 'legacy.json');
    const path = join(directory, 'v3.json');
    await writeFile(legacyPath, JSON.stringify({ schemaVersion: 1, autoUpdate: false }));
    expect(await createPricingStore(path, legacyPath).load()).toEqual({ autoUpdate: false });
  });

  it('starts with defaults when neither file exists', async () => {
    const directory = await createDirectory();
    expect(
      await createPricingStore(join(directory, 'v3.json'), join(directory, 'legacy.json')).load()
    ).toEqual({ autoUpdate: true });
  });

  it.each(['corrupt', 'directory'] as const)(
    'does not import old prices over a %s new cache',
    async (failure) => {
      const directory = await createDirectory();
      const legacyPath = join(directory, 'legacy.json');
      const path = join(directory, 'v3.json');
      const legacy = JSON.stringify({
        schemaVersion: 1,
        autoUpdate: false,
        catalog: catalogFixture(),
      });
      await writeFile(legacyPath, legacy);
      if (failure === 'directory') {
        await mkdir(path);
      } else {
        await writeFile(path, '{broken');
      }
      await expect(createPricingStore(path, legacyPath).load()).rejects.toThrow();
      expect(await readFile(legacyPath, 'utf8')).toBe(legacy);
    }
  );

  it.each([
    '{broken',
    JSON.stringify({ schemaVersion: 1, autoUpdate: true, catalog: catalogV3() }),
  ])('rejects invalid or unsupported legacy state without creating a new cache', async (legacy) => {
    const directory = await createDirectory();
    const legacyPath = join(directory, 'legacy.json');
    const path = join(directory, 'v3.json');
    await writeFile(legacyPath, legacy);
    await expect(createPricingStore(path, legacyPath).load()).rejects.toThrow();
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(legacyPath, 'utf8')).toBe(legacy);
  });

  it('does not report migrated state when persisting the new file fails', async () => {
    const directory = await createDirectory();
    const legacyPath = join(directory, 'legacy.json');
    const path = join(directory, 'v3.json');
    const legacy = JSON.stringify({
      schemaVersion: 1,
      autoUpdate: false,
      catalog: catalogFixture(),
    });
    await writeFile(legacyPath, legacy);
    await mkdir(`${path}.tmp`);
    await expect(createPricingStore(path, legacyPath).load()).rejects.toThrow();
    expect(await readFile(legacyPath, 'utf8')).toBe(legacy);
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('v3 pricing sync progression', () => {
  const createHarness = (catalog: PricingCatalog) => {
    const store = {
      load: vi.fn(async (): Promise<PricingState> => ({ autoUpdate: false, catalog })),
      save: vi.fn(async (_state: PricingState) => undefined),
    };
    const download = vi.fn(async () => catalog);
    const applyPrices = vi.fn();
    const service = createPricingSyncService({ store, download, builtIn: [], applyPrices });
    return { store, download, applyPrices, service };
  };

  it('reports the version-specific URL after loading and refreshing partial prices', async () => {
    const h = createHarness(catalogV3());
    await h.service.initialize();
    expect(h.service.getSnapshot()).toMatchObject({
      status: 'ready',
      autoUpdate: false,
      sourceUrl: `${CATALOG_ROOT}/catalog-v3.json`,
    });
    h.download.mockResolvedValueOnce(catalogV3(0.5));
    await h.service.refresh();
    expect(h.store.save.mock.calls[0][0].catalog?.models[0].cachedInputUsdPerMillion).toBe(0.5);
    expect(h.applyPrices.mock.lastCall?.[0][0].cachedInputUsdPerMillion).toBe(0.5);
    h.service.destroy();
  });

  it.each([
    { name: 'schema downgrade', next: { ...catalogV3(1), schemaVersion: 2 as const } },
    { name: 'timestamp rollback', next: { ...catalogV3(1), publishedAt: '2026-09-09' } },
    {
      name: 'missing historical model',
      next: { ...catalogV3(1), models: [{ ...catalogV3(1).models[0], modelId: 'new-model' }] },
    },
    { name: 'known cache price removed', next: catalogV3(null) },
  ])('retains the valid catalog on $name', async ({ next }) => {
    const h = createHarness(catalogV3(1));
    await h.service.initialize();
    h.download.mockResolvedValueOnce(next);
    await h.service.refresh();
    expect(h.service.getSnapshot()).toMatchObject({ status: 'error', error: 'invalid-catalog' });
    expect(h.store.save).not.toHaveBeenCalled();
    expect(h.applyPrices).toHaveBeenCalledTimes(1);
    expect(h.applyPrices.mock.lastCall?.[0][0].cachedInputUsdPerMillion).toBe(1);
    h.service.destroy();
  });
});
