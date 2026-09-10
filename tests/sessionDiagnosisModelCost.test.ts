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
  it('keeps array traversal linear when a single-model session doubles in length', () => {
    const countArrayTraversal = (sliceCount: number): number => {
      const current = makeDiagnosisObservationWithSlices(
        Array.from({ length: sliceCount }, () =>
          makeSlice('2026-07-24T10:00:00.000Z', { modelId: 'gpt-source' })
        )
      );
      const context = makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING);
      const original = structuredClone(context);
      const originalIterator = Array.prototype[Symbol.iterator];
      let traversedElements = 0;

      // 按迭代输入规模检测重复复制，避免依赖机器负载影响的耗时阈值。
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        value(this: unknown[]) {
          traversedElements += this.length;
          return originalIterator.call(this);
        },
      });
      try {
        detectModelCostDominance(context);
      } finally {
        Object.defineProperty(Array.prototype, Symbol.iterator, { value: originalIterator });
      }

      expect(context).toEqual(original);
      return traversedElements;
    };

    const shorterTraversal = countArrayTraversal(128);
    const longerTraversal = countArrayTraversal(256);

    expect(longerTraversal).toBeLessThanOrEqual(shorterTraversal * 2.5);
  });

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

  it('keeps switch evidence and severity together when dominant is the stronger signal', () => {
    const pricing = [
      {
        modelId: 'gpt-cheap-a',
        aliases: [],
        inputUsdPerMillion: 1,
        cachedInputUsdPerMillion: 0.25,
        outputUsdPerMillion: 5,
        effectiveAt: '2026-07-01',
        sourceKind: 'built-in',
      },
      {
        modelId: 'gpt-cheap-b',
        aliases: [],
        inputUsdPerMillion: 1,
        cachedInputUsdPerMillion: 0.25,
        outputUsdPerMillion: 5,
        effectiveAt: '2026-07-01',
        sourceKind: 'built-in',
      },
      {
        modelId: 'gpt-previous',
        aliases: [],
        inputUsdPerMillion: 4,
        cachedInputUsdPerMillion: 1,
        outputUsdPerMillion: 20,
        effectiveAt: '2026-07-01',
        sourceKind: 'built-in',
      },
      {
        modelId: 'gpt-switched',
        aliases: [],
        inputUsdPerMillion: 8,
        cachedInputUsdPerMillion: 2,
        outputUsdPerMillion: 40,
        effectiveAt: '2026-07-01',
        sourceKind: 'built-in',
      },
    ] satisfies ModelPricingEntry[];
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'gpt-previous',
        inputTokens: 100_000,
        outputTokens: 10_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        modelId: 'gpt-switched',
        inputTokens: 100_000,
        outputTokens: 10_000,
      }),
    ]);

    const result = detectModelCostDominance(makeDetectorContext(current, [], undefined, pricing));

    expect(result).toMatchObject({
      state: 'finding',
      severity: 'warning',
      normalizedScore: 2 / 3,
      evidence: {
        kind: 'model-cost',
        modelId: 'gpt-switched',
        unitCostRatio: 2,
        switchedFromModelId: 'gpt-previous',
        switchedToModelId: 'gpt-switched',
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
