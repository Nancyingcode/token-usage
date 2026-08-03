import { describe, expect, it } from 'vitest';
import {
  evaluateModelCosts,
  evaluateSubstitutionScenarios,
  getPricingCoverage,
  selectQueryBuckets,
} from '../src/shared/costOptimizationCost';
import { FIXED_NOW, makeBucket, makeIndex, PRICING } from './helpers/costOptimizationFixtures';

describe('cost optimization cost analysis', () => {
  it('keeps unpriced tokens while pricing known models', () => {
    const rows = evaluateModelCosts(
      makeIndex([
        makeBucket('gpt-source', 1_000_000, 200_000, 100_000),
        makeBucket(undefined, 500_000, 0, 0),
      ]),
      { period: 'total' },
      PRICING,
      FIXED_NOW
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        modelId: 'gpt-source',
        pricedCostUsd: 2.7,
        coverage: expect.objectContaining({ percentage: 100 }),
      })
    );
    expect(rows[1].coverage).toEqual(
      expect.objectContaining({ pricedTokens: 0, unpricedTokens: 500_000 })
    );
  });

  it('reprices the same token composition for candidate models', () => {
    const scenarios = evaluateSubstitutionScenarios(
      makeIndex([makeBucket('gpt-source', 1_000_000, 200_000, 100_000)]),
      { period: 'total' },
      PRICING,
      ['gpt-target'],
      0,
      FIXED_NOW
    );

    expect(scenarios).toEqual([
      expect.objectContaining({
        sourceModelId: 'gpt-source',
        targetModelId: 'gpt-target',
        actualCostUsd: 2.7,
        scenarioCostUsd: 1.35,
        savingsUsd: 1.35,
      }),
    ]);
  });

  it('filters rolling periods and project buckets before pricing coverage', () => {
    const recent = {
      ...makeBucket('gpt-source', 100, 0, 0),
      id: 'recent',
      date: '2026-07-25',
      projectPath: 'C:\\repo',
    };
    const old = {
      ...makeBucket(undefined, 200, 0, 0),
      id: 'old',
      date: '2026-06-01',
      projectPath: 'C:\\repo',
    };
    const index = {
      ...makeIndex([]),
      projectDayModelBuckets: { recent, old },
    };
    const selected = selectQueryBuckets(
      index,
      { period: 'month', projectPath: 'C:\\repo' },
      FIXED_NOW
    );

    expect(selected.map(({ id }) => id)).toEqual(['recent']);
    expect(getPricingCoverage(selected, PRICING)).toEqual({
      pricedTokens: 100,
      exactPricedTokens: 100,
      assumedTokens: 0,
      unpricedTokens: 0,
      totalTokens: 100,
      percentage: 100,
      exactPercentage: 100,
      assumedPercentage: 0,
      unpricedModelIds: [],
    });
  });

  it('separates exact and assumed coverage for missing model ids', () => {
    const buckets = [
      makeBucket('gpt-source', 100, 0, 0),
      makeBucket(undefined, 200, 0, 0),
      makeBucket('future-model', 300, 0, 0),
    ];
    const unknownModelPricing = {
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 10,
      updatedAt: '2026-08-03T00:00:00.000Z',
    };

    const coverage = getPricingCoverage(buckets, PRICING, unknownModelPricing);
    expect(coverage).toEqual({
      pricedTokens: 300,
      exactPricedTokens: 100,
      assumedTokens: 200,
      unpricedTokens: 300,
      totalTokens: 600,
      percentage: 50,
      exactPercentage: coverage.exactPercentage,
      assumedPercentage: coverage.assumedPercentage,
      unpricedModelIds: ['future-model'],
    });
    expect(coverage.exactPercentage).toBeCloseTo(100 / 6);
    expect(coverage.assumedPercentage).toBeCloseTo(100 / 3);

    const rows = evaluateModelCosts(
      makeIndex(buckets),
      { period: 'total' },
      PRICING,
      FIXED_NOW,
      unknownModelPricing
    );
    const unknownRow = rows.find(({ modelId }) => modelId === undefined);

    expect(unknownRow).toEqual(
      expect.objectContaining({
        pricedCostUsd: 0.0004,
        coverage: expect.objectContaining({ assumedTokens: 200, unpricedTokens: 0 }),
      })
    );
  });
});
