import { describe, expect, it } from 'vitest';
import type { ModelPricingEntry } from '../src/shared/budgetTypes';
import { evaluateBudgets } from '../src/shared/budgetEvaluation';
import { evaluateConditionalUsage } from '../src/shared/conditionalPricing';
import {
  buildDailyCostEstimates,
  buildOverviewCostEstimates,
  calculateEstimatedCost,
  calculateUsageCost,
  calculateUsageCostBreakdown,
  createPricingContext,
  mergeModelPricing,
  priceTokenUsage,
} from '../src/shared/pricing';
import {
  evaluateModelCosts,
  evaluateSubstitutionScenarios,
  getPricingCoverage,
} from '../src/shared/costOptimizationCost';
import { buildSavingsRecommendations } from '../src/shared/costOptimizationSuggestions';
import { rebuildCostOptimizationIndex } from '../src/shared/costOptimizationIndex';
import { buildSessionDiagnosisObservations } from '../src/shared/sessionDiagnosisCandidates';
import { detectModelCostDominance } from '../src/shared/sessionDiagnosisModelCost';
import { astraPricing, requestUsage } from './helpers/conditionalPricingFixture';
import {
  COVERAGE,
  FIXED_NOW,
  makeBucket,
  makeIndex,
  PRICING,
  SETTINGS,
} from './helpers/costOptimizationFixtures';
import {
  makeContribution,
  makeDetectorContext,
  makeDiagnosisObservationWithSlices,
  makeDiagnosisSourceChange,
} from './helpers/sessionDiagnosisFixtures';

const partialPricing: ModelPricingEntry = {
  ...astraPricing,
  modelId: 'gpt-source',
  cachedInputUsdPerMillion: null,
  conditions: undefined,
};
const usage = { ...requestUsage(), modelId: partialPricing.modelId, cachedInputTokens: 200 };
const source = makeDiagnosisSourceChange('fixture.jsonl', 'fixture', usage.occurredAt, [usage]);

describe('partial cache pricing', () => {
  it('keeps known costs and only marks cached tokens unpriced without mutating inputs', () => {
    const before = structuredClone({ usage, partialPricing });
    const result = evaluateConditionalUsage(usage, partialPricing);
    expect(result.costUsd).toBeCloseTo(0.013);
    expect(result).toMatchObject({
      unpricedTokens: 200,
      conditionAssumedTokens: 0,
      issues: ['cached-input-price-unavailable'],
    });
    expect(result.breakdown).toEqual({
      regularInputCostUsd: 0.008,
      cachedInputCostUsd: 0,
      outputCostUsd: 0.005,
    });
    expect(
      priceTokenUsage(usage, usage.modelId, createPricingContext([partialPricing]))
    ).toMatchObject({
      kind: 'partial',
      unpricedTokens: 200,
    });
    expect({ usage, partialPricing }).toEqual(before);
  });

  it('distinguishes an explicit free cache rate from no rate and needs no cache rate for zero usage', () => {
    const free = { ...partialPricing, cachedInputUsdPerMillion: 0 };
    expect(evaluateConditionalUsage(usage, free)).toMatchObject({ unpricedTokens: 0, issues: [] });
    const noCache = { ...usage, cachedInputTokens: 0 };
    expect(evaluateConditionalUsage(noCache, partialPricing)).toMatchObject({
      costUsd: 0.015,
      unpricedTokens: 0,
      issues: [],
    });
    expect(
      priceTokenUsage(noCache, usage.modelId, createPricingContext([partialPricing])).kind
    ).toBe('exact');
  });

  it('prevents scalar and breakdown-only callers from silently treating partial prices as complete', () => {
    expect(() => calculateUsageCost(usage, partialPricing)).toThrow(/incomplete/i);
    expect(() => calculateUsageCostBreakdown(usage, partialPricing)).toThrow(/incomplete/i);
    expect(calculateUsageCost({ ...usage, cachedInputTokens: 0 }, partialPricing)).toBeCloseTo(
      0.015
    );
  });

  it('keeps missing cache prices separate from conditional assumptions and cache writes', () => {
    const conditional = { ...astraPricing, cachedInputUsdPerMillion: null };
    const withWrites = {
      ...usage,
      pricingContext: {
        ...usage.pricingContext!,
        cacheWriteInputTokens: 300,
        mode: 'unknown' as const,
      },
    };
    const result = evaluateConditionalUsage(withWrites, conditional);
    expect(result.costUsd).toBeCloseTo(0.01375);
    expect(result).toMatchObject({ unpricedTokens: 200, conditionAssumedTokens: 900 });
    expect(result.issues).toEqual(['mode-unknown', 'cached-input-price-unavailable']);
    expect(result.conditionAssumedCostUsd).toBe(result.costUsd);
    expect(result.breakdown.cacheWriteCostUsd).toBeCloseTo(0.00375);
  });

  it('bounds cached tokens per request before aggregating mixed requests', () => {
    const excessiveCache = { ...usage, inputTokens: 100, cachedInputTokens: 200, totalTokens: 200 };
    const noCache = { ...usage, cachedInputTokens: 0 };
    const result = evaluateConditionalUsage(
      {
        ...usage,
        pricingRequests: { excessiveCache, noCache },
      },
      partialPricing
    );
    expect(result.unpricedTokens).toBe(100);
    expect(result.costUsd).toBeCloseTo(0.02);
    expect(result.conditionAssumedTokens).toBe(0);
  });

  it('propagates only missing costs through overview, daily totals and user overrides', () => {
    const estimate = calculateEstimatedCost([usage], [partialPricing]);
    expect(estimate).toMatchObject({
      pricedCostUsd: expect.closeTo(0.013, 10),
      unpricedTokens: 200,
      unpricedModelIds: [usage.modelId],
      pricingIssues: ['cached-input-price-unavailable'],
      assumedTokens: 0,
    });
    const overview = buildOverviewCostEstimates([source.session], [partialPricing]);
    expect(overview.totalCost).toEqual(estimate);
    expect([...overview.dailyCosts.values()]).toEqual([estimate]);
    expect(buildDailyCostEstimates([source.session], [partialPricing])[0]).toMatchObject(estimate);
    const overridden = mergeModelPricing(
      [partialPricing],
      [
        {
          modelId: usage.modelId,
          aliases: [],
          inputUsdPerMillion: 10,
          cachedInputUsdPerMillion: 1,
          outputUsdPerMillion: 50,
          updatedAt: usage.occurredAt,
        },
      ]
    );
    expect(calculateEstimatedCost([usage], overridden)).toMatchObject({
      unpricedTokens: 0,
      unpricedModelIds: [],
      pricedCostUsd: expect.closeTo(0.0132, 10),
    });
    expect(calculateEstimatedCost([usage], mergeModelPricing([partialPricing], []))).toEqual(
      estimate
    );
  });

  it('keeps budget amounts useful while marking only cache usage incomplete', () => {
    const snapshot = evaluateBudgets({
      sessions: [source.session],
      policies: [
        {
          id: 'budget',
          scope: 'global',
          period: 'day',
          modelTarget: { kind: 'all' },
          costLimitUsd: 0.01,
          createdAt: usage.occurredAt,
          updatedAt: usage.occurredAt,
        },
      ],
      pricing: [partialPricing],
      thresholds: { warningPercent: 80, criticalPercent: 90 },
      now: new Date(usage.occurredAt),
      dataState: 'fresh',
    });
    expect(snapshot.statuses[0]).toMatchObject({
      cost: { used: expect.closeTo(0.013, 10), incomplete: true, severity: 'over' },
      unpricedTokens: 200,
      pricingIssues: ['cached-input-price-unavailable'],
    });
    expect(snapshot.unpricedModels).toEqual([{ modelId: usage.modelId, totalTokens: 200 }]);
    expect(snapshot.alerts.length).toBeGreaterThan(0);
  });

  it('computes bucket and model coverage from the priced subset, including mixed conditions', () => {
    const bucket = makeBucket(usage.modelId, 1000, 200, 100);
    const coverage = getPricingCoverage([bucket], [partialPricing]);
    expect(coverage).toMatchObject({
      totalTokens: 1100,
      pricedTokens: 900,
      exactPricedTokens: 900,
      unpricedTokens: 200,
      unpricedModelIds: [usage.modelId],
      pricingIssues: ['cached-input-price-unavailable'],
    });
    expect(coverage.percentage).toBeCloseTo(900 / 11);
    const rows = evaluateModelCosts(makeIndex([bucket]), { period: 'total' }, [partialPricing]);
    expect(rows[0].pricedCostUsd).toBeCloseTo(0.013);
    expect(rows[0].coverage).toEqual(coverage);
    const conditional = { ...partialPricing, rulesStatus: 'unavailable' as const };
    const withAssumptions = getPricingCoverage([bucket], [conditional]);
    expect(withAssumptions).toMatchObject({
      exactPricedTokens: 0,
      conditionAssumedTokens: 900,
      unpricedTokens: 200,
      totalTokens: 1100,
    });
  });

  it('does not compare source or replacement costs when either has missing cache prices', () => {
    const index = makeIndex([makeBucket('gpt-source', 1000, 200, 100)]);
    expect(
      evaluateSubstitutionScenarios(
        index,
        { period: 'total' },
        [partialPricing, PRICING[1]],
        ['gpt-target'],
        0
      )
    ).toEqual([]);
    expect(
      evaluateSubstitutionScenarios(
        index,
        { period: 'total' },
        [PRICING[0], { ...PRICING[1], cachedInputUsdPerMillion: null }],
        ['gpt-target'],
        0
      )
    ).toEqual([]);
  });

  it('does not invent cache savings when the actual usage has no cached tokens', () => {
    const contributions = Array.from({ length: 7 }, (_, index) =>
      makeContribution({
        id: `contribution-${index}`,
        sessionId: `session-${index}`,
        inputTokens: 200000,
        cachedInputTokens: 0,
        outputTokens: 200000,
        totalTokens: 400000,
      })
    );
    expect(
      buildSavingsRecommendations({
        contributions,
        substitutionScenarios: [],
        anomalies: [],
        pricing: [partialPricing],
        coverage: COVERAGE,
        settings: { ...SETTINGS, minimumSavingsUsd: 0.01 },
      })
    ).toEqual([]);
  });

  it('retains partial coverage and its reason in session observations and excludes monetary diagnosis', () => {
    const index = rebuildCostOptimizationIndex('C:/fixtures', [source], FIXED_NOW);
    const observation = buildSessionDiagnosisObservations({ index, pricing: [partialPricing] })[0];
    expect(observation.coverage).toMatchObject({
      pricedTokens: 900,
      exactPricedTokens: 900,
      unpricedTokens: 200,
      pricingIssues: ['cached-input-price-unavailable'],
    });
    expect(
      detectModelCostDominance(
        makeDetectorContext(makeDiagnosisObservationWithSlices([usage]), [], undefined, [
          partialPricing,
          PRICING[1],
        ])
      )
    ).toMatchObject({ state: 'not-applicable', reason: 'pricing-incomplete' });
  });

  it('does not compare a model against cached usage that only belongs to another model', () => {
    const current = makeDiagnosisObservationWithSlices([
      {
        ...usage,
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 100_000,
        totalTokens: 1_100_000,
      },
      { ...usage, modelId: 'gpt-target' },
    ]);
    expect(
      detectModelCostDominance(
        makeDetectorContext(current, [], undefined, [partialPricing, PRICING[1]])
      )
    ).toMatchObject({ state: 'not-applicable', reason: 'pricing-incomplete' });
  });
});
