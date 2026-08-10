/**
 * @file 预算模型目标解析
 * @description 规范化全部、未知和指定模型目标，并根据定价别名解析稳定目标键。
 */
import type { BudgetModelTarget, ModelPricingEntry } from './budgetTypes';
import { normalizeModelId } from './pricing';

const ALL_TARGET_KEY = 'all';
const UNKNOWN_TARGET_KEY = 'unknown';
const MODEL_TARGET_PREFIX = 'model:';

const findPricing = (
  modelId: string,
  pricing: ModelPricingEntry[]
): ModelPricingEntry | undefined => {
  const key = normalizeModelId(modelId);

  return pricing.find((entry) =>
    [entry.modelId, ...entry.aliases].some((candidate) => normalizeModelId(candidate) === key)
  );
};

export const getBudgetModelTargetKey = (target: BudgetModelTarget): string => {
  if (target.kind === 'all') {
    return ALL_TARGET_KEY;
  }

  if (target.kind === 'unknown') {
    return UNKNOWN_TARGET_KEY;
  }

  return `${MODEL_TARGET_PREFIX}${normalizeModelId(target.modelId)}`;
};

export const resolveBudgetModelTarget = (
  target: BudgetModelTarget,
  pricing: ModelPricingEntry[]
): BudgetModelTarget => {
  if (target.kind !== 'model') {
    return { ...target };
  }

  const modelId = target.modelId.trim();
  const entry = findPricing(modelId, pricing);

  return { kind: 'model', modelId: entry?.modelId ?? modelId };
};

export const matchesBudgetModelTarget = (
  modelId: string | undefined,
  target: BudgetModelTarget,
  pricing: ModelPricingEntry[]
): boolean => {
  const candidateKey = normalizeModelId(modelId ?? '');

  if (target.kind === 'all') {
    return true;
  }

  if (target.kind === 'unknown') {
    return candidateKey.length === 0;
  }

  const entry = findPricing(target.modelId, pricing);
  const acceptedIds = entry ? [entry.modelId, ...entry.aliases] : [target.modelId];

  return acceptedIds.some((accepted) => normalizeModelId(accepted) === candidateKey);
};
