import { describe, expect, it } from 'vitest';
import { detectInteractionAccumulation } from '../src/shared/sessionDiagnosisAccumulation';
import {
  makeContribution,
  makeDetectorContext,
  makeDiagnosisObservation,
} from './helpers/sessionDiagnosisFixtures';

describe('interaction accumulation diagnosis', () => {
  it('reports distributed event accumulation against project history', () => {
    const contributions = Array.from({ length: 30 }, (_, index) =>
      makeContribution({
        id: `current-${index}`,
        occurredAt: `2026-07-24T10:${String(index).padStart(2, '0')}:00.000Z`,
        inputTokens: 10_000,
        outputTokens: 0,
        totalTokens: 10_000,
      })
    );
    const current = makeDiagnosisObservation({
      eventCount: 30,
      startedAt: '2026-07-24T10:00:00.000Z',
      endedAt: '2026-07-24T12:00:00.000Z',
      totalTokens: 300_000,
      contributions,
    });

    expect(
      detectInteractionAccumulation(makeDetectorContext(current, makeInteractionHistory()))
    ).toMatchObject({
      state: 'finding',
      cause: 'interaction-accumulation',
      evidence: {
        kind: 'interaction-accumulation',
        eventCount: 30,
        maxSliceShare: expect.any(Number),
      },
    });
  });

  it('does not call one dominant slice accumulated interaction', () => {
    const current = makeDiagnosisObservation({
      totalTokens: 100_000,
      contributions: [
        makeContribution({ totalTokens: 80_000 }),
        makeContribution({ totalTokens: 20_000 }),
      ],
    });

    expect(
      detectInteractionAccumulation(makeDetectorContext(current, makeInteractionHistory()))
    ).toMatchObject({ state: 'not-found' });
  });

  it('returns insufficient data when event and duration history are unavailable', () => {
    const current = makeDiagnosisObservation({
      eventCount: 30,
      totalTokens: 300_000,
      contributions: Array.from({ length: 30 }, (_, index) =>
        makeContribution({
          id: `current-${index}`,
          totalTokens: 10_000,
        })
      ),
    });

    expect(detectInteractionAccumulation(makeDetectorContext(current, []))).toMatchObject({
      state: 'insufficient-data',
      cause: 'interaction-accumulation',
    });
  });

  it('returns not-applicable when total tokens cannot support a slice share', () => {
    expect(
      detectInteractionAccumulation(
        makeDetectorContext(
          makeDiagnosisObservation({
            inputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 0,
            contributions: [],
          }),
          []
        )
      )
    ).toMatchObject({
      state: 'not-applicable',
      reason: 'zero-total',
    });
  });

  it('uses event-count evidence when the duration is invalid', () => {
    const current = makeDiagnosisObservation({
      startedAt: 'invalid',
      endedAt: 'invalid',
      eventCount: 30,
      totalTokens: 300_000,
      contributions: Array.from({ length: 30 }, (_, index) =>
        makeContribution({
          id: `current-${index}`,
          totalTokens: 10_000,
        })
      ),
    });
    const result = detectInteractionAccumulation(
      makeDetectorContext(current, makeInteractionHistory())
    );

    expect(result).toMatchObject({
      state: 'finding',
      cause: 'interaction-accumulation',
    });
    if (result.state !== 'finding' || result.evidence.kind !== 'interaction-accumulation') {
      throw new Error('Expected interaction accumulation evidence.');
    }
    expect(result.evidence.durationMs).toBeUndefined();
  });
});

const makeInteractionHistory = () =>
  Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      endedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:10:00.000Z`,
      eventCount: 5,
    })
  );
