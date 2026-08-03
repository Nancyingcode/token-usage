/**
 * @file 模型价格与成本计算
 * @description
 * 合并默认价格和用户覆盖项，并按模型、会话及日期计算可追溯的成本估算。
 */
import type {
  CostEstimate,
  DailyCostEstimate,
  ModelPricingEntry,
  ModelPricingOverride,
  UnknownModelPricing,
  UnknownModelPricingInput,
} from './budgetTypes';
import type { TokenUsage, UsageSession, UsageSlice, UsageSummary } from './usageTypes';

const TOKENS_PER_MILLION = 1_000_000;
const UNKNOWN_MODEL_ID = 'Unknown model';
const DATE_PART_LENGTH = 2;

export interface PricingContext {
  pricingById: Map<string, ModelPricingEntry>;
  unknownModelPricing?: UnknownModelPricingInput;
}

export type UsagePricingResult =
  | { kind: 'exact'; costUsd: number; pricing: ModelPricingEntry }
  | { kind: 'assumed'; costUsd: number; pricing: UnknownModelPricingInput }
  | { kind: 'unpriced'; costUsd: 0 };

export const normalizeModelId = (modelId: string): string =>
  modelId.trim().toLocaleLowerCase('en-US');

const toOverrideEntry = (override: ModelPricingOverride, sourceUrl?: string): ModelPricingEntry => {
  const { updatedAt, ...pricing } = override;

  return {
    ...pricing,
    effectiveAt: updatedAt,
    sourceKind: 'override',
    ...(sourceUrl ? { sourceUrl } : {}),
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
    return override ? toOverrideEntry(override, entry.sourceUrl) : entry;
  });
  const customEntries = overrides
    .filter(({ modelId }) => !defaultIds.has(normalizeModelId(modelId)))
    .map((override) => toOverrideEntry(override));

  return [...mergedDefaults, ...customEntries];
};

const buildPricingIndex = (pricingEntries: ModelPricingEntry[]): Map<string, ModelPricingEntry> => {
  const index = new Map<string, ModelPricingEntry>();

  pricingEntries.forEach((entry) => {
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

export const calculateUsageCost = (
  usage: TokenUsage,
  pricing: UnknownModelPricingInput
): number => {
  const regularInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);

  return (
    (regularInputTokens * pricing.inputUsdPerMillion +
      usage.cachedInputTokens * pricing.cachedInputUsdPerMillion +
      usage.outputTokens * pricing.outputUsdPerMillion) /
    TOKENS_PER_MILLION
  );
};

export const priceTokenUsage = (
  usage: TokenUsage,
  modelId: string | undefined,
  context: PricingContext
): UsagePricingResult => {
  const trimmedModelId = modelId?.trim();

  if (trimmedModelId) {
    const pricing = context.pricingById.get(normalizeModelId(trimmedModelId));
    return pricing
      ? { kind: 'exact', costUsd: calculateUsageCost(usage, pricing), pricing }
      : { kind: 'unpriced', costUsd: 0 };
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

  return slices.reduce<CostEstimate>(
    (estimate, slice) => {
      const pricingResult = priceTokenUsage(slice, slice.modelId, context);

      if (pricingResult.kind === 'unpriced') {
        return {
          ...estimate,
          unpricedTokens: estimate.unpricedTokens + slice.totalTokens,
          unpricedModelIds: appendUniqueModelId(estimate.unpricedModelIds, slice.modelId),
        };
      }

      return {
        ...estimate,
        pricedCostUsd: estimate.pricedCostUsd + pricingResult.costUsd,
        assumedCostUsd:
          estimate.assumedCostUsd + (pricingResult.kind === 'assumed' ? pricingResult.costUsd : 0),
        assumedTokens:
          estimate.assumedTokens + (pricingResult.kind === 'assumed' ? slice.totalTokens : 0),
      };
    },
    {
      pricedCostUsd: 0,
      assumedCostUsd: 0,
      assumedTokens: 0,
      unpricedTokens: 0,
      unpricedModelIds: [],
    }
  );
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
      ...calculateEstimatedCost(slices, pricingEntries, unknownModelPricing),
    }));
};
