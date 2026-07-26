/**
 * @file 成本优化定价分析
 * @description
 * 在查询范围内计算定价覆盖、模型实际费用与仅改变价格参数的替代场景。
 *
 * 约束：
 * - 未知模型不猜测价格
 * - 替代场景只重算相同 Token 构成，不表达能力、速度或质量等价
 */
import type { ModelPricingEntry } from './budgetTypes';
import type {
  CostOptimizationIndex,
  CostOptimizationQuery,
  IndexedUsageBucket,
  ModelCostRow,
  ModelSubstitutionScenario,
  PricingCoverage,
} from './costOptimizationTypes';
import type { RollingUsagePeriod, TokenUsage } from './usageTypes';

const TOKENS_PER_MILLION = 1_000_000;
const COMPLETE_PRICING_PERCENTAGE = 100;
const UNKNOWN_MODEL_ID = 'Unknown model';
const UNKNOWN_MODEL_KEY = 'unknown-model';
const DATE_PART_LENGTH = 2;
const PERIOD_DAY_COUNTS: Record<RollingUsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

interface PricedBucket {
  pricedCostUsd: number;
  pricedTokens: number;
  unpricedTokens: number;
  unpricedModelIds: string[];
}

interface ModelUsageGroup extends TokenUsage {
  modelId?: string;
  sessionIds: Set<string>;
  contributionIds: Set<string>;
}

const EMPTY_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const normalizeModelId = (modelId: string): string => modelId.trim().toLocaleLowerCase('en-US');

const getModelGroupKey = (modelId: string | undefined): string =>
  modelId ? normalizeModelId(modelId) : UNKNOWN_MODEL_KEY;

const buildPricingIndex = (pricingEntries: ModelPricingEntry[]): Map<string, ModelPricingEntry> => {
  const pricingById = new Map<string, ModelPricingEntry>();

  pricingEntries.forEach((entry) => {
    [entry.modelId, ...entry.aliases].forEach((modelId) => {
      const normalizedModelId = normalizeModelId(modelId);

      if (normalizedModelId) {
        pricingById.set(normalizedModelId, entry);
      }
    });
  });

  return pricingById;
};

const getBucketPricing = (
  bucket: IndexedUsageBucket,
  pricingById: Map<string, ModelPricingEntry>
): ModelPricingEntry | undefined =>
  bucket.modelId ? pricingById.get(normalizeModelId(bucket.modelId)) : undefined;

const getCostForPricing = (usage: TokenUsage, pricing: ModelPricingEntry): number => {
  const regularInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);

  return (
    (regularInputTokens * pricing.inputUsdPerMillion +
      usage.cachedInputTokens * pricing.cachedInputUsdPerMillion +
      usage.outputTokens * pricing.outputUsdPerMillion) /
    TOKENS_PER_MILLION
  );
};

const priceBucket = (
  bucket: IndexedUsageBucket,
  pricingById: Map<string, ModelPricingEntry>
): PricedBucket => {
  const pricing = getBucketPricing(bucket, pricingById);

  if (!pricing) {
    return {
      pricedCostUsd: 0,
      pricedTokens: 0,
      unpricedTokens: bucket.totalTokens,
      unpricedModelIds: [bucket.modelId?.trim() || UNKNOWN_MODEL_ID],
    };
  }

  return {
    pricedCostUsd: getCostForPricing(bucket, pricing),
    pricedTokens: bucket.totalTokens,
    unpricedTokens: 0,
    unpricedModelIds: [],
  };
};

const toLocalDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(DATE_PART_LENGTH, '0');
  const day = String(date.getDate()).padStart(DATE_PART_LENGTH, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const isBucketInPeriod = (
  bucket: IndexedUsageBucket,
  period: CostOptimizationQuery['period'],
  now: Date
): boolean => {
  if (period === 'total') {
    return true;
  }

  const nowTime = now.getTime();

  if (!bucket.date || Number.isNaN(nowTime)) {
    return false;
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAY_COUNTS[period] - 1));
  const startDate = toLocalDateKey(start);
  const endDate = toLocalDateKey(now);
  return bucket.date >= startDate && bucket.date <= endDate;
};

export const selectQueryBuckets = (
  index: CostOptimizationIndex,
  query: CostOptimizationQuery,
  now: Date = new Date()
): IndexedUsageBucket[] => {
  const buckets = query.projectPath
    ? Object.values(index.projectDayModelBuckets).filter(
        ({ projectPath }) => projectPath === query.projectPath
      )
    : Object.values(index.dayModelBuckets);

  return buckets
    .filter((bucket) => isBucketInPeriod(bucket, query.period, now))
    .sort((first, second) => {
      const dateComparison = (first.date ?? '').localeCompare(second.date ?? '');
      return dateComparison || first.id.localeCompare(second.id);
    });
};

export const getPricingCoverage = (
  buckets: IndexedUsageBucket[],
  pricingEntries: ModelPricingEntry[]
): PricingCoverage => {
  const pricingById = buildPricingIndex(pricingEntries);
  const unpricedModelIds = new Map<string, string>();
  let pricedTokens = 0;
  let unpricedTokens = 0;

  buckets.forEach((bucket) => {
    const priced = priceBucket(bucket, pricingById);
    pricedTokens += priced.pricedTokens;
    unpricedTokens += priced.unpricedTokens;
    priced.unpricedModelIds.forEach((modelId) => {
      unpricedModelIds.set(normalizeModelId(modelId), modelId);
    });
  });

  const totalTokens = pricedTokens + unpricedTokens;
  return {
    pricedTokens,
    unpricedTokens,
    totalTokens,
    percentage:
      totalTokens > 0
        ? (pricedTokens / totalTokens) * COMPLETE_PRICING_PERCENTAGE
        : COMPLETE_PRICING_PERCENTAGE,
    unpricedModelIds: [...unpricedModelIds.values()].sort((first, second) =>
      first.localeCompare(second)
    ),
  };
};

const getModelUsageGroups = (buckets: IndexedUsageBucket[]): ModelUsageGroup[] => {
  const groups = new Map<string, ModelUsageGroup>();

  buckets.forEach((bucket) => {
    const key = getModelGroupKey(bucket.modelId);
    const group = groups.get(key) ?? {
      ...EMPTY_TOKEN_USAGE,
      modelId: bucket.modelId,
      sessionIds: new Set<string>(),
      contributionIds: new Set<string>(),
    };
    group.inputTokens += bucket.inputTokens;
    group.cachedInputTokens += bucket.cachedInputTokens;
    group.outputTokens += bucket.outputTokens;
    group.reasoningOutputTokens += bucket.reasoningOutputTokens;
    group.totalTokens += bucket.totalTokens;
    Object.keys(bucket.memberCounts).forEach((sessionId) => {
      group.sessionIds.add(sessionId);
    });
    Object.keys(bucket.contributionCounts).forEach((contributionId) => {
      group.contributionIds.add(contributionId);
    });
    groups.set(key, group);
  });

  return [...groups.values()];
};

const toCoverage = (
  group: ModelUsageGroup,
  pricing: ModelPricingEntry | undefined
): PricingCoverage => ({
  pricedTokens: pricing ? group.totalTokens : 0,
  unpricedTokens: pricing ? 0 : group.totalTokens,
  totalTokens: group.totalTokens,
  percentage: pricing || group.totalTokens === 0 ? COMPLETE_PRICING_PERCENTAGE : 0,
  unpricedModelIds: pricing ? [] : [group.modelId?.trim() || UNKNOWN_MODEL_ID],
});

export const evaluateModelCosts = (
  index: CostOptimizationIndex,
  query: CostOptimizationQuery,
  pricingEntries: ModelPricingEntry[],
  now: Date = new Date()
): ModelCostRow[] => {
  const groups = getModelUsageGroups(selectQueryBuckets(index, query, now));
  const pricingById = buildPricingIndex(pricingEntries);
  const evaluated = groups.map((group) => {
    const pricing = group.modelId ? pricingById.get(normalizeModelId(group.modelId)) : undefined;
    const pricedCostUsd = pricing ? getCostForPricing(group, pricing) : 0;
    return { group, pricing, pricedCostUsd };
  });
  const totalPricedCostUsd = evaluated.reduce(
    (total, { pricedCostUsd }) => total + pricedCostUsd,
    0
  );

  return evaluated
    .map(({ group, pricing, pricedCostUsd }): ModelCostRow => {
      const sessionCount = group.sessionIds.size;
      return {
        modelId: group.modelId,
        inputTokens: group.inputTokens,
        cachedInputTokens: group.cachedInputTokens,
        outputTokens: group.outputTokens,
        reasoningOutputTokens: group.reasoningOutputTokens,
        totalTokens: group.totalTokens,
        sessionCount,
        pricedCostUsd,
        costShare: totalPricedCostUsd > 0 ? pricedCostUsd / totalPricedCostUsd : 0,
        averageSessionCostUsd: sessionCount > 0 ? pricedCostUsd / sessionCount : 0,
        coverage: toCoverage(group, pricing),
      };
    })
    .sort((first, second) => {
      const firstIsPriced = first.coverage.unpricedTokens === 0;
      const secondIsPriced = second.coverage.unpricedTokens === 0;

      if (firstIsPriced !== secondIsPriced) {
        return firstIsPriced ? -1 : 1;
      }

      return (
        second.pricedCostUsd - first.pricedCostUsd ||
        (first.modelId ?? UNKNOWN_MODEL_ID).localeCompare(second.modelId ?? UNKNOWN_MODEL_ID)
      );
    });
};

export const evaluateSubstitutionScenarios = (
  index: CostOptimizationIndex,
  query: CostOptimizationQuery,
  pricingEntries: ModelPricingEntry[],
  candidateModelIds: string[],
  minimumSavingsUsd: number,
  now: Date = new Date()
): ModelSubstitutionScenario[] => {
  const groups = getModelUsageGroups(selectQueryBuckets(index, query, now));
  const pricingById = buildPricingIndex(pricingEntries);

  return groups
    .flatMap((group): ModelSubstitutionScenario[] => {
      const sourcePricing = group.modelId
        ? pricingById.get(normalizeModelId(group.modelId))
        : undefined;

      if (!sourcePricing) {
        return [];
      }

      const actualCostUsd = getCostForPricing(group, sourcePricing);
      return candidateModelIds.flatMap((candidateModelId) => {
        const targetPricing = pricingById.get(normalizeModelId(candidateModelId));
        const targetMatchesSource =
          targetPricing &&
          normalizeModelId(targetPricing.modelId) === normalizeModelId(sourcePricing.modelId);

        if (!targetPricing || targetMatchesSource) {
          return [];
        }

        const scenarioCostUsd = getCostForPricing(group, targetPricing);
        const savingsUsd = actualCostUsd - scenarioCostUsd;

        return savingsUsd >= minimumSavingsUsd
          ? [
              {
                sourceModelId: group.modelId,
                targetModelId: targetPricing.modelId,
                actualCostUsd,
                scenarioCostUsd,
                savingsUsd,
                affectedSessionCount: group.sessionIds.size,
                contributionIds: [...group.contributionIds].sort((first, second) =>
                  first.localeCompare(second)
                ),
              },
            ]
          : [];
      });
    })
    .sort(
      (first, second) =>
        second.savingsUsd - first.savingsUsd ||
        (first.sourceModelId ?? UNKNOWN_MODEL_ID).localeCompare(
          second.sourceModelId ?? UNKNOWN_MODEL_ID
        ) ||
        first.targetModelId.localeCompare(second.targetModelId)
    );
};
