import { describe, expect, it } from 'vitest';
import { rebuildCostOptimizationIndex } from '../src/shared/costOptimizationIndex';
import {
  buildSessionDiagnosisObservations,
  getMidrankPercentiles,
  selectDiagnosisCandidates,
} from '../src/shared/sessionDiagnosisCandidates';
import { FIXED_NOW, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';
import {
  makeDiagnosisObservation,
  makeDiagnosisSourceChange,
  makeSessionAnomaly,
  makeSlice,
} from './helpers/sessionDiagnosisFixtures';

describe('session diagnosis candidates', () => {
  it('assigns stable midrank percentiles including ties', () => {
    expect(getMidrankPercentiles([])).toEqual([]);
    expect(getMidrankPercentiles([10, 20, 20, 40])).toEqual([0, 0.5, 0.5, 1]);
    expect(getMidrankPercentiles([7])).toEqual([1]);
  });

  it('marks the top impact quintile and session anomalies for attention', () => {
    const observations = [10, 20, 30, 40, 50].map((totalTokens, index) =>
      makeDiagnosisObservation({
        diagnosisId: `source-${index}\u001fsession-${index}`,
        sourceFile: `source-${index}`,
        sessionId: `session-${index}`,
        totalTokens,
        pricedCostUsd: totalTokens,
      })
    );
    const candidates = selectDiagnosisCandidates({
      observations,
      anomalies: [makeSessionAnomaly('session-1')],
      minimumPricingCoveragePercentage: SETTINGS.minimumPricingCoveragePercentage,
    });

    expect(
      candidates
        .filter(({ requiresAttention }) => requiresAttention)
        .map(({ sessionId }) => sessionId)
    ).toEqual(['session-4', 'session-1']);
  });

  it('uses cost percentile only for sessions meeting the safe pricing threshold', () => {
    const observations = [
      makeDiagnosisObservation({
        diagnosisId: 'low-token-high-cost\u001flow-token-high-cost',
        sessionId: 'low-token-high-cost',
        totalTokens: 10,
        pricedCostUsd: 100,
      }),
      makeDiagnosisObservation({
        diagnosisId: 'partial\u001fpartial',
        sessionId: 'partial',
        totalTokens: 50,
        pricedCostUsd: 1_000,
        coverage: {
          pricedTokens: 25,
          exactPricedTokens: 25,
          assumedTokens: 0,
          unpricedTokens: 25,
          totalTokens: 50,
          percentage: 50,
          exactPercentage: 50,
          assumedPercentage: 0,
          unpricedModelIds: ['unknown-model'],
        },
      }),
      makeDiagnosisObservation({
        diagnosisId: 'high-token-low-cost\u001fhigh-token-low-cost',
        sessionId: 'high-token-low-cost',
        totalTokens: 100,
        pricedCostUsd: 1,
      }),
    ];

    const candidates = selectDiagnosisCandidates({
      observations,
      anomalies: [],
      minimumPricingCoveragePercentage: 90,
    });

    expect(candidates.find(({ sessionId }) => sessionId === 'low-token-high-cost')).toMatchObject({
      tokenPercentile: 0,
      pricedCostPercentile: 1,
      impactPercentile: 1,
    });
    expect(candidates.find(({ sessionId }) => sessionId === 'partial')).toMatchObject({
      tokenPercentile: 0.5,
      impactPercentile: 0.5,
    });
    expect(candidates.find(({ sessionId }) => sessionId === 'partial')).not.toHaveProperty(
      'pricedCostPercentile'
    );
  });

  it('builds a stable source-session id and breaks dominant-model ties lexically', () => {
    const source = makeDiagnosisSourceChange(
      'tie.jsonl',
      'tie-session',
      '2026-07-24T10:00:00.000Z',
      [
        makeSlice('2026-07-24T10:00:00.000Z', {
          modelId: 'gpt-z',
          totalTokens: 1_000,
        }),
        makeSlice('2026-07-24T10:10:00.000Z', {
          modelId: 'gpt-a',
          totalTokens: 1_000,
        }),
      ]
    );
    const index = rebuildCostOptimizationIndex('C:\\sessions', [source], FIXED_NOW);

    expect(
      buildSessionDiagnosisObservations({
        index,
        pricing: PRICING,
      })
    ).toEqual([
      expect.objectContaining({
        diagnosisId: 'tie.jsonl\u001ftie-session',
        dominantModelId: 'gpt-a',
      }),
    ]);
  });
});
