/**
 * @file 统一用量运行时
 * @description
 * 复用用量监控器的单飞与节流语义，并按顺序向主进程消费者发布扫描变更集和完整结果。
 */
import type { UsageScanResult } from '../shared/usageTypes';
import { createUsageMonitor } from './usageMonitor';
import type { UsageScanCycle } from './usageScanner';

type ResultListener = (result: UsageScanResult) => void;
type CycleListener = (cycle: UsageScanCycle) => void | Promise<void>;
type ErrorListener = (error: unknown) => void;

export interface UsageRuntimeDependencies<IntervalId> {
  scanCycle: () => Promise<UsageScanCycle>;
  now: () => number;
  setIntervalFn: (callback: () => void, delay: number) => IntervalId;
  clearIntervalFn: (intervalId: IntervalId) => void;
}

export interface UsageRuntime {
  refresh: () => Promise<UsageScanResult>;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
  getResult: () => UsageScanResult | undefined;
  subscribe: (listener: ResultListener) => () => void;
  subscribeCycle: (listener: CycleListener) => () => void;
  subscribeError: (listener: ErrorListener) => () => void;
  start: () => void;
  stop: () => void;
}

const subscribeTo = <Listener>(listeners: Set<Listener>, listener: Listener): (() => void) => {
  let subscribed = true;
  listeners.add(listener);

  return () => {
    if (!subscribed) {
      return;
    }

    listeners.delete(listener);
    subscribed = false;
  };
};

export const createUsageRuntime = <IntervalId>(
  dependencies: UsageRuntimeDependencies<IntervalId>
): UsageRuntime => {
  const resultListeners = new Set<ResultListener>();
  const cycleListeners = new Set<CycleListener>();
  const errorListeners = new Set<ErrorListener>();
  let lastResult: UsageScanResult | undefined;

  const scan = async (): Promise<UsageScanResult> => {
    const cycle = await dependencies.scanCycle();
    lastResult = cycle.result;

    for (const listener of cycleListeners) {
      await listener(cycle);
    }

    return cycle.result;
  };

  const monitor = createUsageMonitor({
    scan,
    onUpdate: (result) => {
      resultListeners.forEach((listener) => listener(result));
    },
    onError: (error) => {
      errorListeners.forEach((listener) => listener(error));
    },
    now: dependencies.now,
    setIntervalFn: dependencies.setIntervalFn,
    clearIntervalFn: dependencies.clearIntervalFn,
  });

  return {
    refresh: monitor.refresh,
    refreshOnFocus: monitor.refreshOnFocus,
    getResult: () => lastResult,
    subscribe: (listener) => subscribeTo(resultListeners, listener),
    subscribeCycle: (listener) => subscribeTo(cycleListeners, listener),
    subscribeError: (listener) => subscribeTo(errorListeners, listener),
    start: monitor.start,
    stop: monitor.stop,
  };
};
