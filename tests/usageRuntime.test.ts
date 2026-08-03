import { describe, expect, it, vi } from 'vitest';
import { createUsageRuntime } from '../src/main/usageRuntime';
import type { UsageScanCycle } from '../src/main/usageScanner';

describe('usage runtime', () => {
  it('shares one active refresh and publishes the same cycle once', async () => {
    const cycle: UsageScanCycle = {
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
    const scanCycle = vi.fn(async (): Promise<UsageScanCycle> => cycle);
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

    expect(first).toBe(cycle.result);
    expect(second).toBe(cycle.result);
    expect(scanCycle).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(cycle);
  });

  it('switches the directory and forces a new scan after an in-flight refresh', async () => {
    const cycle: UsageScanCycle = {
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
      changes: { upserted: [], removedSourceFiles: [], requiresFullRebuild: false },
    };
    const first = deferred<UsageScanCycle>();
    const nextCycle: UsageScanCycle = {
      ...cycle,
      result: { ...cycle.result, sessionsDir: 'D:\\sessions' },
      changes: { ...cycle.changes, requiresFullRebuild: true },
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

    first.resolve(cycle);
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
