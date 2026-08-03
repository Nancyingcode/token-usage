/**
 * @file 成本优化定价分析
 * @description
 * 在查询范围内计算定价覆盖、模型实际费用与仅改变价格参数的替代场景。
 *
 * 约束：
 * - 未知模型不猜测价格
 * - 替代场景只重算相同 Token 构成，不表达能力、速度或质量等价
 */
import type { ModelPricingEntry, UnknownModelPricing } from './budgetTypes';
import type {
  CostOptimizationIndex,
  CostOptimizationQuery,
  IndexedUsageBucket,
  ModelCostRow,
  ModelSubstitutionScenario,
  PricingCoverage,
} from './costOptimizationTypes';
import type { RollingUsagePeriod, TokenUsage } from './usageTypes';
import {
  calculateUsageCost,
  createPricingContext,
  priceTokenUsage,
  type PricingContext,
} from './pricing';

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
  exactPricedTokens: number;
  assumedTokens: number;
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

const priceBucket = (bucket: IndexedUsageBucket, context: PricingContext): PricedBucket => {
  const result = priceTokenUsage(bucket, bucket.modelId, context);

  if (result.kind === 'unpriced') {
    return {
      pricedCostUsd: 0,
      exactPricedTokens: 0,
      assumedTokens: 0,
      unpricedTokens: bucket.totalTokens,
      unpricedModelIds: [bucket.modelId?.trim() || UNKNOWN_MODEL_ID],
    };
  }

  return {
    pricedCostUsd: result.costUsd,
    exactPricedTokens: result.kind === 'exact' ? bucket.totalTokens : 0,
    assumedTokens: result.kind === 'assumed' ? bucket.totalTokens : 0,
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
  pricingEntries: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricing
): PricingCoverage => {
  const context = createPricingContext(pricingEntries, unknownModelPricing);
  const unpricedModelIds = new Map<string, string>();
  let exactPricedTokens = 0;
  let assumedTokens = 0;
  let unpricedTokens = 0;

  buckets.forEach((bucket) => {
    const priced = priceBucket(bucket, context);
    exactPricedTokens += priced.exactPricedTokens;
    assumedTokens += priced.assumedTokens;
    unpricedTokens += priced.unpricedTokens;
    priced.unpricedModelIds.forEach((modelId) => {
      unpricedModelIds.set(normalizeModelId(modelId), modelId);
    });
  });

  const pricedTokens = exactPricedTokens + assumedTokens;
  const totalTokens = pricedTokens + unpricedTokens;
  const toPercentage = (tokens: number): number =>
    totalTokens > 0
      ? (tokens / totalTokens) * COMPLETE_PRICING_PERCENTAGE
      : tokens === 0
        ? 0
        : COMPLETE_PRICING_PERCENTAGE;
  return {
    pricedTokens,
    exactPricedTokens,
    assumedTokens,
    unpricedTokens,
    totalTokens,
    percentage:
      totalTokens > 0
        ? (pricedTokens / totalTokens) * COMPLETE_PRICING_PERCENTAGE
        : COMPLETE_PRICING_PERCENTAGE,
    exactPercentage:
      totalTokens > 0 ? toPercentage(exactPricedTokens) : COMPLETE_PRICING_PERCENTAGE,
    assumedPercentage: toPercentage(assumedTokens),
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
  pricingKind: 'exact' | 'assumed' | 'unpriced'
): PricingCoverage => ({
  pricedTokens: pricingKind === 'unpriced' ? 0 : group.totalTokens,
  exactPricedTokens: pricingKind === 'exact' ? group.totalTokens : 0,
  assumedTokens: pricingKind === 'assumed' ? group.totalTokens : 0,
  unpricedTokens: pricingKind === 'unpriced' ? group.totalTokens : 0,
  totalTokens: group.totalTokens,
  percentage:
    pricingKind !== 'unpriced' || group.totalTokens === 0 ? COMPLETE_PRICING_PERCENTAGE : 0,
  exactPercentage:
    pricingKind === 'exact' || group.totalTokens === 0 ? COMPLETE_PRICING_PERCENTAGE : 0,
  assumedPercentage: pricingKind === 'assumed' ? COMPLETE_PRICING_PERCENTAGE : 0,
  unpricedModelIds: pricingKind === 'unpriced' ? [group.modelId?.trim() || UNKNOWN_MODEL_ID] : [],
});

export const evaluateModelCosts = (
  index: CostOptimizationIndex,
  query: CostOptimizationQuery,
  pricingEntries: ModelPricingEntry[],
  now: Date = new Date(),
  unknownModelPricing?: UnknownModelPricing
): ModelCostRow[] => {
  const groups = getModelUsageGroups(selectQueryBuckets(index, query, now));
  const context = createPricingContext(pricingEntries, unknownModelPricing);
  const evaluated = groups.map((group) => {
    const result = priceTokenUsage(group, group.modelId, context);
    const pricedCostUsd = result.costUsd;
    return { group, pricingKind: result.kind, pricedCostUsd };
  });
  const totalPricedCostUsd = evaluated.reduce(
    (total, { pricedCostUsd }) => total + pricedCostUsd,
    0
  );

  return evaluated
    .map(({ group, pricingKind, pricedCostUsd }): ModelCostRow => {
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
        coverage: toCoverage(group, pricingKind),
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
  const pricingById = createPricingContext(pricingEntries).pricingById;

  return groups
    .flatMap((group): ModelSubstitutionScenario[] => {
      const sourcePricing = group.modelId
        ? pricingById.get(normalizeModelId(group.modelId))
        : undefined;

      if (!sourcePricing) {
        return [];
      }

      const actualCostUsd = calculateUsageCost(group, sourcePricing);
      return candidateModelIds.flatMap((candidateModelId) => {
        const targetPricing = pricingById.get(normalizeModelId(candidateModelId));
        const targetMatchesSource =
          targetPricing &&
          normalizeModelId(targetPricing.modelId) === normalizeModelId(sourcePricing.modelId);

        if (!targetPricing || targetMatchesSource) {
          return [];
        }

        const scenarioCostUsd = calculateUsageCost(group, targetPricing);
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
