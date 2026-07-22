import type {
  CostEstimate,
  DailyCostEstimate,
  ModelPricingEntry,
  ModelPricingOverride,
} from './budgetTypes';
import type { UsageSession, UsageSlice, UsageSummary } from './usageTypes';

const TOKENS_PER_MILLION = 1_000_000;
const UNKNOWN_MODEL_ID = 'Unknown model';
const DATE_PART_LENGTH = 2;

const normalizeModelId = (modelId: string): string => modelId.trim().toLocaleLowerCase('en-US');

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
  pricingEntries: ModelPricingEntry[]
): CostEstimate => {
  const pricingById = buildPricingIndex(pricingEntries);

  return slices.reduce<CostEstimate>(
    (estimate, slice) => {
      const modelKey = slice.modelId ? normalizeModelId(slice.modelId) : undefined;
      const modelPricing = modelKey ? pricingById.get(modelKey) : undefined;

      if (!modelPricing) {
        return {
          pricedCostUsd: estimate.pricedCostUsd,
          unpricedTokens: estimate.unpricedTokens + slice.totalTokens,
          unpricedModelIds: appendUniqueModelId(estimate.unpricedModelIds, slice.modelId),
        };
      }

      const regularInputTokens = Math.max(slice.inputTokens - slice.cachedInputTokens, 0);
      const pricedCostUsd =
        (regularInputTokens * modelPricing.inputUsdPerMillion +
          slice.cachedInputTokens * modelPricing.cachedInputUsdPerMillion +
          slice.outputTokens * modelPricing.outputUsdPerMillion) /
        TOKENS_PER_MILLION;

      return {
        ...estimate,
        pricedCostUsd: estimate.pricedCostUsd + pricedCostUsd,
      };
    },
    { pricedCostUsd: 0, unpricedTokens: 0, unpricedModelIds: [] }
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
  pricingEntries: ModelPricingEntry[]
): CostEstimate =>
  calculateEstimatedCost(summary.sessions.flatMap(getSessionUsageSlices), pricingEntries);

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
  pricingEntries: ModelPricingEntry[]
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
    .map(([date, slices]) => ({ date, ...calculateEstimatedCost(slices, pricingEntries) }));
};
