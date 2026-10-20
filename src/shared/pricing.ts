/**
 * @file 模型价格与成本计算
 * @description
 * 合并默认价格和用户覆盖项，并按模型、会话及日期计算可追溯的成本估算。
 */
import type {
  CachedInputPricingRates,
  CostEstimate,
  DailyCostEstimate,
  ModelPricingEntry,
  ModelPricingOverride,
  UnknownModelPricing,
  UnknownModelPricingInput,
} from './budgetTypes';
import type { UsageSession, UsageSlice, UsageSummary } from './usageTypes';
import {
  evaluateConditionalUsage,
  type ConditionalCostBreakdown,
  type ConditionalCostResult,
} from './conditionalPricing';
import type { PriceableUsage, ConditionalPricingFields } from './conditionalPricingTypes';

const UNKNOWN_MODEL_ID = 'Unknown model';
const DATE_PART_LENGTH = 2;

export interface PricingContext {
  pricingById: Map<string, ModelPricingEntry>;
  unknownModelPricing?: UnknownModelPricingInput;
}

export type UsagePricingResult =
  | ({
      kind: 'exact' | 'partial';
      costUsd: number;
      pricing: ModelPricingEntry;
    } & ConditionalCostResult)
  | { kind: 'assumed'; costUsd: number; pricing: UnknownModelPricingInput }
  | { kind: 'unpriced'; costUsd: 0 };

export type UsageCostBreakdown = ConditionalCostBreakdown;

export const normalizeModelId = (modelId: string): string =>
  modelId.trim().toLocaleLowerCase('en-US');

const toOverrideEntry = (
  override: ModelPricingOverride,
  base?: ModelPricingEntry
): ModelPricingEntry => {
  const { updatedAt, ...pricing } = override;

  return {
    modelId: pricing.modelId,
    aliases: [...pricing.aliases],
    inputUsdPerMillion: pricing.inputUsdPerMillion,
    cachedInputUsdPerMillion: pricing.cachedInputUsdPerMillion,
    outputUsdPerMillion: pricing.outputUsdPerMillion,
    ...(pricing.useCatalogConditions ? { useCatalogConditions: true } : {}),
    effectiveAt: updatedAt,
    sourceKind: 'override',
    ...(!override.useCatalogConditions ? { manualFlat: true } : {}),
    ...(base?.sourceUrl ? { sourceUrl: base.sourceUrl } : {}),
    ...(base?.conditions ? { availableConditions: base.conditions } : {}),
    ...(override.useCatalogConditions
      ? base?.conditions
        ? { conditions: base.conditions }
        : { rulesStatus: 'unavailable' as const }
      : {}),
  };
};

export const mergeModelPricing = (
  defaults: ModelPricingEntry[],
  overrides: ModelPricingOverride[]
): ModelPricingEntry[] => {
  const overridesById = new Map(
    overrides.map((override) => [normalizeModelId(override.modelId), override])
  );
  const defaultIds = new Set(defaults.map(({ modelId }) => normalizeModelId(modelId)));
  const mergedDefaults = defaults.map((entry) => {
    const override = overridesById.get(normalizeModelId(entry.modelId));
    return override ? toOverrideEntry(override, entry) : entry;
  });
  const customEntries = overrides
    .filter(({ modelId }) => !defaultIds.has(normalizeModelId(modelId)))
    .map((override) => toOverrideEntry(override));

  return [...mergedDefaults, ...customEntries];
};

const buildPricingIndex = (pricingEntries: ModelPricingEntry[]): Map<string, ModelPricingEntry> => {
  const index = new Map<string, ModelPricingEntry>();

  // 用户显式指定的别名必须优先于目录更新新增的同名模型，不能因目录顺序改变估算假设。
  const orderedEntries = [
    ...pricingEntries.filter((entry) => entry.sourceKind !== 'override'),
    ...pricingEntries.filter((entry) => entry.sourceKind === 'override'),
  ];
  orderedEntries.forEach((entry) => {
    [entry.modelId, ...entry.aliases].forEach((modelId) => {
      const normalizedModelId = normalizeModelId(modelId);

      if (normalizedModelId) {
        index.set(normalizedModelId, entry);
      }
    });
  });

  return index;
};

export const createPricingContext = (
  pricingEntries: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricingInput
): PricingContext => ({
  pricingById: buildPricingIndex(pricingEntries),
  ...(unknownModelPricing ? { unknownModelPricing } : {}),
});

const requireCompleteCost = (
  usage: PriceableUsage,
  pricing: CachedInputPricingRates & ConditionalPricingFields
): ConditionalCostResult => {
  const result = evaluateConditionalUsage(usage, pricing);
  // 数值入口无法携带未计价证据；需要已知部分费用的调用方必须使用结构化结果。
  if (result.unpricedTokens > 0) {
    throw new TypeError('Incomplete pricing requires a structured cost result.');
  }
  return result;
};

export const calculateUsageCostBreakdown = (
  usage: PriceableUsage,
  pricing: CachedInputPricingRates & ConditionalPricingFields
): UsageCostBreakdown => requireCompleteCost(usage, pricing).breakdown;

export const calculateUsageCost = (
  usage: PriceableUsage,
  pricing: CachedInputPricingRates & ConditionalPricingFields
): number => requireCompleteCost(usage, pricing).costUsd;

export const priceTokenUsage = (
  usage: PriceableUsage,
  modelId: string | undefined,
  context: PricingContext
): UsagePricingResult => {
  const trimmedModelId = modelId?.trim();

  if (trimmedModelId) {
    const pricing = context.pricingById.get(normalizeModelId(trimmedModelId));
    if (!pricing) {
      return { kind: 'unpriced', costUsd: 0 };
    }
    const result = evaluateConditionalUsage(usage, pricing);
    return { kind: result.unpricedTokens > 0 ? 'partial' : 'exact', ...result, pricing };
  }

  return context.unknownModelPricing
    ? {
        kind: 'assumed',
        costUsd: calculateUsageCost(usage, context.unknownModelPricing),
        pricing: context.unknownModelPricing,
      }
    : { kind: 'unpriced', costUsd: 0 };
};

const appendUniqueModelId = (modelIds: string[], modelId: string | undefined): string[] => {
  const displayModelId = modelId?.trim() || UNKNOWN_MODEL_ID;
  const normalizedModelId = normalizeModelId(displayModelId);
  const modelIsKnown = modelIds.some(
    (existingModelId) => normalizeModelId(existingModelId) === normalizedModelId
  );

  return modelIsKnown ? modelIds : [...modelIds, displayModelId];
};

export const calculateEstimatedCost = (
  slices: UsageSlice[],
  pricingEntries: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricing
): CostEstimate => {
  const context = createPricingContext(pricingEntries, unknownModelPricing);
  return calculateEstimatedCostWithContext(slices, context);
};

const calculateEstimatedCostWithContext = (
  slices: UsageSlice[],
  context: PricingContext
): CostEstimate => {
  return slices.reduce<CostEstimate>(
    (estimate, slice) =>
      appendCostEstimate(estimate, slice, priceTokenUsage(slice, slice.modelId, context)),
    createEmptyCostEstimate()
  );
};

const createEmptyCostEstimate = (): CostEstimate => ({
  pricedCostUsd: 0,
  assumedCostUsd: 0,
  assumedTokens: 0,
  unpricedTokens: 0,
  unpricedModelIds: [],
});

const appendCostEstimate = (
  estimate: CostEstimate,
  slice: UsageSlice,
  pricingResult: UsagePricingResult
): CostEstimate => {
  if (pricingResult.kind === 'unpriced') {
    return {
      ...estimate,
      unpricedTokens: estimate.unpricedTokens + slice.totalTokens,
      unpricedModelIds: appendUniqueModelId(estimate.unpricedModelIds, slice.modelId),
    };
  }

  const hasModelPricing = pricingResult.kind !== 'assumed';
  const unpricedTokens = hasModelPricing ? pricingResult.unpricedTokens : 0;
  return {
    ...estimate,
    pricedCostUsd: estimate.pricedCostUsd + pricingResult.costUsd,
    ...(hasModelPricing && pricingResult.conditionAssumedTokens > 0
      ? {
          conditionAssumedTokens:
            (estimate.conditionAssumedTokens ?? 0) + (pricingResult.conditionAssumedTokens ?? 0),
          conditionAssumedCostUsd:
            (estimate.conditionAssumedCostUsd ?? 0) + (pricingResult.conditionAssumedCostUsd ?? 0),
        }
      : {}),
    ...(hasModelPricing && pricingResult.issues.length > 0
      ? {
          pricingIssues: [...new Set([...(estimate.pricingIssues ?? []), ...pricingResult.issues])],
        }
      : {}),
    unpricedTokens: estimate.unpricedTokens + unpricedTokens,
    unpricedModelIds:
      unpricedTokens > 0
        ? appendUniqueModelId(estimate.unpricedModelIds, slice.modelId)
        : estimate.unpricedModelIds,
    assumedCostUsd:
      estimate.assumedCostUsd + (pricingResult.kind === 'assumed' ? pricingResult.costUsd : 0),
    assumedTokens:
      estimate.assumedTokens + (pricingResult.kind === 'assumed' ? slice.totalTokens : 0),
  };
};

export const getSessionUsageSlices = (session: UsageSession): UsageSlice[] => {
  if (session.usageSlices.length > 0) {
    return session.usageSlices;
  }

  return session.totalTokens > 0
    ? [
        {
          occurredAt: session.endedAt,
          inputTokens: session.inputTokens,
          cachedInputTokens: session.cachedInputTokens,
          outputTokens: session.outputTokens,
          reasoningOutputTokens: session.reasoningOutputTokens,
          totalTokens: session.totalTokens,
        },
      ]
    : [];
};

export const getSummaryCostEstimate = (
  summary: UsageSummary,
  pricingEntries: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricing
): CostEstimate =>
  calculateEstimatedCost(
    summary.sessions.flatMap(getSessionUsageSlices),
    pricingEntries,
    unknownModelPricing
  );

const toLocalDateKey = (timestamp: string): string | undefined => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  const month = String(date.getMonth() + 1).padStart(DATE_PART_LENGTH, '0');
  const day = String(date.getDate()).padStart(DATE_PART_LENGTH, '0');

  return `${date.getFullYear()}-${month}-${day}`;
};

export const buildDailyCostEstimates = (
  sessions: UsageSession[],
  pricingEntries: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricing
): DailyCostEstimate[] => {
  const slicesByDate = new Map<string, UsageSlice[]>();
  // 同一次汇总使用相同价格快照；索引仅在本次调用内复用，下一次调用重新读取价格。
  const context = createPricingContext(pricingEntries, unknownModelPricing);

  sessions.flatMap(getSessionUsageSlices).forEach((slice) => {
    const date = toLocalDateKey(slice.occurredAt);

    if (!date) {
      return;
    }

    const dateSlices = slicesByDate.get(date) ?? [];
    dateSlices.push(slice);
    slicesByDate.set(date, dateSlices);
  });

  return [...slicesByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, slices]) => ({
      date,
      ...calculateEstimatedCostWithContext(slices, context),
    }));
};

export const buildOverviewCostEstimates = (
  sessions: UsageSession[],
  pricingEntries: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricing
): { totalCost: CostEstimate; dailyCosts: Map<string, CostEstimate> } => {
  const context = createPricingContext(pricingEntries, unknownModelPricing);
  let totalCost = createEmptyCostEstimate();
  const dailyCosts = new Map<string, CostEstimate>();

  // 每条用量只执行一次条件计价，分别按原始顺序累加，保持总计和每日金额的浮点求和顺序。
  for (const session of sessions) {
    for (const slice of getSessionUsageSlices(session)) {
      const result = priceTokenUsage(slice, slice.modelId, context);
      totalCost = appendCostEstimate(totalCost, slice, result);
      const date = toLocalDateKey(slice.occurredAt);
      // 无效日期仍计入总费用，但不能归属到任何自然日。
      if (date) {
        dailyCosts.set(
          date,
          appendCostEstimate(dailyCosts.get(date) ?? createEmptyCostEstimate(), slice, result)
        );
      }
    }
  }

  return { totalCost, dailyCosts };
};
