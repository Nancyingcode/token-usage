/**
 * @file 费用效率视图模型
 * @description 从当前筛选后的本地用量和价格表构建不可变的费用、覆盖率、构成与每日趋势数据。
 */
import type {
  CostEstimate,
  ModelPricingEntry,
  UnknownModelPricing,
} from '../../shared/budgetTypes';
import {
  buildDailyCostEstimates,
  calculateEstimatedCost,
  calculateUsageCostBreakdown,
  createPricingContext,
  getSessionUsageSlices,
  priceTokenUsage,
} from '../../shared/pricing';
import { getLocalDateKey } from '../../shared/usageMath';
import type { UsageSlice, UsageSummary } from '../../shared/usageTypes';

export type CostBreakdownKind = 'regular-input' | 'cached-input' | 'output';

export interface CostEfficiencyCoverage {
  totalTokens: number;
  pricedTokens: number;
  exactPricedTokens: number;
  assumedTokens: number;
  unpricedTokens: number;
  percentage: number | null;
  exactPercentage: number | null;
  assumedPercentage: number | null;
  unpricedPercentage: number | null;
  unpricedModelIds: string[];
}

export interface CostEfficiencyBreakdownItem {
  kind: CostBreakdownKind;
  costUsd: number;
  percentage: number | null;
}

export interface CostEfficiencyDay {
  date: string;
  pricedCostUsd: number;
  unitCostUsdPerMillion: number | null;
  coverage: CostEfficiencyCoverage;
}

export interface CostEfficiency {
  pricedCostUsd: number;
  unitCostUsdPerMillion: number | null;
  averageSessionCostUsd: number | null;
  coverage: CostEfficiencyCoverage;
  breakdown: CostEfficiencyBreakdownItem[];
  days: CostEfficiencyDay[];
}

const PERCENT_SCALE = 100;
const TOKENS_PER_MILLION = 1_000_000;
const COST_HISTORY_DAYS = 30;

const clampPercentage = (value: number): number => Math.min(PERCENT_SCALE, Math.max(0, value));

const toPercentage = (value: number, total: number): number | null =>
  total > 0 ? clampPercentage((value / total) * PERCENT_SCALE) : null;

const sumTotalTokens = (slices: UsageSlice[]): number =>
  slices.reduce((total, slice) => total + Math.max(0, slice.totalTokens), 0);

const buildCoverage = (slices: UsageSlice[], estimate: CostEstimate): CostEfficiencyCoverage => {
  const totalTokens = sumTotalTokens(slices);
  const unpricedTokens = Math.min(totalTokens, Math.max(0, estimate.unpricedTokens));
  const pricedTokens = Math.max(0, totalTokens - unpricedTokens);
  const assumedTokens = Math.min(pricedTokens, Math.max(0, estimate.assumedTokens));
  const exactPricedTokens = Math.max(0, pricedTokens - assumedTokens);

  return {
    totalTokens,
    pricedTokens,
    exactPricedTokens,
    assumedTokens,
    unpricedTokens,
    percentage: toPercentage(pricedTokens, totalTokens),
    exactPercentage: toPercentage(exactPricedTokens, totalTokens),
    assumedPercentage: toPercentage(assumedTokens, totalTokens),
    unpricedPercentage: toPercentage(unpricedTokens, totalTokens),
    unpricedModelIds: [...estimate.unpricedModelIds],
  };
};

const calculateUnitCost = (costUsd: number, pricedTokens: number): number | null =>
  pricedTokens > 0 ? (costUsd / pricedTokens) * TOKENS_PER_MILLION : null;

const buildBreakdown = (
  slices: UsageSlice[],
  pricing: ModelPricingEntry[],
  unknownModelPricing: UnknownModelPricing | undefined,
  pricedCostUsd: number
): CostEfficiencyBreakdownItem[] => {
  const context = createPricingContext(pricing, unknownModelPricing);
  const totals = slices.reduce(
    (breakdown, slice) => {
      const pricingResult = priceTokenUsage(slice, slice.modelId, context);

      if (pricingResult.kind === 'unpriced') {
        return breakdown;
      }

      const sliceBreakdown = calculateUsageCostBreakdown(slice, pricingResult.pricing);
      return {
        regularInputCostUsd: breakdown.regularInputCostUsd + sliceBreakdown.regularInputCostUsd,
        cachedInputCostUsd: breakdown.cachedInputCostUsd + sliceBreakdown.cachedInputCostUsd,
        outputCostUsd: breakdown.outputCostUsd + sliceBreakdown.outputCostUsd,
      };
    },
    { regularInputCostUsd: 0, cachedInputCostUsd: 0, outputCostUsd: 0 }
  );

  return [
    { kind: 'regular-input' as const, costUsd: totals.regularInputCostUsd },
    { kind: 'cached-input' as const, costUsd: totals.cachedInputCostUsd },
    { kind: 'output' as const, costUsd: totals.outputCostUsd },
  ].map((item) => ({
    ...item,
    percentage: toPercentage(item.costUsd, pricedCostUsd),
  }));
};

const buildDailySlices = (slices: UsageSlice[], dates: string[]): Map<string, UsageSlice[]> => {
  const slicesByDate = new Map(dates.map((date) => [date, [] as UsageSlice[]]));

  slices.forEach((slice) => {
    const date = getLocalDateKey(slice.occurredAt);
    const daySlices = slicesByDate.get(date);

    if (daySlices) {
      daySlices.push(slice);
    }
  });

  return slicesByDate;
};

export const buildCostEfficiency = (
  summary: UsageSummary,
  pricing: ModelPricingEntry[],
  unknownModelPricing?: UnknownModelPricing
): CostEfficiency => {
  const slices = summary.sessions.flatMap(getSessionUsageSlices);
  const estimate = calculateEstimatedCost(slices, pricing, unknownModelPricing);
  const coverage = buildCoverage(slices, estimate);
  const dailyEstimates = buildDailyCostEstimates(summary.sessions, pricing, unknownModelPricing);
  const dailySlices = buildDailySlices(
    slices,
    dailyEstimates.map(({ date }) => date)
  );
  const days = dailyEstimates
    .map((dailyEstimate) => {
      const dateSlices = dailySlices.get(dailyEstimate.date) ?? [];
      const dailyCoverage = buildCoverage(dateSlices, dailyEstimate);

      return {
        date: dailyEstimate.date,
        pricedCostUsd: dailyEstimate.pricedCostUsd,
        unitCostUsdPerMillion: calculateUnitCost(
          dailyEstimate.pricedCostUsd,
          dailyCoverage.pricedTokens
        ),
        coverage: dailyCoverage,
      };
    })
    .slice(-COST_HISTORY_DAYS);

  return {
    pricedCostUsd: estimate.pricedCostUsd,
    unitCostUsdPerMillion: calculateUnitCost(estimate.pricedCostUsd, coverage.pricedTokens),
    averageSessionCostUsd:
      summary.sessions.length > 0 ? estimate.pricedCostUsd / summary.sessions.length : null,
    coverage,
    breakdown: buildBreakdown(slices, pricing, unknownModelPricing, estimate.pricedCostUsd),
    days,
  };
};
