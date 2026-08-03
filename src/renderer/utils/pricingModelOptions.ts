/**
 * @file 模型价格候选构建
 * @description
 * 合并当前价格与未计价模型摘要，为新增价格组合框生成去重且稳定排序的候选。
 */
import type { ModelPricingEntry, UnpricedModelSummary } from '../../shared/budgetTypes';
import { normalizeModelId } from '../../shared/pricing';

export type PricingModelOption =
  | {
      kind: 'model';
      key: string;
      modelId: string;
      pricingState: 'priced' | 'unpriced';
    }
  | { kind: 'unknown'; key: 'unknown'; disabled: true };

const compareModelIds = (first: string, second: string): number =>
  normalizeModelId(first).localeCompare(normalizeModelId(second));

const toModelOptions = (
  modelIds: string[],
  pricingState: 'priced' | 'unpriced'
): PricingModelOption[] =>
  modelIds.sort(compareModelIds).map((modelId) => ({
    kind: 'model',
    key: `model:${normalizeModelId(modelId)}`,
    modelId,
    pricingState,
  }));

export const buildPricingModelOptions = (
  pricing: ModelPricingEntry[],
  unpricedModels: UnpricedModelSummary[]
): PricingModelOption[] => {
  const pricedIds = new Map<string, string>();

  pricing.forEach(({ modelId }) => {
    const displayId = modelId.trim();
    const key = normalizeModelId(displayId);

    if (key && !pricedIds.has(key)) {
      pricedIds.set(key, displayId);
    }
  });

  const unpricedIds = new Map<string, string>();
  let hasUnknownModel = false;

  unpricedModels.forEach(({ modelId }) => {
    const displayId = modelId?.trim() ?? '';
    const key = normalizeModelId(displayId);

    if (!key) {
      hasUnknownModel = true;
      return;
    }

    if (!pricedIds.has(key) && !unpricedIds.has(key)) {
      unpricedIds.set(key, displayId);
    }
  });

  return [
    ...(hasUnknownModel ? ([{ kind: 'unknown', key: 'unknown', disabled: true }] as const) : []),
    ...toModelOptions([...pricedIds.values()], 'priced'),
    ...toModelOptions([...unpricedIds.values()], 'unpriced'),
  ];
};
