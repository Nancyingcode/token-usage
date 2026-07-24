import { describe, expect, it } from 'vitest';
import {
  detectCostAnomalies,
  median,
  medianAbsoluteDeviation,
} from '../src/shared/costOptimizationAnomalies';
import type {
  CostOptimizationIndex,
  IndexedUsageBucket,
} from '../src/shared/costOptimizationTypes';
import { FIXED_NOW, FIXED_NOW_ISO, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';

const PROJECT_PATH = 'C:\\repo';
const PROJECT_NAME = 'repo';
const MODEL_ID = 'gpt-source';
const OUTPUT_TOKENS_PER_DOLLAR = 100_000;

describe('cost anomaly detection', () => {
  it('calculates median and MAD without mutating input', () => {
    const values = [1, 1, 2, 100];
    expect(median(values)).toBe(1.5);
    expect(medianAbsoluteDeviation(values, 1.5)).toBe(0.5);
    expect(values).toEqual([1, 1, 2, 100]);
  });

  it('uses the absolute scale floor when MAD is zero', () => {
    const anomalies = detectCostAnomalies(
      makeDailyIndex([1, 1, 1, 1, 1, 1, 1, 2]),
      { period: 'total' },
      PRICING,
      {
        ...SETTINGS,
        anomalyMinimumSamples: 7,
        anomalySensitivity: 3.5,
      },
      FIXED_NOW
    );

    expect(anomalies).toContainEqual(
      expect.objectContaining({
        level: 'day',
        actualCostUsd: 2,
        baselineCostUsd: 1,
        severity: 'warning',
      })
    );
  });

  it('links day, project, model and session anomalies to contributions', () => {
    const anomalies = detectCostAnomalies(
      makeFourLevelSpikeIndex(),
      { period: 'total' },
      PRICING,
      SETTINGS,
      FIXED_NOW
    );

    expect(new Set(anomalies.map(({ level }) => level))).toEqual(
      new Set(['day', 'project', 'model', 'session'])
    );
    expect(anomalies.every(({ contributionIds }) => contributionIds.length > 0)).toBe(true);
  });

  it('does not use future observations in an earlier baseline', () => {
    const anomalies = detectCostAnomalies(
      makeDailyIndex([5, 1, 1, 1, 1, 1, 1, 1]),
      { period: 'total' },
      PRICING,
      SETTINGS,
      FIXED_NOW
    );

    expect(anomalies.some(({ level, date }) => level === 'day' && date === '2026-07-17')).toBe(
      false
    );
  });
});

const makeDailyIndex = (costs: number[]): CostOptimizationIndex => {
  const days = costs.map((cost, index) => {
    const day = String(index + 17).padStart(2, '0');
    return makeObservationBuckets(`2026-07-${day}`, cost);
  });

  return {
    schemaVersion: 1,
    sessionsDir: 'C:\\sessions',
    generatedAt: FIXED_NOW_ISO,
    sources: {},
    dayModelBuckets: Object.fromEntries(days.map(({ day }) => [day.id, day])),
    projectDayModelBuckets: Object.fromEntries(days.map(({ project }) => [project.id, project])),
    sessionModelBuckets: Object.fromEntries(days.map(({ session }) => [session.id, session])),
  };
};

const makeFourLevelSpikeIndex = (): CostOptimizationIndex =>
  makeDailyIndex([1, 1, 1, 1, 1, 1, 1, 5]);

const makeObservationBuckets = (
  date: string,
  costUsd: number
): {
  day: IndexedUsageBucket;
  project: IndexedUsageBucket;
  session: IndexedUsageBucket;
} => {
  const sessionId = `session-${date}`;
  const contributionId = `contribution-${date}`;
  const outputTokens = costUsd * OUTPUT_TOKENS_PER_DOLLAR;
  const usage = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens,
    reasoningOutputTokens: 0,
    totalTokens: outputTokens,
    memberCounts: { [sessionId]: 1 },
    contributionCounts: { [contributionId]: 1 },
  };

  return {
    day: {
      ...usage,
      id: `day-${date}`,
      date,
      modelId: MODEL_ID,
    },
    project: {
      ...usage,
      id: `project-${date}`,
      date,
      projectPath: PROJECT_PATH,
      projectName: PROJECT_NAME,
      modelId: MODEL_ID,
    },
    session: {
      ...usage,
      id: sessionId,
      sessionId,
      occurredAt: `${date}T12:00:00.000Z`,
      projectPath: PROJECT_PATH,
      projectName: PROJECT_NAME,
      modelId: MODEL_ID,
    },
  };
};
