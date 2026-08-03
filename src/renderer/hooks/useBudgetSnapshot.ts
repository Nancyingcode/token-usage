/**
 * @file 预算快照 Hook
 * @description
 * 通过预加载层订阅预算快照并封装预算写操作，统一维护加载和错误状态。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingOverrideInput,
  UnknownModelPricingInput,
} from '../../shared/budgetTypes';

export interface BudgetActions {
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  saveUnknownModelPricing: (input: UnknownModelPricingInput) => Promise<BudgetSnapshot>;
  deleteUnknownModelPricing: () => Promise<BudgetSnapshot>;
}

export interface UseBudgetSnapshotResult {
  snapshot: BudgetSnapshot | null;
  loading: boolean;
  error: string | null;
  actions: BudgetActions;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const useBudgetSnapshot = (): UseBudgetSnapshotResult => {
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.codexUsage.budgets.onUpdated((nextSnapshot) => {
      if (active) {
        setSnapshot(nextSnapshot);
        setError(null);
        setLoading(false);
      }
    });

    void window.codexUsage.budgets
      .getSnapshot()
      .then((nextSnapshot) => {
        if (active) {
          setSnapshot(nextSnapshot);
          setLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(getErrorMessage(loadError));
          setLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const applySnapshot = useCallback(async (operation: Promise<BudgetSnapshot>) => {
    const nextSnapshot = await operation;
    setSnapshot(nextSnapshot);
    return nextSnapshot;
  }, []);

  const actions = useMemo<BudgetActions>(
    () => ({
      savePolicy: (input) => applySnapshot(window.codexUsage.budgets.savePolicy(input)),
      deletePolicy: (id) => applySnapshot(window.codexUsage.budgets.deletePolicy(id)),
      updateThresholds: (input) => applySnapshot(window.codexUsage.budgets.updateThresholds(input)),
      savePricingOverride: (input) =>
        applySnapshot(window.codexUsage.budgets.savePricingOverride(input)),
      resetPricingOverride: (modelId) =>
        applySnapshot(window.codexUsage.budgets.resetPricingOverride(modelId)),
      saveUnknownModelPricing: (input) =>
        applySnapshot(window.codexUsage.budgets.saveUnknownModelPricing(input)),
      deleteUnknownModelPricing: () =>
        applySnapshot(window.codexUsage.budgets.deleteUnknownModelPricing()),
    }),
    [applySnapshot]
  );

  return { snapshot, loading, error, actions };
};
