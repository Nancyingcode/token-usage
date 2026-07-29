import { describe, expect, it } from 'vitest';
import { resolveDiagnosisBaseline } from '../src/shared/sessionDiagnosisBaselines';
import { makeNumericMetric } from './helpers/sessionDiagnosisFixtures';

describe('session diagnosis baselines', () => {
  it('uses only prior project-model values and ignores future observations', () => {
    const current = makeNumericMetric('current', '2026-07-20T12:00:00.000Z', 30, {
      projectPath: 'C:\\repo',
      dominantModelId: 'gpt-source',
    });
    const history = [
      makeNumericMetric('prior-1', '2026-07-18T12:00:00.000Z', 10),
      makeNumericMetric('prior-2', '2026-07-19T12:00:00.000Z', 12),
      makeNumericMetric('future', '2026-07-21T12:00:00.000Z', 100),
      makeNumericMetric('invalid', 'invalid', 1_000),
    ];

    const baseline = resolveDiagnosisBaseline({
      current,
      history,
      scopeOrder: ['project-model', 'model', 'global'],
      minimumSamples: 2,
      historyWindow: 28,
      direction: 'positive',
      zeroMadAbsoluteScale: 1,
    });

    expect(baseline).toMatchObject({
      scope: 'project-model',
      sampleCount: 2,
      median: 11,
    });
  });

  it('falls back from project-model to model before global', () => {
    const current = makeNumericMetric('current', '2026-07-20T12:00:00.000Z', 30, {
      projectPath: 'C:\\selected',
      dominantModelId: 'gpt-source',
    });
    const history = [
      ...[8, 10, 12].map((value, index) =>
        makeNumericMetric(`model-${index}`, `2026-07-1${index + 1}T12:00:00.000Z`, value, {
          projectPath: 'C:\\other',
          dominantModelId: 'gpt-source',
        })
      ),
      ...[1, 2, 3].map((value, index) =>
        makeNumericMetric(`global-${index}`, `2026-07-0${index + 1}T12:00:00.000Z`, value, {
          projectPath: 'C:\\other',
          dominantModelId: 'gpt-other',
        })
      ),
    ];
    const baseline = resolveDiagnosisBaseline({
      current,
      history,
      scopeOrder: ['project-model', 'model', 'global'],
      minimumSamples: 3,
      historyWindow: 28,
      direction: 'positive',
      zeroMadAbsoluteScale: 1,
    });

    expect(baseline?.scope).toBe('model');
  });

  it('reverses a negative metric score without mutating history', () => {
    const current = makeNumericMetric('current', '2026-07-20T12:00:00.000Z', 10);
    const history = [
      makeNumericMetric('prior-2', '2026-07-19T12:00:00.000Z', 80),
      makeNumericMetric('prior-1', '2026-07-18T12:00:00.000Z', 80),
    ];
    const original = structuredClone(history);

    const baseline = resolveDiagnosisBaseline({
      current,
      history,
      scopeOrder: ['global'],
      minimumSamples: 2,
      historyWindow: 2,
      direction: 'negative',
      zeroMadAbsoluteScale: 1,
    });

    expect(baseline?.score).toBeGreaterThan(0);
    expect(history).toEqual(original);
  });
});
