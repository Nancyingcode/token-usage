import { describe, expect, it } from 'vitest';
import { rebuildCostOptimizationIndex } from '../src/shared/costOptimizationIndex';
import type {
  SessionDiagnosisCause,
  SessionDiagnosisConfidence,
  SessionDiagnosisFinding,
  SessionDiagnosisSeverity,
} from '../src/shared/costOptimizationTypes';
import {
  evaluateSessionDiagnosisDetail,
  evaluateSessionDiagnostics,
  selectPrimaryFinding,
  type EvaluateSessionDiagnosticsInput,
} from '../src/shared/sessionDiagnosisEvaluation';
import { FIXED_NOW, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';
import { makeDiagnosisSourceChange, makeSlice } from './helpers/sessionDiagnosisFixtures';

describe('session diagnosis evaluation', () => {
  it('selects a deterministic primary finding and keeps all detector states', () => {
    const input = makeSessionDiagnosisEvaluationInput();
    const summaries = evaluateSessionDiagnostics(input);
    const summary = summaries.find(({ sessionId }) => sessionId === 'expensive');

    expect(summary).toMatchObject({
      requiresAttention: true,
      primaryFinding: {
        cause: 'input-growth',
        severity: 'critical',
      },
    });
    expect(summary?.additionalFindingCount).toBeGreaterThan(0);

    const detail = evaluateSessionDiagnosisDetail({
      ...input,
      diagnosisId: summary?.diagnosisId ?? '',
    });
    expect(detail).toMatchObject({ kind: 'ready' });
    if (detail.kind === 'ready') {
      expect(detail.detail.detectors).toHaveLength(5);
      expect(detail.detail.timeline.length).toBeGreaterThan(0);
    }
  });

  it('returns a typed not-found result for a missing diagnosis', () => {
    expect(
      evaluateSessionDiagnosisDetail({
        ...makeSessionDiagnosisEvaluationInput(),
        diagnosisId: 'missing',
      })
    ).toEqual({ kind: 'not-found', diagnosisId: 'missing' });
  });

  it('orders primary findings by severity, score, confidence and cause order', () => {
    expect(
      selectPrimaryFinding([
        makeFinding('cache-degradation', 'warning', 'high', 1),
        makeFinding('model-cost-dominance', 'critical', 'medium', 0.8),
        makeFinding('input-growth', 'critical', 'high', 0.8),
      ])?.cause
    ).toBe('input-growth');
  });

  it('treats non-finite normalized scores as zero', () => {
    expect(
      selectPrimaryFinding([
        makeFinding('input-growth', 'warning', 'high', Number.NaN),
        makeFinding('cache-degradation', 'warning', 'high', 0.1),
      ])?.cause
    ).toBe('cache-degradation');
  });

  it('returns a bounded score without mutating an invalid finding', () => {
    const finding = makeFinding('input-growth', 'warning', 'high', Number.POSITIVE_INFINITY);

    expect(selectPrimaryFinding([finding])).toMatchObject({
      normalizedScore: 0,
    });
    expect(finding.normalizedScore).toBe(Number.POSITIVE_INFINITY);
  });

  it('keeps an unresolved high-impact summary', () => {
    const input = makeSessionDiagnosisEvaluationInputWithoutFindings();

    expect(evaluateSessionDiagnostics(input)[0]).toMatchObject({
      requiresAttention: true,
      primaryFinding: undefined,
      additionalFindingCount: 0,
    });
  });

  it('omits invalid timeline timestamps without mutating evaluation input', () => {
    const input = makeSessionDiagnosisEvaluationInputWithInvalidTimestamp();
    const original = structuredClone(input);
    const diagnosisId = evaluateSessionDiagnostics(input)[0].diagnosisId;
    const result = evaluateSessionDiagnosisDetail({
      ...input,
      diagnosisId,
    });

    expect(result).toMatchObject({
      kind: 'ready',
      detail: { invalidTimelinePointCount: 1 },
    });
    expect(input).toEqual(original);
  });

  it('filters the current list by period and project but keeps earlier history', () => {
    const input = makeScopedSessionDiagnosisEvaluationInput();
    const summaries = evaluateSessionDiagnostics(input);

    expect(summaries.map(({ sessionId }) => sessionId)).toEqual(['selected']);

    const detail = evaluateSessionDiagnosisDetail({
      ...input,
      diagnosisId: summaries[0].diagnosisId,
    });
    expect(detail).toMatchObject({
      kind: 'ready',
      detail: {
        detectors: expect.arrayContaining([
          expect.objectContaining({
            cause: 'generation-concentration',
            state: 'finding',
          }),
        ]),
      },
    });
  });
});

const makeFinding = (
  cause: SessionDiagnosisCause,
  severity: SessionDiagnosisSeverity,
  confidence: SessionDiagnosisConfidence,
  normalizedScore: number
): SessionDiagnosisFinding => ({
  state: 'finding',
  cause,
  severity,
  confidence,
  normalizedScore,
  evidence: {
    kind: 'input-growth',
    earlyMedianTokens: 1,
    lateMedianTokens: 2,
    growthRatio: 2,
    absoluteGrowthTokens: 1,
  },
});

const makeSessionDiagnosisEvaluationInput = (): EvaluateSessionDiagnosticsInput => {
  const history = Array.from({ length: 7 }, (_, index) => {
    const day = String(index + 10).padStart(2, '0');
    return makeDiagnosisSourceChange(
      `history-${index}.jsonl`,
      `history-${index}`,
      `2026-07-${day}T10:00:00.000Z`,
      [
        makeSlice(`2026-07-${day}T10:00:00.000Z`, {
          inputTokens: 4_000,
          cachedInputTokens: 2_000,
          outputTokens: 500,
        }),
      ]
    );
  });
  const expensive = makeDiagnosisSourceChange(
    'expensive.jsonl',
    'expensive',
    '2026-07-24T10:00:00.000Z',
    [
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 4_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        inputTokens: 8_000,
      }),
      makeSlice('2026-07-24T10:20:00.000Z', {
        inputTokens: 20_000,
      }),
    ]
  );
  const index = rebuildCostOptimizationIndex('C:\\sessions', [...history, expensive], FIXED_NOW);

  return {
    index,
    query: { period: 'total' },
    settings: SETTINGS,
    pricing: PRICING,
    anomalies: [],
    now: FIXED_NOW,
  };
};

const makeSessionDiagnosisEvaluationInputWithoutFindings = (): EvaluateSessionDiagnosticsInput => {
  const source = makeDiagnosisSourceChange('normal.jsonl', 'normal', '2026-07-24T10:00:00.000Z', [
    makeSlice('2026-07-24T10:00:00.000Z', {
      inputTokens: 1_000,
      cachedInputTokens: 1_000,
      outputTokens: 0,
      totalTokens: 1_000,
    }),
  ]);

  return {
    index: rebuildCostOptimizationIndex('C:\\sessions', [source], FIXED_NOW),
    query: { period: 'total' },
    settings: SETTINGS,
    pricing: PRICING,
    anomalies: [],
    now: FIXED_NOW,
  };
};

const makeSessionDiagnosisEvaluationInputWithInvalidTimestamp =
  (): EvaluateSessionDiagnosticsInput => {
    const input = makeSessionDiagnosisEvaluationInputWithoutFindings();
    const index = structuredClone(input.index);
    const source = Object.values(index.sources)[0];
    source.contributions[0].occurredAt = 'invalid';

    return { ...input, index };
  };

const makeScopedSessionDiagnosisEvaluationInput = (): EvaluateSessionDiagnosticsInput => {
  const history = Array.from({ length: 7 }, (_, index) => {
    const day = String(index + 10).padStart(2, '0');
    return makeDiagnosisSourceChange(
      `prior-${index}.jsonl`,
      `prior-${index}`,
      `2026-07-${day}T10:00:00.000Z`,
      [
        makeSlice(`2026-07-${day}T10:00:00.000Z`, {
          inputTokens: 90_000,
          cachedInputTokens: 90_000,
          outputTokens: 10_000,
          totalTokens: 100_000,
        }),
      ]
    );
  });
  const selected = makeDiagnosisSourceChange(
    'selected.jsonl',
    'selected',
    '2026-07-25T10:00:00.000Z',
    [
      makeSlice('2026-07-25T10:00:00.000Z', {
        inputTokens: 40_000,
        cachedInputTokens: 40_000,
        outputTokens: 60_000,
        totalTokens: 100_000,
      }),
    ]
  );
  const otherProject = makeDiagnosisSourceChange(
    'other.jsonl',
    'other',
    '2026-07-25T10:00:00.000Z',
    [
      makeSlice('2026-07-25T10:00:00.000Z', {
        inputTokens: 40_000,
        cachedInputTokens: 40_000,
        outputTokens: 60_000,
        totalTokens: 100_000,
      }),
    ],
    'C:\\other'
  );

  return {
    index: rebuildCostOptimizationIndex(
      'C:\\sessions',
      [...history, selected, otherProject],
      FIXED_NOW
    ),
    query: { period: 'today', projectPath: 'C:\\repo' },
    settings: SETTINGS,
    pricing: PRICING,
    anomalies: [],
    now: FIXED_NOW,
  };
};
