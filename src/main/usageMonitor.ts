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
  pause: () => () => void;
  drain: () => Promise<void>;
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
  // 暂停计数由本调度器拥有；每个恢复函数仅释放自己的暂停，stop 清除运行意图但不取消在途扫描。
  let pauseDepth = 0;
  let runningRequested = false;

  const refresh = (): Promise<UsageScanResult> => {
    if (pauseDepth > 0) {
      return Promise.reject(new Error('Usage refresh is paused for application update.'));
    }
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
    pauseDepth === 0 && dependencies.now() - lastCompletedAt >= FOCUS_REFRESH_MIN_INTERVAL_MS
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
    runningRequested = true;
    if (intervalId !== undefined || pauseDepth > 0) {
      return;
    }

    refreshInBackground();
    intervalId = dependencies.setIntervalFn(refreshInBackground, USAGE_SCAN_INTERVAL_MS);
  };

  const stop = (): void => {
    runningRequested = false;
    if (intervalId === undefined) {
      return;
    }

    dependencies.clearIntervalFn(intervalId);
    intervalId = undefined;
  };

  const pause = (): (() => void) => {
    pauseDepth += 1;
    if (intervalId !== undefined) {
      dependencies.clearIntervalFn(intervalId);
      intervalId = undefined;
    }
    let restored = false;
    return () => {
      if (restored) {
        return;
      }
      restored = true;
      pauseDepth -= 1;
      if (pauseDepth === 0 && runningRequested) {
        start();
      }
    };
  };

  return {
    start,
    stop,
    pause,
    drain: async () => {
      await activeRefresh;
    },
    refresh,
    refreshAfterCurrent,
    refreshOnFocus,
  };
};
