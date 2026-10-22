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
  scanCycle: (sessionsDir: string) => Promise<UsageScanCycle>;
  initialSessionsDir: string;
  now: () => number;
  setIntervalFn: (callback: () => void, delay: number) => IntervalId;
  clearIntervalFn: (intervalId: IntervalId) => void;
  subscribeExternalCycle?: (listener: (cycle: UsageScanCycle) => void) => () => void;
  onDirectoryChange?: (sessionsDir: string) => void;
  onStop?: () => void;
  drainExternal?: () => Promise<void>;
}

export interface UsageRuntime {
  getInitialUsage: () => Promise<UsageScanResult>;
  refresh: () => Promise<UsageScanResult>;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
  updateSessionsDir: (sessionsDir: string) => Promise<UsageScanResult>;
  getResult: () => UsageScanResult | undefined;
  subscribe: (listener: ResultListener) => () => void;
  subscribeCycle: (listener: CycleListener) => () => void;
  subscribeError: (listener: ErrorListener) => () => void;
  start: () => void;
  stop: () => void;
  pause: () => () => void;
  drain: () => Promise<void>;
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
  // 合并服务按提交顺序递增序号；外部推送和扫描 Promise 返回可能交错，旧周期不得倒退快照。
  let lastSequence = Number.NEGATIVE_INFINITY;
  let lastNotifiedResult: UsageScanResult | undefined;
  let sessionsDir = dependencies.initialSessionsDir;

  const acceptCycle = (cycle: UsageScanCycle): UsageScanResult => {
    if (cycle.sequence !== undefined && cycle.sequence <= lastSequence && lastResult) {
      return lastResult;
    }
    lastSequence = cycle.sequence ?? lastSequence;
    lastResult = cycle.result;

    cycleListeners.forEach((listener) => {
      void Promise.resolve()
        .then(() => listener(cycle))
        .catch((error: unknown) => {
          errorListeners.forEach((errorListener) => errorListener(error));
        });
    });

    return cycle.result;
  };

  const scan = async (): Promise<UsageScanResult> =>
    acceptCycle(await dependencies.scanCycle(sessionsDir));

  const notifyResult = (result: UsageScanResult): void => {
    if (lastNotifiedResult === result) {
      return;
    }
    lastNotifiedResult = result;
    resultListeners.forEach((listener) => listener(result));
  };

  // 合并服务的同步发布与扫描返回共用序号，手动导入沿同一链路更新结果和派生分析。
  const unsubscribeExternal = dependencies.subscribeExternalCycle?.((cycle) => {
    if (cycle.result.sessionsDir !== sessionsDir) {
      return;
    }
    const result = acceptCycle(cycle);
    notifyResult(result);
  });

  const monitor = createUsageMonitor({
    scan,
    onUpdate: notifyResult,
    onError: (error) => {
      errorListeners.forEach((listener) => listener(error));
    },
    now: dependencies.now,
    setIntervalFn: dependencies.setIntervalFn,
    clearIntervalFn: dependencies.clearIntervalFn,
  });

  return {
    getInitialUsage: () => (lastResult ? Promise.resolve(lastResult) : monitor.refresh()),
    refresh: monitor.refresh,
    refreshOnFocus: monitor.refreshOnFocus,
    updateSessionsDir: (nextSessionsDir) => {
      sessionsDir = nextSessionsDir;
      dependencies.onDirectoryChange?.(nextSessionsDir);
      return monitor.refreshAfterCurrent();
    },
    getResult: () => lastResult,
    subscribe: (listener) => subscribeTo(resultListeners, listener),
    subscribeCycle: (listener) => subscribeTo(cycleListeners, listener),
    subscribeError: (listener) => subscribeTo(errorListeners, listener),
    start: monitor.start,
    pause: monitor.pause,
    drain: async () => {
      const results = await Promise.allSettled([monitor.drain(), dependencies.drainExternal?.()]);
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected') {
        throw failure.reason;
      }
    },
    stop: () => {
      monitor.stop();
      unsubscribeExternal?.();
      dependencies.onStop?.();
    },
  };
};
