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
});
