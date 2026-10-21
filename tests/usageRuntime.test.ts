import { describe, expect, it, vi } from 'vitest';
import { createUsageRuntime } from '../src/main/usageRuntime';
import type { UsageScanCycle } from '../src/main/usageScanner';

const EMPTY_CYCLE: UsageScanCycle = {
  result: {
    sessionsDir: 'C:\\sessions',
    scannedAt: '2026-07-25T00:00:00.000Z',
    summary: {
      totals: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
      },
      byDay: [],
      byProject: [],
      sessions: [],
    },
    warnings: [],
  },
  changes: {
    upserted: [],
    removedSourceFiles: [],
    requiresFullRebuild: false,
  },
};

describe('usage runtime', () => {
  it('does not republish an older scan after a newer durable import cycle', async () => {
    const pending = deferred<UsageScanCycle>();
    let publishExternal: ((cycle: UsageScanCycle) => void) | undefined;
    const runtime = createUsageRuntime({
      scanCycle: () => pending.promise,
      subscribeExternalCycle: (listener) => {
        publishExternal = listener;
        return () => undefined;
      },
      initialSessionsDir: EMPTY_CYCLE.result.sessionsDir,
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    const resultListener = vi.fn();
    const cycleListener = vi.fn();
    runtime.subscribe(resultListener);
    runtime.subscribeCycle(cycleListener);
    const scanning = runtime.refresh();
    const older = { ...EMPTY_CYCLE, sequence: 1 };
    const newer = {
      ...EMPTY_CYCLE,
      sequence: 2,
      result: { ...EMPTY_CYCLE.result, scannedAt: '2026-10-21T00:00:00Z' },
    };
    publishExternal?.(older);
    publishExternal?.(newer);
    pending.resolve(older);
    await expect(scanning).resolves.toBe(newer.result);
    expect(runtime.getResult()).toBe(newer.result);
    expect(resultListener).toHaveBeenCalledTimes(2);
    expect(cycleListener).toHaveBeenCalledTimes(2);
  });

  it('publishes imported cycles through the same result and analysis subscriptions', async () => {
    let publishExternal: ((cycle: UsageScanCycle) => void) | undefined;
    const unsubscribeExternal = vi.fn();
    const runtime = createUsageRuntime({
      scanCycle: vi.fn(async () => EMPTY_CYCLE),
      subscribeExternalCycle: (listener) => {
        publishExternal = listener;
        return unsubscribeExternal;
      },
      initialSessionsDir: EMPTY_CYCLE.result.sessionsDir,
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    const resultListener = vi.fn();
    const cycleListener = vi.fn();
    runtime.subscribe(resultListener);
    runtime.subscribeCycle(cycleListener);
    publishExternal?.(EMPTY_CYCLE);
    expect(runtime.getResult()).toBe(EMPTY_CYCLE.result);
    expect(resultListener).toHaveBeenCalledWith(EMPTY_CYCLE.result);
    await vi.waitFor(() => expect(cycleListener).toHaveBeenCalledWith(EMPTY_CYCLE));
    runtime.stop();
    expect(unsubscribeExternal).toHaveBeenCalledOnce();
  });

  it('shares one active refresh and publishes the same cycle once', async () => {
    const scanCycle = vi.fn(async (): Promise<UsageScanCycle> => EMPTY_CYCLE);
    const runtime = createUsageRuntime({
      scanCycle,
      initialSessionsDir: 'C:\\sessions',
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    const listener = vi.fn();
    runtime.subscribeCycle(listener);

    const [first, second] = await Promise.all([runtime.refresh(), runtime.refresh()]);

    expect(first).toBe(EMPTY_CYCLE.result);
    expect(second).toBe(EMPTY_CYCLE.result);
    expect(scanCycle).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(EMPTY_CYCLE);
  });

  it('delivers usage without waiting for asynchronous cycle consumers', async () => {
    const consumerFinished = deferred<void>();
    const runtime = createUsageRuntime({
      scanCycle: vi.fn(async () => EMPTY_CYCLE),
      initialSessionsDir: 'C:\\sessions',
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    runtime.subscribeCycle(() => consumerFinished.promise);

    await expect(runtime.refresh()).resolves.toBe(EMPTY_CYCLE.result);
    consumerFinished.resolve();
  });

  it('keeps a successful scan when a cycle consumer throws synchronously', async () => {
    const runtime = createUsageRuntime({
      scanCycle: vi.fn(async () => EMPTY_CYCLE),
      initialSessionsDir: 'C:\\sessions',
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    const error = new Error('analysis failed');
    const errorListener = vi.fn();
    runtime.subscribeCycle(() => {
      throw error;
    });
    runtime.subscribeError(errorListener);

    await expect(runtime.refresh()).resolves.toBe(EMPTY_CYCLE.result);
    await vi.waitFor(() => expect(errorListener).toHaveBeenCalledWith(error));
  });

  it('reuses the startup scan for initial usage while manual refresh scans again', async () => {
    const startupCycle = deferred<UsageScanCycle>();
    const refreshedCycle: UsageScanCycle = {
      ...EMPTY_CYCLE,
      result: { ...EMPTY_CYCLE.result, scannedAt: '2026-07-25T00:01:00.000Z' },
    };
    const scanCycle = vi
      .fn<() => Promise<UsageScanCycle>>()
      .mockReturnValueOnce(startupCycle.promise)
      .mockResolvedValueOnce(refreshedCycle);
    const runtime = createUsageRuntime({
      scanCycle,
      initialSessionsDir: 'C:\\sessions',
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });

    runtime.start();
    const initialUsage = runtime.getInitialUsage();
    expect(scanCycle).toHaveBeenCalledTimes(1);

    startupCycle.resolve(EMPTY_CYCLE);
    await expect(initialUsage).resolves.toBe(EMPTY_CYCLE.result);
    await expect(runtime.getInitialUsage()).resolves.toBe(EMPTY_CYCLE.result);
    expect(scanCycle).toHaveBeenCalledTimes(1);

    await expect(runtime.refresh()).resolves.toBe(refreshedCycle.result);
    expect(scanCycle).toHaveBeenCalledTimes(2);
  });

  it('switches the directory and forces a new scan after an in-flight refresh', async () => {
    const first = deferred<UsageScanCycle>();
    const nextCycle: UsageScanCycle = {
      ...EMPTY_CYCLE,
      result: { ...EMPTY_CYCLE.result, sessionsDir: 'D:\\sessions' },
      changes: { ...EMPTY_CYCLE.changes, requiresFullRebuild: true },
    };
    const scanCycle = vi
      .fn<(sessionsDir: string) => Promise<UsageScanCycle>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(nextCycle);
    const runtime = createUsageRuntime({
      scanCycle,
      initialSessionsDir: 'C:\\sessions',
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });

    const activeRefresh = runtime.refresh();
    const switched = runtime.updateSessionsDir('D:\\sessions');
    expect(scanCycle).toHaveBeenCalledWith('C:\\sessions');

    first.resolve(EMPTY_CYCLE);
    await activeRefresh;
    await expect(switched).resolves.toBe(nextCycle.result);
    expect(scanCycle).toHaveBeenLastCalledWith('D:\\sessions');
  });
});

const deferred = <Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} => {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
};
