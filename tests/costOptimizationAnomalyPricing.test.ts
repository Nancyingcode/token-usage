import { describe, expect, it } from 'vitest';
import { detectCostAnomalies } from '../src/shared/costOptimizationAnomalies';
import { getPricingCoverage } from '../src/shared/costOptimizationCost';
import { buildSavingsRecommendations } from '../src/shared/costOptimizationSuggestions';
import type {
  CostOptimizationIndex,
  IndexedUsageContribution,
} from '../src/shared/costOptimizationTypes';
import { FIXED_NOW, FIXED_NOW_ISO, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';

const NULL_CACHE_PRICING = [{ ...PRICING[0], cachedInputUsdPerMillion: null }];
const HISTORY_SAMPLE_COUNT = 7;
const CACHED_TOKENS_PER_DOLLAR = 10_000;
const OUTPUT_TOKENS_PER_DOLLAR = 100_000;

interface ObservationInput {
  knownCostUsd: number;
  hasUnpricedCache?: boolean;
}

const history = (knownCostUsd: number, hasUnpricedCache = false): ObservationInput[] =>
  Array.from({ length: HISTORY_SAMPLE_COUNT }, () => ({ knownCostUsd, hasUnpricedCache }));

const evaluateObservations = (observations: ObservationInput[]) => {
  const contributions: IndexedUsageContribution[] = observations.map((observation, index) => {
    const date = `2026-07-${String(index + 1).padStart(2, '0')}`;
    const cachedInputTokens = observation.hasUnpricedCache
      ? observation.knownCostUsd * CACHED_TOKENS_PER_DOLLAR
      : 0;
    const outputTokens = observation.knownCostUsd * OUTPUT_TOKENS_PER_DOLLAR;
    return {
      id: `contribution-${date}`,
      sourceFile: `fixture-${date}.jsonl`,
      sessionId: `session-${date}`,
      occurredAt: `${date}T12:00:00.000Z`,
      date,
      projectPath: 'fixture-project',
      projectName: 'fixture-project',
      modelId: PRICING[0].modelId,
      inputTokens: cachedInputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningOutputTokens: 0,
      totalTokens: cachedInputTokens + outputTokens,
    };
  });
  const buckets = contributions.map((contribution) => ({
    ...contribution,
    memberCounts: { [contribution.sessionId]: 1 },
    contributionCounts: { [contribution.id]: 1 },
  }));
  const bucketsById = Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket]));
  const index: CostOptimizationIndex = {
    schemaVersion: 3,
    sessionsDir: 'fixture-sessions',
    generatedAt: FIXED_NOW_ISO,
    sources: {},
    dayModelBuckets: bucketsById,
    projectDayModelBuckets: bucketsById,
    sessionModelBuckets: bucketsById,
  };
  const anomalies = detectCostAnomalies(
    index,
    { period: 'total' },
    NULL_CACHE_PRICING,
    SETTINGS,
    FIXED_NOW
  );
  const recommendations = buildSavingsRecommendations({
    contributions,
    anomalies,
    substitutionScenarios: [],
    pricing: NULL_CACHE_PRICING,
    settings: SETTINGS,
    coverage: getPricingCoverage(buckets, NULL_CACHE_PRICING),
  });
  return { anomalies, recommendations };
};

describe('complete pricing for anomaly money comparisons', () => {
  it('does not turn partially priced historical costs into recoverable cash savings', () => {
    const result = evaluateObservations([...history(10, true), { knownCostUsd: 20 }]);

    expect(result.anomalies).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it('does not treat a partially priced current cost as a complete anomaly amount', () => {
    const result = evaluateObservations([
      ...history(10),
      { knownCostUsd: 20, hasUnpricedCache: true },
    ]);

    expect(result.anomalies).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it('retains quantified recommendations when historical and current usage are complete', () => {
    const result = evaluateObservations([...history(10), { knownCostUsd: 20 }]);

    expect(new Set(result.anomalies.map(({ level }) => level))).toEqual(
      new Set(['day', 'project', 'model', 'session'])
    );
    expect(result.recommendations).toHaveLength(4);
    expect(
      result.recommendations.every(
        ({ type, savingsUsd }) => type === 'anomaly-recovery' && savingsUsd === 10
      )
    ).toBe(true);
  });

  it('excludes incomplete history while retaining enough complete baseline samples', () => {
    const result = evaluateObservations([
      ...history(10),
      ...history(1, true),
      { knownCostUsd: 50 },
    ]);

    expect(result.anomalies).toHaveLength(4);
    expect(
      result.anomalies.every(
        ({ baselineCostUsd, sampleCount }) =>
          baselineCostUsd === 10 && sampleCount === HISTORY_SAMPLE_COUNT
      )
    ).toBe(true);
    expect(result.recommendations).toHaveLength(4);
    expect(result.recommendations.every(({ savingsUsd }) => savingsUsd === 40)).toBe(true);
  });
});
