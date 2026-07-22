import { describe, expect, it, vi } from 'vitest';
import { createUsageMonitor, USAGE_SCAN_INTERVAL_MS } from '../src/main/usageMonitor';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult } from '../src/shared/usageTypes';

const EMPTY_SCAN_RESULT: UsageScanResult = {
  sessionsDir: 'C:\\codex\\sessions',
  scannedAt: '2026-07-20T00:00:00.000Z',
  summary: buildUsageSummary([]),
  warnings: [],
};

describe('usage monitor', () => {
  it('shares an in-flight scan and throttles focus refreshes', async () => {
    const pending = deferred<UsageScanResult>();
    const scan = vi.fn(() => pending.promise);
    let nowMs = 1_000;
    const monitor = createUsageMonitor({
      scan,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      now: () => nowMs,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });

    const first = monitor.refresh();
    const second = monitor.refresh();
    expect(scan).toHaveBeenCalledTimes(1);
    pending.resolve(EMPTY_SCAN_RESULT);
    await Promise.all([first, second]);

    nowMs += 1_000;
    await monitor.refreshOnFocus();
    expect(scan).toHaveBeenCalledTimes(1);

    nowMs += 10_000;
    await monitor.refreshOnFocus();
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it('starts one interval, performs an immediate refresh, and stops it', async () => {
    const scan = vi.fn(async () => EMPTY_SCAN_RESULT);
    const setIntervalFn = vi.fn(() => 'usage-timer');
    const clearIntervalFn = vi.fn();
    const monitor = createUsageMonitor({
      scan,
      onUpdate: vi.fn(),
      onError: vi.fn(),
      now: () => 1_000,
      setIntervalFn,
      clearIntervalFn,
    });

    monitor.start();
    monitor.start();
    await monitor.refresh();

    expect(scan).toHaveBeenCalledTimes(1);
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), USAGE_SCAN_INTERVAL_MS);

    monitor.stop();
    monitor.stop();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledWith('usage-timer');
  });

  it('reports scan errors while preserving refresh rejection', async () => {
    const error = new Error('disk unavailable');
    const onError = vi.fn();
    const monitor = createUsageMonitor({
      scan: vi.fn().mockRejectedValue(error),
      onUpdate: vi.fn(),
      onError,
      now: () => 1_000,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });

    await expect(monitor.refresh()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
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
