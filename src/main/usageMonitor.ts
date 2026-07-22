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

  return { start, stop, refresh, refreshOnFocus };
};
