import { describe, expect, it } from 'vitest';
import type {
  IndexedUsageContribution,
  SavingsRecommendation,
  SavingsRecommendationType,
} from '../src/shared/costOptimizationTypes';
import {
  buildSavingsRecommendations,
  getConservativeSavingsUsd,
  type SavingsRecommendationInput,
} from '../src/shared/costOptimizationSuggestions';
import { COVERAGE, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';

const CONTRIBUTION_COUNT = 7;
const TOKENS_PER_CONTRIBUTION = 200_000;

describe('cost optimization suggestions', () => {
  it('creates quantified model, cache and anomaly recommendations', () => {
    const recommendations = buildSavingsRecommendations(makeSuggestionInput());

    expect(recommendations.map(({ type }) => type)).toEqual([
      'model-substitution',
      'anomaly-recovery',
      'cache-improvement',
    ]);
    expect(recommendations[0]).toEqual(
      expect.objectContaining({
        confidence: 'high',
        riskKey: 'risk.modelEquivalence',
      })
    );
    expect(recommendations[2]).toEqual(
      expect.objectContaining({
        confidence: 'medium',
        riskKey: 'risk.cacheEligibility',
      })
    );
  });

  it('uses the largest saving per contribution instead of summing overlaps', () => {
    const recommendations = [
      makeRecommendation('model-substitution', { a: 5, b: 2 }),
      makeRecommendation('anomaly-recovery', { a: 3, c: 4 }),
    ];

    expect(getConservativeSavingsUsd(recommendations)).toBe(11);
  });

  it('suppresses monetary suggestions below pricing coverage and savings thresholds', () => {
    const recommendations = buildSavingsRecommendations({
      ...makeSuggestionInput(),
      coverage: { ...COVERAGE, percentage: 50 },
    });
    expect(recommendations).toEqual([]);
  });
});

const makeSuggestionInput = (): SavingsRecommendationInput => {
  const contributions = Array.from({ length: CONTRIBUTION_COUNT }, (_, index) =>
    makeContribution(index)
  );
  const contributionIds = contributions.map(({ id }) => id);

  return {
    contributions,
    substitutionScenarios: [
      {
        sourceModelId: 'gpt-source',
        targetModelId: 'gpt-target',
        actualCostUsd: 16.8,
        scenarioCostUsd: 8.4,
        savingsUsd: 8.4,
        affectedSessionCount: CONTRIBUTION_COUNT,
        contributionIds,
      },
    ],
    anomalies: [
      {
        id: 'anomaly',
        level: 'day',
        severity: 'warning',
        occurredAt: '2026-07-24T23:59:59.000Z',
        date: '2026-07-24',
        actualCostUsd: 10,
        baselineCostUsd: 5,
        deviationRatio: 2,
        score: 4,
        sampleCount: 28,
        baselineScope: 'global-day',
        coverage: COVERAGE,
        contributionIds,
      },
    ],
    settings: SETTINGS,
    pricing: PRICING,
    coverage: COVERAGE,
  };
};

const makeContribution = (index: number): IndexedUsageContribution => ({
  id: `contribution-${index}`,
  sourceFile: `session-${index}.jsonl`,
  sessionId: `session-${index}`,
  occurredAt: '2026-07-24T12:00:00.000Z',
  date: '2026-07-24',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  modelId: 'gpt-source',
  inputTokens: TOKENS_PER_CONTRIBUTION,
  cachedInputTokens: 0,
  outputTokens: TOKENS_PER_CONTRIBUTION,
  reasoningOutputTokens: 0,
  totalTokens: TOKENS_PER_CONTRIBUTION * 2,
});

const makeRecommendation = (
  type: SavingsRecommendationType,
  contributionSavings: Record<string, number>
): SavingsRecommendation => ({
  id: type,
  type,
  titleKey: `recommendation.${type}`,
  scopeLabel: type,
  savingsUsd: Object.values(contributionSavings).reduce((total, savings) => total + savings, 0),
  confidence: 'high',
  evidence: [],
  riskKey: 'risk.test',
  contributionSavings,
});
