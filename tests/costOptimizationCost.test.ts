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
      unpricedTokens: 0,
      totalTokens: 100,
      percentage: 100,
      unpricedModelIds: [],
    });
  });
});
