import { describe, expect, it } from 'vitest';
import { detectCacheDegradation } from '../src/shared/sessionDiagnosisCache';
import {
  makeDetectorContext,
  makeDiagnosisObservationWithSlices,
  makeSlice,
} from './helpers/sessionDiagnosisFixtures';

describe('cache degradation diagnosis', () => {
  it('reports a target gap and caps confidence at medium', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 10_000,
        cachedInputTokens: 2_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        inputTokens: 10_000,
        cachedInputTokens: 1_000,
      }),
    ]);

    expect(
      detectCacheDegradation(makeDetectorContext(current, [], { targetCachePercentage: 80 }))
    ).toMatchObject({
      state: 'finding',
      cause: 'cache-degradation',
      severity: 'critical',
      confidence: 'medium',
      evidence: {
        kind: 'cache-reuse',
        currentPercentage: 15,
        targetPercentage: 80,
      },
    });
  });

  it('bounds cached input before calculating percentages', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 1_000,
        cachedInputTokens: 2_000,
      }),
    ]);
    const result = detectCacheDegradation(
      makeDetectorContext(current, [], { targetCachePercentage: 80 })
    );

    expect(result).toMatchObject({ state: 'not-found' });
  });

  it('returns zero-input when no input tokens exist', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 100,
        totalTokens: 100,
      }),
    ]);

    expect(detectCacheDegradation(makeDetectorContext(current, []))).toMatchObject({
      state: 'not-applicable',
      reason: 'zero-input',
    });
  });

  it('reports a fifteen-point late-session decline', () => {
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 10_000,
        cachedInputTokens: 8_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        inputTokens: 10_000,
        cachedInputTokens: 6_500,
      }),
    ]);

    expect(
      detectCacheDegradation(makeDetectorContext(current, [], { targetCachePercentage: 60 }))
    ).toMatchObject({
      state: 'finding',
      severity: 'warning',
      confidence: 'medium',
    });
  });

  it('caps a high-confidence historical cache anomaly at medium', () => {
    const history = Array.from({ length: 7 }, (_, index) =>
      makeDiagnosisObservationWithSlices(
        [
          makeSlice(`2026-07-${index + 10}T10:00:00.000Z`, {
            inputTokens: 10_000,
            cachedInputTokens: 8_000,
          }),
        ],
        {
          diagnosisId: `history-${index}`,
          sessionId: `history-${index}`,
          startedAt: `2026-07-${index + 10}T10:00:00.000Z`,
          endedAt: `2026-07-${index + 10}T10:00:00.000Z`,
        }
      )
    );
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 10_000,
        cachedInputTokens: 0,
      }),
    ]);

    expect(
      detectCacheDegradation(
        makeDetectorContext(current, history, {
          targetCachePercentage: 0,
        })
      )
    ).toMatchObject({ state: 'finding', confidence: 'medium' });
  });

  it('does not bypass robust sensitivity for a noisy historical cache gap', () => {
    const historicalCachePercentages = [10, 20, 30, 50, 70, 80, 90];
    const history = historicalCachePercentages.map((cachePercentage, index) =>
      makeDiagnosisObservationWithSlices(
        [
          makeSlice(`2026-07-${index + 10}T10:00:00.000Z`, {
            inputTokens: 10_000,
            cachedInputTokens: cachePercentage * 100,
          }),
        ],
        {
          diagnosisId: `history-${index}`,
          sessionId: `history-${index}`,
          startedAt: `2026-07-${index + 10}T10:00:00.000Z`,
          endedAt: `2026-07-${index + 10}T10:00:00.000Z`,
        }
      )
    );
    const current = makeDiagnosisObservationWithSlices([
      makeSlice('2026-07-24T10:00:00.000Z', {
        inputTokens: 10_000,
        cachedInputTokens: 2_000,
      }),
    ]);

    expect(
      detectCacheDegradation(
        makeDetectorContext(current, history, {
          targetCachePercentage: 10,
        })
      )
    ).toMatchObject({ state: 'not-found' });
  });
});
