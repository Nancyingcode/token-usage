/**
 * @file 应用运行时
 * @description
 * 统一协调一次用量扫描，并按预算、成本预算上下文、成本用量的顺序分发结果。
 */
import type { BudgetSnapshot } from '../shared/budgetTypes';
import type { UsageScanResult } from '../shared/usageTypes';
import type { BudgetRuntime } from './budgetRuntime';
import type { CostOptimizationRuntime } from './costOptimizationRuntime';
import type { UsageRuntime } from './usageRuntime';
import type { UsageScanCycle } from './usageScanner';

export interface ApplicationRuntimeDependencies {
  usageRuntime: UsageRuntime;
  budgetRuntime: BudgetRuntime;
  costRuntime: CostOptimizationRuntime;
}

export interface ApplicationRuntime {
  initialize: (costStartup?: 'immediate' | 'after-initial-usage') => Promise<void>;
  getInitialUsage: () => Promise<UsageScanResult>;
  waitForCostOptimization: () => Promise<void>;
  refresh: () => Promise<UsageScanResult>;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
  start: () => void;
  stop: () => void;
  pause: () => () => void;
  drain: () => Promise<void>;
}

export const createApplicationRuntime = (
  dependencies: ApplicationRuntimeDependencies
): ApplicationRuntime => {
  const unsubscribeListeners: Array<() => void> = [];
  let initialized = false;
  // 每次 stop 结束本轮生命周期，延迟的窗口回调和队列不得在退出后发起成本工作。
  let lifecycle = new AbortController();
  // 应用运行时拥有该队列；每个用量周期按到达顺序追加，stop 后不再接收新任务。
  let analysisQueue: Promise<void> = Promise.resolve();
  // 成本运行时由应用运行时初始化一次；概览不等待，成本 IPC 与后台成本分析共享该屏障。
  let costInitialization: Promise<void> | undefined;
  let releaseCostStartup: (() => void) | undefined;
  let initialUsageRequested = false;
  // 安装准备保留既有订阅直至写入完成；暂停令牌只控制生产者，不把队列重置当作排空。
  let pauseDepth = 0;
  let preparationFailure: { error: unknown } | undefined;
  const pendingBudgetUpdates = new Set<Promise<void>>();

  const recordPreparationFailure = (error: unknown): void => {
    if (pauseDepth > 0) {
      preparationFailure ??= { error };
    }
  };

  const markAnalysisStale = (error: unknown): void => {
    dependencies.budgetRuntime.markUsageStale(error);
    dependencies.costRuntime.markStale(error);
  };

  const startDeferredCosts = (): void => {
    releaseCostStartup?.();
    releaseCostStartup = undefined;
  };

  const getInitialUsage = async (): Promise<UsageScanResult> => {
    const release = releaseCostStartup;
    if (!release || initialUsageRequested) return dependencies.usageRuntime.getInitialUsage();
    initialUsageRequested = true;
    try {
      return await dependencies.usageRuntime.getInitialUsage();
    } finally {
      // 让 Electron 先发送本轮用量或错误，再开始读取和校验成本缓存。
      setImmediate(() => {
        if (release === releaseCostStartup) startDeferredCosts();
      });
    }
  };

  const processUsageCycle = async (cycle: UsageScanCycle, signal: AbortSignal): Promise<void> => {
    if (signal.aborted) return;
    const costsReady = costInitialization;
    let budgetSnapshot: BudgetSnapshot;

    try {
      budgetSnapshot = await dependencies.budgetRuntime.applyUsageResult(cycle.result);
    } catch (error) {
      if (signal.aborted) return;
      recordPreparationFailure(error);
      markAnalysisStale(error);
      return;
    }

    try {
      await costsReady;
      if (signal.aborted) return;
      await dependencies.costRuntime.applyBudgetSnapshot(budgetSnapshot);
      if (!signal.aborted) await dependencies.costRuntime.applyUsageCycle(cycle);
    } catch (error) {
      if (signal.aborted) return;
      recordPreparationFailure(error);
      dependencies.costRuntime.markStale(error);
    }
  };

  const initialize: ApplicationRuntime['initialize'] = async (costStartup = 'immediate') => {
    if (initialized) {
      return;
    }

    const { signal } = lifecycle;
    await dependencies.budgetRuntime.initialize();
    if (signal.aborted || initialized) return;
    const initializeCosts = async (): Promise<void> => {
      if (signal.aborted) return;
      await dependencies.costRuntime.initialize();
      if (!signal.aborted) {
        await dependencies.costRuntime.applyBudgetSnapshot(
          dependencies.budgetRuntime.getSnapshot()
        );
      }
    };
    if (costStartup === 'after-initial-usage') {
      initialUsageRequested = false;
      costInitialization = new Promise<void>((resolve) => {
        releaseCostStartup = resolve;
      }).then(initializeCosts);
    } else {
      costInitialization = initializeCosts();
    }
    void costInitialization.catch(() => undefined);

    let sawFirstScan = false;
    const onScanAttempt = (): void => {
      if (signal.aborted || initialUsageRequested || !releaseCostStartup) return;
      // Renderer 可能直接采用首轮推送。后续扫描到达时必须放行队首等待成本的周期。
      if (sawFirstScan) startDeferredCosts();
      sawFirstScan = true;
    };
    unsubscribeListeners.push(
      dependencies.usageRuntime.subscribeCycle((cycle) => {
        onScanAttempt();
        analysisQueue = analysisQueue
          .then(() => processUsageCycle(cycle, signal))
          .catch((error: unknown) => {
            if (!signal.aborted) markAnalysisStale(error);
          });
      }),
      dependencies.usageRuntime.subscribeError((error) => {
        onScanAttempt();
        dependencies.budgetRuntime.markUsageStale(error);
        dependencies.costRuntime.markStale(error);
      }),
      dependencies.budgetRuntime.subscribe((snapshot) => {
        const pending = (costInitialization ?? Promise.resolve())
          .then(async () => {
            if (!signal.aborted) await dependencies.costRuntime.applyBudgetSnapshot(snapshot);
          })
          .catch((error: unknown) => {
            if (signal.aborted) return;
            recordPreparationFailure(error);
            dependencies.costRuntime.markStale(error);
          });
        pendingBudgetUpdates.add(pending);
        void pending.finally(() => pendingBudgetUpdates.delete(pending));
      })
    );
    initialized = true;
  };

  const stop = (): void => {
    dependencies.usageRuntime.stop();
    lifecycle.abort();
    lifecycle = new AbortController();
    startDeferredCosts();
    unsubscribeListeners.splice(0).forEach((unsubscribe) => unsubscribe());
    analysisQueue = Promise.resolve();
    costInitialization = undefined;
    initialized = false;
  };

  const waitForCostOptimization = (): Promise<void> => {
    startDeferredCosts();
    return costInitialization ?? Promise.resolve();
  };

  const pause = (): (() => void) => {
    const restoreUsage = dependencies.usageRuntime.pause();
    if (pauseDepth === 0) {
      preparationFailure = undefined;
    }
    pauseDepth += 1;
    let restored = false;
    return () => {
      if (restored) {
        return;
      }
      restored = true;
      pauseDepth -= 1;
      if (pauseDepth === 0) {
        preparationFailure = undefined;
      }
      restoreUsage();
    };
  };

  const drain = async (): Promise<void> => {
    const producers = await Promise.allSettled([
      dependencies.usageRuntime.drain(),
      waitForCostOptimization(),
    ]);
    const failedProducer = producers.find((result) => result.status === 'rejected');
    await analysisQueue;
    while (pendingBudgetUpdates.size > 0) {
      await Promise.all([...pendingBudgetUpdates]);
    }
    if (failedProducer?.status === 'rejected') {
      throw failedProducer.reason;
    }
    if (preparationFailure) {
      throw preparationFailure.error;
    }
  };

  return {
    initialize,
    getInitialUsage,
    waitForCostOptimization,
    refresh: dependencies.usageRuntime.refresh,
    refreshOnFocus: dependencies.usageRuntime.refreshOnFocus,
    start: dependencies.usageRuntime.start,
    pause,
    drain,
    stop,
  };
};
