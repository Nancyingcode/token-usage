/**
 * @file Cache efficiency aggregation
 * @description Builds an immutable cache composition and daily cache-rate view model.
 */

import { getCachePercentageOrNull } from '../../shared/usageMetrics';
import type { UsageDay, UsageSummary } from '../../shared/usageTypes';

export interface CacheEfficiencyDay {
  date: string;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  percentage: number | null;
  hasInconsistentData: boolean;
}

export interface CacheEfficiency {
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  percentage: number | null;
  hasInconsistentData: boolean;
  days: CacheEfficiencyDay[];
}

const CACHE_HISTORY_DAY_COUNT = 30;
const MINIMUM_TOKEN_COUNT = 0;

const buildCacheEfficiencyDay = ({
  date,
  inputTokens,
  cachedInputTokens,
}: UsageDay): CacheEfficiencyDay => ({
  date,
  inputTokens,
  cachedInputTokens,
  uncachedInputTokens: Math.max(MINIMUM_TOKEN_COUNT, inputTokens - cachedInputTokens),
  percentage: getCachePercentageOrNull(inputTokens, cachedInputTokens),
  hasInconsistentData: cachedInputTokens > inputTokens,
});

export const buildCacheEfficiency = (summary: UsageSummary): CacheEfficiency => {
  const { inputTokens, cachedInputTokens } = summary.totals;
  const allDays = summary.byDay.map(buildCacheEfficiencyDay);
  const days = allDays.slice(-CACHE_HISTORY_DAY_COUNT);
  const aggregateIsInconsistent = cachedInputTokens > inputTokens;
  const hasInconsistentDay = allDays.some(({ hasInconsistentData }) => hasInconsistentData);

  return {
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens: Math.max(MINIMUM_TOKEN_COUNT, inputTokens - cachedInputTokens),
    percentage: getCachePercentageOrNull(inputTokens, cachedInputTokens),
    hasInconsistentData: aggregateIsInconsistent || hasInconsistentDay,
    days,
  };
};
