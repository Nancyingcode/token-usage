import { describe, expect, it, vi } from 'vitest';
import { createUsageMonitor } from '../src/main/usageMonitor';
import { createUsageRuntime } from '../src/main/usageRuntime';
import { createPricingSyncService } from '../src/main/pricingSyncService';
import { decodePricingCatalog } from '../src/shared/pricingCatalog';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult } from '../src/shared/usageTypes';
import { catalogFixture } from './helpers/pricingFixture';

const deferred = <Value>() => {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const result: UsageScanResult = {
  sessionsDir: 'C:\\fixture',
  scannedAt: '2026-10-22T00:00:00Z',
  summary: buildUsageSummary([]),
  warnings: [],
};

describe('update preparation quiescence', () => {
  it('waits for external import persistence without destroying usage subscriptions', async () => {
    const external = deferred<void>();
    const onStop = vi.fn();
    const runtime = createUsageRuntime({
      scanCycle: async () => ({
        result,
        changes: { upserted: [], removedSourceFiles: [], requiresFullRebuild: false },
      }),
      drainExternal: () => external.promise,
      onStop,
      initialSessionsDir: result.sessionsDir,
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    const restore = runtime.pause();
    let drained = false;
    const draining = runtime.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    expect(onStop).not.toHaveBeenCalled();
    external.resolve();
    await draining;
    restore();
    await expect(runtime.refresh()).resolves.toBe(result);
    runtime.stop();
  });

  it('drains an active scan, blocks focus refresh and restores nested pauses once', async () => {
    const pending = deferred<UsageScanResult>();
    const scan = vi.fn(() => pending.promise);
    const setIntervalFn = vi.fn(() => 1);
    const clearIntervalFn = vi.fn();
    const monitor = createUsageMonitor({
      scan,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      now: () => 0,
      setIntervalFn,
      clearIntervalFn,
    });
    monitor.start();
    const restore = monitor.pause();
    const restoreNested = monitor.pause();
    let drained = false;
    const draining = monitor.drain().then(() => {
      drained = true;
    });
    await monitor.refreshOnFocus();
    await expect(monitor.refresh()).rejects.toThrow('paused');
    expect(scan).toHaveBeenCalledOnce();
    expect(drained).toBe(false);
    expect(clearIntervalFn).toHaveBeenCalledOnce();
    pending.resolve(result);
    await draining;
    restore();
    restore();
    expect(setIntervalFn).toHaveBeenCalledOnce();
    restoreNested();
    restoreNested();
    expect(setIntervalFn).toHaveBeenCalledTimes(2);
    await monitor.drain();
    monitor.stop();
  });

  it('does not restart a monitor stopped while paused', () => {
    const setIntervalFn = vi.fn(() => 1);
    const monitor = createUsageMonitor({
      scan: async () => result,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      now: () => 0,
      setIntervalFn,
      clearIntervalFn: vi.fn(),
    });
    monitor.start();
    const restore = monitor.pause();
    monitor.stop();
    restore();
    expect(setIntervalFn).toHaveBeenCalledOnce();
  });

  it('waits for price persistence and suppresses new pricing work while paused', async () => {
    const saved = deferred<void>();
    const save = vi.fn(() => saved.promise);
    const download = vi.fn(async () => decodePricingCatalog(catalogFixture()));
    const service = createPricingSyncService({
      store: { load: async () => ({ autoUpdate: false }), save },
      builtIn: [],
      applyPrices: vi.fn(),
      download,
    });
    await service.initialize();
    const refreshing = service.refresh();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    const restore = service.pause();
    const restoreNested = service.pause();
    let drained = false;
    const draining = service.drain().then(() => {
      drained = true;
    });
    await expect(service.refresh()).rejects.toThrow('paused');
    await expect(service.setAutoUpdate(true)).rejects.toThrow('paused');
    await service.check(true);
    expect(download).toHaveBeenCalledOnce();
    expect(drained).toBe(false);
    saved.resolve();
    await refreshing;
    await draining;
    restore();
    restore();
    await expect(service.refresh()).rejects.toThrow('paused');
    restoreNested();
    await service.refresh();
    expect(download).toHaveBeenCalledTimes(2);
    service.destroy();
  });

  it('rejects preparation when price persistence fails instead of treating a caught error as success', async () => {
    const service = createPricingSyncService({
      store: {
        load: async () => ({ autoUpdate: false }),
        save: async () => {
          throw new Error('fixture disk full');
        },
      },
      builtIn: [],
      applyPrices: vi.fn(),
      download: async () => decodePricingCatalog(catalogFixture()),
    });
    await service.initialize();
    const refreshing = service.refresh();
    const restore = service.pause();
    await refreshing;
    await expect(service.drain()).rejects.toThrow('persist');
    restore();
    service.destroy();
  });
});
