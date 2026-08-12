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
  initialize: () => Promise<void>;
  getInitialUsage: () => Promise<UsageScanResult>;
  waitForCostOptimization: () => Promise<void>;
  refresh: () => Promise<UsageScanResult>;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
  start: () => void;
  stop: () => void;
}

export const createApplicationRuntime = (
  dependencies: ApplicationRuntimeDependencies
): ApplicationRuntime => {
  const unsubscribeListeners: Array<() => void> = [];
  let initialized = false;
  let acceptingCycles = false;
  // 应用运行时拥有该队列；每个用量周期按到达顺序追加，stop 后不再接收新任务。
  let analysisQueue: Promise<void> = Promise.resolve();
  // 成本运行时由应用运行时初始化一次；概览不等待，成本 IPC 与后台成本分析共享该屏障。
  let costInitialization: Promise<void> | undefined;

  const markAnalysisStale = (error: unknown): void => {
    dependencies.budgetRuntime.markUsageStale(error);
    dependencies.costRuntime.markStale(error);
  };

  const processUsageCycle = async (cycle: UsageScanCycle): Promise<void> => {
    let budgetSnapshot: BudgetSnapshot;

    try {
      budgetSnapshot = await dependencies.budgetRuntime.applyUsageResult(cycle.result);
    } catch (error) {
      markAnalysisStale(error);
      return;
    }

    try {
      await costInitialization;
      await dependencies.costRuntime.applyBudgetSnapshot(budgetSnapshot);
      await dependencies.costRuntime.applyUsageCycle(cycle);
    } catch (error) {
      dependencies.costRuntime.markStale(error);
    }
  };

  const enqueueUsageCycle = (cycle: UsageScanCycle): void => {
    if (!acceptingCycles) {
      return;
    }

    analysisQueue = analysisQueue.then(() => processUsageCycle(cycle)).catch(markAnalysisStale);
  };

  const initialize = async (): Promise<void> => {
    if (initialized) {
      return;
    }

    await dependencies.budgetRuntime.initialize();
    costInitialization = dependencies.costRuntime.initialize().then(async () => {
      await dependencies.costRuntime.applyBudgetSnapshot(dependencies.budgetRuntime.getSnapshot());
    });
    void costInitialization.catch(() => undefined);
    acceptingCycles = true;

    unsubscribeListeners.push(
      dependencies.usageRuntime.subscribeCycle(enqueueUsageCycle),
      dependencies.usageRuntime.subscribeError((error) => {
        dependencies.budgetRuntime.markUsageStale(error);
        dependencies.costRuntime.markStale(error);
      }),
      dependencies.budgetRuntime.subscribe((snapshot) => {
        void (costInitialization ?? Promise.resolve())
          .then(() => dependencies.costRuntime.applyBudgetSnapshot(snapshot))
          .catch((error: unknown) => dependencies.costRuntime.markStale(error));
      })
    );
    initialized = true;
  };

  const stop = (): void => {
    dependencies.usageRuntime.stop();
    acceptingCycles = false;
    unsubscribeListeners.splice(0).forEach((unsubscribe) => unsubscribe());
    analysisQueue = Promise.resolve();
    costInitialization = undefined;
    initialized = false;
  };

  return {
    initialize,
    getInitialUsage: dependencies.usageRuntime.getInitialUsage,
    waitForCostOptimization: () => costInitialization ?? Promise.resolve(),
    refresh: dependencies.usageRuntime.refresh,
    refreshOnFocus: dependencies.usageRuntime.refreshOnFocus,
    start: dependencies.usageRuntime.start,
    stop,
  };
};
