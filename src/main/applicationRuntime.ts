/**
 * @file 应用运行时
 * @description
 * 统一协调一次用量扫描，并按预算、成本预算上下文、成本用量的顺序分发结果。
 */
import type { UsageScanResult } from '../shared/usageTypes';
import type { BudgetRuntime } from './budgetRuntime';
import type { CostOptimizationRuntime } from './costOptimizationRuntime';
import type { UsageRuntime } from './usageRuntime';

export interface ApplicationRuntimeDependencies {
  usageRuntime: UsageRuntime;
  budgetRuntime: BudgetRuntime;
  costRuntime: CostOptimizationRuntime;
}

export interface ApplicationRuntime {
  initialize: () => Promise<void>;
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

  const initialize = async (): Promise<void> => {
    if (initialized) {
      return;
    }

    await dependencies.budgetRuntime.initialize();
    await dependencies.costRuntime.initialize();
    await dependencies.costRuntime.applyBudgetSnapshot(dependencies.budgetRuntime.getSnapshot());

    unsubscribeListeners.push(
      dependencies.usageRuntime.subscribeCycle(async (cycle) => {
        const budgetSnapshot = await dependencies.budgetRuntime.applyUsageResult(cycle.result);
        await dependencies.costRuntime.applyBudgetSnapshot(budgetSnapshot);
        await dependencies.costRuntime.applyUsageCycle(cycle);
      }),
      dependencies.usageRuntime.subscribeError((error) => {
        dependencies.budgetRuntime.markUsageStale(error);
        dependencies.costRuntime.markStale(error);
      }),
      dependencies.budgetRuntime.subscribe((snapshot) => {
        void dependencies.costRuntime.applyBudgetSnapshot(snapshot).catch(() => undefined);
      })
    );
    initialized = true;
  };

  const stop = (): void => {
    dependencies.usageRuntime.stop();
    unsubscribeListeners.splice(0).forEach((unsubscribe) => unsubscribe());
    initialized = false;
  };

  return {
    initialize,
    refresh: dependencies.usageRuntime.refresh,
    refreshOnFocus: dependencies.usageRuntime.refreshOnFocus,
    start: dependencies.usageRuntime.start,
    stop,
  };
};
