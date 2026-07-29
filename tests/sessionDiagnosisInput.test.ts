import { describe, expect, it } from 'vitest';
import { detectInputGrowth } from '../src/shared/sessionDiagnosisInput';
import type { SessionDiagnosisObservation } from '../src/shared/sessionDiagnosisTypes';
import {
  makeDetectorContext,
  makeDiagnosisObservationWithSlices,
  makeSlice,
} from './helpers/sessionDiagnosisFixtures';

describe('input growth diagnosis', () => {
  it('reports fallback input growth from three ordered slices', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 16_500 }),
    ]);

    expect(detectInputGrowth(makeDetectorContext(current, []))).toMatchObject({
      state: 'finding',
      cause: 'input-growth',
      severity: 'critical',
      confidence: 'low',
      evidence: {
        kind: 'input-growth',
        earlyMedianTokens: 4_000,
        lateMedianTokens: 16_500,
        absoluteGrowthTokens: 12_500,
      },
    });
  });

  it('requires both relative and absolute fallback growth', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 100 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 200 }),
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 500 }),
    ]);

    expect(detectInputGrowth(makeDetectorContext(current, []))).toMatchObject({
      state: 'insufficient-data',
      cause: 'input-growth',
    });
  });

  it('reports warning for a conservative fallback below the critical ratio', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 13_000 }),
    ]);

    expect(detectInputGrowth(makeDetectorContext(current, []))).toMatchObject({
      state: 'finding',
      severity: 'warning',
      confidence: 'low',
    });
  });

  it.each([
    {
      name: 'one slice',
      slices: [makeSlice('2026-07-24T10:00:00.000Z')],
    },
    {
      name: 'two slices',
      slices: [makeSlice('2026-07-24T10:00:00.000Z'), makeSlice('2026-07-24T10:10:00.000Z')],
    },
    {
      name: 'two valid slices plus an invalid timestamp',
      slices: [
        makeSlice('2026-07-24T10:00:00.000Z'),
        makeSlice('invalid'),
        makeSlice('2026-07-24T10:10:00.000Z'),
      ],
    },
  ])('returns insufficient data for $name', ({ slices }) => {
    expect(
      detectInputGrowth(makeDetectorContext(makeDiagnosisObservationWithSlices(slices), []))
    ).toMatchObject({
      state: 'insufficient-data',
      reason: 'insufficient-slices',
    });
  });

  it('sorts a copy of slices and leaves the source order unchanged', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 20_000 }),
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
    ]);
    const originalIds = current.contributions.map(({ id }) => id);

    detectInputGrowth(makeDetectorContext(current, []));

    expect(current.contributions.map(({ id }) => id)).toEqual(originalIds);
  });

  it('requires both historical growth metrics to be anomalous', () => {
    const history = makeInputGrowthHistory();
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 20_000 }),
    ]);

    expect(detectInputGrowth(makeDetectorContext(current, history))).toMatchObject({
      state: 'finding',
      confidence: 'high',
    });
  });

  it('returns not-found for input growth within a sufficient baseline', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 4_500 }),
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 5_000 }),
    ]);

    expect(detectInputGrowth(makeDetectorContext(current, makeInputGrowthHistory()))).toMatchObject(
      {
        state: 'not-found',
        cause: 'input-growth',
      }
    );
  });
});

const makeInputGrowthHistory = (): SessionDiagnosisObservation[] =>
  Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservationWithSlices(
      [
        makeSlice(`2026-07-${index + 10}T10:00:00.000Z`, {
          inputTokens: 4_000,
        }),
        makeSlice(`2026-07-${index + 10}T10:10:00.000Z`, {
          inputTokens: 4_500,
        }),
        makeSlice(`2026-07-${index + 10}T10:20:00.000Z`, {
          inputTokens: 5_000,
        }),
      ],
      {
        diagnosisId: `history-${index}`,
        sessionId: `history-${index}`,
        startedAt: `2026-07-${index + 10}T10:00:00.000Z`,
        endedAt: `2026-07-${index + 10}T10:20:00.000Z`,
      }
    )
  );
