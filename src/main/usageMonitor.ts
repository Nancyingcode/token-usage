/**
 * @file 用量扫描调度器
 * @description 串行协调定时、聚焦和手动刷新，避免并发扫描并统一分发结果与错误。
 */
import type { UsageScanResult } from '../shared/usageTypes';

export const USAGE_SCAN_INTERVAL_MS = 60_000;
export const FOCUS_REFRESH_MIN_INTERVAL_MS = 10_000;

export interface UsageMonitorDependencies<IntervalId> {
  scan: () => Promise<UsageScanResult>;
  onUpdate: (result: UsageScanResult) => void;
  onError: (error: unknown) => void;
  now: () => number;
  setIntervalFn: (callback: () => void, delay: number) => IntervalId;
  clearIntervalFn: (intervalId: IntervalId) => void;
}

export interface UsageMonitor {
  start: () => void;
  stop: () => void;
  refresh: () => Promise<UsageScanResult>;
  refreshAfterCurrent: () => Promise<UsageScanResult>;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
}

export const createUsageMonitor = <IntervalId>(
  dependencies: UsageMonitorDependencies<IntervalId>
): UsageMonitor => {
  let activeRefresh: Promise<UsageScanResult> | undefined;
  let intervalId: IntervalId | undefined;
  let lastCompletedAt = Number.NEGATIVE_INFINITY;

  const refresh = (): Promise<UsageScanResult> => {
    if (activeRefresh) {
      return activeRefresh;
    }

    activeRefresh = dependencies
      .scan()
      .then((result) => {
        lastCompletedAt = dependencies.now();
        dependencies.onUpdate(result);
        return result;
      })
      .catch((error: unknown) => {
        dependencies.onError(error);
        throw error;
      })
      .finally(() => {
        activeRefresh = undefined;
      });

    return activeRefresh;
  };

  const refreshOnFocus = (): Promise<UsageScanResult | undefined> =>
    dependencies.now() - lastCompletedAt >= FOCUS_REFRESH_MIN_INTERVAL_MS
      ? refresh()
      : Promise.resolve(undefined);

  const refreshAfterCurrent = async (): Promise<UsageScanResult> => {
    if (activeRefresh) {
      try {
        await activeRefresh;
      } catch {
        // A path switch still needs its own attempt after an older refresh fails.
      }
    }

    return refresh();
  };

  const refreshInBackground = (): void => {
    void refresh().catch(() => undefined);
  };

  const start = (): void => {
    if (intervalId !== undefined) {
      return;
    }

    refreshInBackground();
    intervalId = dependencies.setIntervalFn(refreshInBackground, USAGE_SCAN_INTERVAL_MS);
  };

  const stop = (): void => {
    if (intervalId === undefined) {
      return;
    }

    dependencies.clearIntervalFn(intervalId);
    intervalId = undefined;
  };

  return { start, stop, refresh, refreshAfterCurrent, refreshOnFocus };
};
