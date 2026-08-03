import { getBudgetModelTargetKey } from '../../shared/budgetModelTarget';
import type {
  BudgetModelTarget,
  ModelPricingEntry,
  UnpricedModelSummary,
} from '../../shared/budgetTypes';
import { normalizeModelId } from '../../shared/pricing';

export interface BudgetModelOption {
  key: string;
  target: BudgetModelTarget;
}

const compareModelIds = (first: string, second: string): number =>
  normalizeModelId(first).localeCompare(normalizeModelId(second));

const toModelOptions = (modelIds: string[]): BudgetModelOption[] =>
  modelIds.sort(compareModelIds).map((modelId) => {
    const target: BudgetModelTarget = { kind: 'model', modelId };

    return { key: getBudgetModelTargetKey(target), target };
  });

export const buildBudgetModelOptions = (
  pricing: ModelPricingEntry[],
  unpricedModels: UnpricedModelSummary[]
): BudgetModelOption[] => {
  const pricedIds = new Map<string, string>();

  pricing.forEach(({ modelId }) => {
    const displayId = modelId.trim();
    const key = normalizeModelId(displayId);

    if (key && !pricedIds.has(key)) {
      pricedIds.set(key, displayId);
    }
  });

  const unpricedIds = new Map<string, string>();

  unpricedModels.forEach(({ modelId }) => {
    const displayId = modelId?.trim() ?? '';
    const key = normalizeModelId(displayId);

    if (key && !pricedIds.has(key) && !unpricedIds.has(key)) {
      unpricedIds.set(key, displayId);
    }
  });

  return [
    { key: getBudgetModelTargetKey({ kind: 'all' }), target: { kind: 'all' } },
    { key: getBudgetModelTargetKey({ kind: 'unknown' }), target: { kind: 'unknown' } },
    ...toModelOptions([...pricedIds.values()]),
    ...toModelOptions([...unpricedIds.values()]),
  ];
};
