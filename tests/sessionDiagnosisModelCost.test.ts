import { describe, expect, it } from 'vitest';
import type { ModelPricingEntry } from '../src/shared/budgetTypes';
import {
  detectModelCostDominance,
  isHighCostModelSwitch,
} from '../src/shared/sessionDiagnosisModelCost';
import { PRICING } from './helpers/costOptimizationFixtures';
import {
  makeDetectorContext,
  makeDiagnosisObservationWithSlices,
  makeSlice,
} from './helpers/sessionDiagnosisFixtures';

const DIAGNOSIS_PRICING: ModelPricingEntry[] = [
  ...PRICING,
  {
    modelId: 'gpt-expensive',
    aliases: [],
    inputUsdPerMillion: 8,
    cachedInputUsdPerMillion: 2,
    outputUsdPerMillion: 32,
    effectiveAt: '2026-07-01',
    sourceKind: 'built-in',
  },
];

describe('model cost diagnosis', () => {
  it('reports a dominant high-unit-cost model with complete pricing', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'gpt-expensive',
        inputTokens: 800_000,
        outputTokens: 100_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        modelId: 'gpt-source',
        inputTokens: 50_000,
        outputTokens: 10_000,
      }),
    ]);

    expect(
      detectModelCostDominance(makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING))
    ).toMatchObject({
      state: 'finding',
      cause: 'model-cost-dominance',
      evidence: {
        kind: 'model-cost',
        modelId: 'gpt-expensive',
        costShare: expect.any(Number),
      },
    });
  });

  it('does not infer model cost when any participating model is unpriced', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'unpriced-model',
      }),
    ]);

    expect(detectModelCostDominance(makeDetectorContext(current, []))).toMatchObject({
      state: 'not-applicable',
      reason: 'pricing-incomplete',
    });
  });

  it('returns not-found for a completely priced ordinary-cost model', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'gpt-source',
        inputTokens: 100_000,
        outputTokens: 10_000,
      }),
    ]);

    expect(
      detectModelCostDominance(makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING))
    ).toMatchObject({
      state: 'not-found',
      cause: 'model-cost-dominance',
    });
  });

  it('reports a higher-cost model switch with at least twenty percent cost share', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'gpt-source',
        inputTokens: 100_000,
        outputTokens: 10_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        modelId: 'gpt-expensive',
        inputTokens: 100_000,
        outputTokens: 10_000,
      }),
    ]);

    expect(
      detectModelCostDominance(makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING))
    ).toMatchObject({
      state: 'finding',
      evidence: {
        kind: 'model-cost',
        switchedFromModelId: 'gpt-source',
        switchedToModelId: 'gpt-expensive',
      },
    });
  });

  it('does not mutate pricing while comparing effective unit costs', () => {
    const pricing = structuredClone(DIAGNOSIS_PRICING);
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'gpt-source',
      }),
    ]);

    detectModelCostDominance(makeDetectorContext(current, [], undefined, pricing));

    expect(pricing).toEqual(DIAGNOSIS_PRICING);
  });

  it.each([
    { unitCostRatio: 1.49, switchedCostShare: 0.2 },
    { unitCostRatio: 1.5, switchedCostShare: 0.19 },
  ])('rejects a switch below either boundary', ({ unitCostRatio, switchedCostShare }) => {
    expect(isHighCostModelSwitch(unitCostRatio, switchedCostShare)).toBe(false);
  });
});
