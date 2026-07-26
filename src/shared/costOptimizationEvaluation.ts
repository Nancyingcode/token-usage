/**
 * @file 成本优化快照评估
 * @description
 * 将增量用量索引、价格、预算、设置和查询组合为只读展示所需的完整成本优化快照。
 */
import type { BudgetPolicyStatus, ModelPricingEntry } from './budgetTypes';
import { detectCostAnomalies } from './costOptimizationAnomalies';
import {
  evaluateModelCosts,
  evaluateSubstitutionScenarios,
  getPricingCoverage,
  selectQueryBuckets,
} from './costOptimizationCost';
import { forecastCostTrend } from './costOptimizationForecast';
import {
  buildSavingsRecommendations,
  getConservativeSavingsUsd,
} from './costOptimizationSuggestions';
import type {
  CostOptimizationDataState,
  CostOptimizationIndex,
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  DailyCostObservation,
  IndexedUsageBucket,
  IndexedUsageContribution,
} from './costOptimizationTypes';
import { calculateEstimatedCost } from './pricing';
import type { UsageSlice } from './usageTypes';

export interface EvaluateCostOptimizationInput {
  index: CostOptimizationIndex;
  query: CostOptimizationQuery;
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
  budgets: BudgetPolicyStatus[];
  now: Date;
  dataState: CostOptimizationDataState;
  staleReason?: string;
  warnings: string[];
  cacheStats: CostOptimizationSnapshot['cacheStats'];
}

const getBucketTimestamp = (bucket: IndexedUsageBucket): string =>
  bucket.occurredAt ?? `${bucket.date ?? '0000-00-00'}T23:59:59.999`;

const toUsageSlice = (bucket: IndexedUsageBucket): UsageSlice => ({
  occurredAt: getBucketTimestamp(bucket),
  modelId: bucket.modelId,
  inputTokens: bucket.inputTokens,
  cachedInputTokens: bucket.cachedInputTokens,
  outputTokens: bucket.outputTokens,
  reasoningOutputTokens: bucket.reasoningOutputTokens,
  totalTokens: bucket.totalTokens,
});

const selectQueryContributions = (
  index: CostOptimizationIndex,
  buckets: IndexedUsageBucket[]
): IndexedUsageContribution[] => {
  const contributionIds = new Set(
    buckets.flatMap((bucket) => Object.keys(bucket.contributionCounts))
  );

  return Object.values(index.sources)
    .flatMap(({ contributions }) => contributions)
    .filter(({ id }) => contributionIds.has(id));
};

const getHistoryBuckets = (
  index: CostOptimizationIndex,
  projectPath: string | undefined
): IndexedUsageBucket[] =>
  projectPath
    ? Object.values(index.projectDayModelBuckets).filter(
        (bucket) => bucket.projectPath === projectPath
      )
    : Object.values(index.dayModelBuckets);

const buildDailyCosts = (
  buckets: IndexedUsageBucket[],
  pricing: ModelPricingEntry[]
): DailyCostObservation[] => {
  const bucketsByDate = new Map<string, IndexedUsageBucket[]>();

  buckets.forEach((bucket) => {
    if (!bucket.date) {
      return;
    }

    const dateBuckets = bucketsByDate.get(bucket.date) ?? [];
    dateBuckets.push(bucket);
    bucketsByDate.set(bucket.date, dateBuckets);
  });

  return [...bucketsByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, dateBuckets]) => ({
      date,
      costUsd: calculateEstimatedCost(dateBuckets.map(toUsageSlice), pricing).pricedCostUsd,
    }));
};

const clonePricing = (pricing: ModelPricingEntry[]): ModelPricingEntry[] =>
  pricing.map((entry) => ({ ...entry, aliases: [...entry.aliases] }));

const cloneBudgets = (budgets: BudgetPolicyStatus[]): BudgetPolicyStatus[] =>
  budgets.map((status) => ({
    ...status,
    policy: { ...status.policy },
    token: status.token ? { ...status.token } : undefined,
    cost: status.cost ? { ...status.cost } : undefined,
    unpricedModelIds: [...status.unpricedModelIds],
  }));

export const evaluateCostOptimization = (
  input: EvaluateCostOptimizationInput
): CostOptimizationSnapshot => {
  const selectedBuckets = selectQueryBuckets(input.index, input.query, input.now);
  const coverage = getPricingCoverage(selectedBuckets, input.pricing);
  const modelRows = evaluateModelCosts(input.index, input.query, input.pricing, input.now);
  const currentCostUsd = modelRows.reduce((total, row) => total + row.pricedCostUsd, 0);
  const substitutionScenarios = evaluateSubstitutionScenarios(
    input.index,
    input.query,
    input.pricing,
    input.settings.candidateModelIds,
    input.settings.minimumSavingsUsd,
    input.now
  );
  const pricingCoverageIsSafe =
    coverage.percentage >= input.settings.minimumPricingCoveragePercentage;
  const anomalies = pricingCoverageIsSafe
    ? detectCostAnomalies(input.index, input.query, input.pricing, input.settings, input.now)
    : [];
  const historyBuckets = getHistoryBuckets(input.index, input.query.projectPath);
  const budgets = cloneBudgets(input.budgets);
  const forecast = forecastCostTrend({
    dailyCosts: buildDailyCosts(historyBuckets, input.pricing),
    settings: input.settings,
    budgets,
    coverage,
    query: input.query,
    currentPeriodCostUsd: currentCostUsd,
    now: input.now,
  });
  const contributions = selectQueryContributions(input.index, selectedBuckets);
  const recommendations = pricingCoverageIsSafe
    ? buildSavingsRecommendations({
        contributions,
        substitutionScenarios,
        anomalies,
        settings: input.settings,
        pricing: input.pricing,
        coverage,
      })
    : [];

  return {
    generatedAt: input.now.toISOString(),
    dataState: input.dataState,
    staleReason: input.staleReason,
    warnings: [...input.warnings],
    settings: {
      ...input.settings,
      candidateModelIds: [...input.settings.candidateModelIds],
    },
    query: { ...input.query },
    pricing: clonePricing(input.pricing),
    budgets,
    coverage,
    currentCostUsd,
    modelRows,
    substitutionScenarios,
    anomalies,
    forecast,
    recommendations,
    conservativeSavingsUsd: getConservativeSavingsUsd(recommendations),
    cacheStats: { ...input.cacheStats },
  };
};
