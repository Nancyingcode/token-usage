import { describe, expect, it } from 'vitest';
import { detectGenerationConcentration } from '../src/shared/sessionDiagnosisGeneration';
import { makeDetectorContext, makeDiagnosisObservation } from './helpers/sessionDiagnosisFixtures';

describe('generation concentration diagnosis', () => {
  it('reports both output and reasoning concentration against model history', () => {
    const current = makeDiagnosisObservation({
      totalTokens: 100_000,
      outputTokens: 60_000,
      reasoningOutputTokens: 40_000,
    });
    const history = Array.from({ length: 7 }, (_, index) =>
      makeDiagnosisObservation({
        diagnosisId: `history-${index}`,
        sessionId: `history-${index}`,
        startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
        totalTokens: 100_000,
        outputTokens: 10_000,
        reasoningOutputTokens: 5_000,
      })
    );

    expect(detectGenerationConcentration(makeDetectorContext(current, history))).toMatchObject({
      state: 'finding',
      cause: 'generation-concentration',
      severity: 'critical',
      confidence: 'high',
      evidence: {
        kind: 'generation-share',
        subtype: 'both',
        outputPercentage: 60,
        reasoningPercentage: 40,
      },
    });
  });

  it('returns insufficient data without a historical ratio baseline', () => {
    expect(
      detectGenerationConcentration(makeDetectorContext(makeDiagnosisObservation(), []))
    ).toMatchObject({
      state: 'insufficient-data',
      cause: 'generation-concentration',
    });
  });

  it('returns not-applicable instead of dividing by zero total tokens', () => {
    expect(
      detectGenerationConcentration(
        makeDetectorContext(
          makeDiagnosisObservation({
            inputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 0,
          }),
          []
        )
      )
    ).toMatchObject({
      state: 'not-applicable',
      reason: 'zero-total',
    });
  });

  it.each([
    {
      name: 'output',
      outputTokens: 60_000,
      reasoningOutputTokens: 5_000,
    },
    {
      name: 'reasoning',
      outputTokens: 10_000,
      reasoningOutputTokens: 45_000,
    },
  ])('reports an isolated $name subtype', ({ name, outputTokens, reasoningOutputTokens }) => {
    const history = makeGenerationHistory();
    const result = detectGenerationConcentration(
      makeDetectorContext(
        makeDiagnosisObservation({
          totalTokens: 100_000,
          outputTokens,
          reasoningOutputTokens,
        }),
        history
      )
    );

    expect(result).toMatchObject({
      state: 'finding',
      evidence: { kind: 'generation-share', subtype: name },
    });
  });

  it('returns not-found when both generation shares stay within history', () => {
    expect(
      detectGenerationConcentration(
        makeDetectorContext(
          makeDiagnosisObservation({
            totalTokens: 100_000,
            outputTokens: 10_000,
            reasoningOutputTokens: 5_000,
          }),
          makeGenerationHistory()
        )
      )
    ).toMatchObject({ state: 'not-found' });
  });
});

const makeGenerationHistory = () =>
  Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      totalTokens: 100_000,
      outputTokens: 10_000,
      reasoningOutputTokens: 5_000,
    })
  );
