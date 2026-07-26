import { describe, expect, it } from 'vitest';
import {
  applyUsageChangeSet,
  createEmptyCostOptimizationIndex,
} from '../src/shared/costOptimizationIndex';
import { evaluateCostOptimization } from '../src/shared/costOptimizationEvaluation';
import type { CostOptimizationIndex, UsageSourceChange } from '../src/shared/costOptimizationTypes';
import { FIXED_NOW, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';

const BASE_INPUT_TOKENS = 200_000;
const BASE_OUTPUT_TOKENS = 200_000;
const SPIKE_OUTPUT_TOKENS = 1_200_000;
const HISTORY_DAYS = 8;

describe('cost optimization evaluation', () => {
  it('combines comparison, anomalies, forecast and de-duplicated savings', () => {
    const snapshot = evaluateCostOptimization(makeEvaluationInput());

    expect(snapshot.modelRows).not.toHaveLength(0);
    expect(snapshot.anomalies).not.toHaveLength(0);
    expect(snapshot.forecast.kind).toBe('ready');
    expect(snapshot.recommendations).not.toHaveLength(0);
    expect(snapshot.conservativeSavingsUsd).toBeGreaterThan(0);
  });

  it('hides full forecast and recommendations below minimum pricing coverage', () => {
    const snapshot = evaluateCostOptimization(makeEvaluationInputWithUnpricedUsage());

    expect(snapshot.coverage.percentage).toBeLessThan(80);
    expect(snapshot.forecast.kind).toBe('pricing-incomplete');
    expect(snapshot.recommendations).toEqual([]);
    expect(snapshot.conservativeSavingsUsd).toBe(0);
  });
});

const makeEvaluationInput = () => ({
  index: makeEvaluationIndex(false),
  query: { period: 'total' as const },
  settings: SETTINGS,
  pricing: PRICING,
  budgets: [],
  now: FIXED_NOW,
  dataState: 'fresh' as const,
  warnings: [],
  cacheStats: {
    upsertedSources: HISTORY_DAYS,
    removedSources: 0,
    reusedSources: 0,
  },
});

const makeEvaluationInputWithUnpricedUsage = () => ({
  ...makeEvaluationInput(),
  index: makeEvaluationIndex(true),
});

const makeEvaluationIndex = (includeUnpricedUsage: boolean): CostOptimizationIndex => {
  const changes = Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const day = String(index + 17).padStart(2, '0');
    const outputTokens = index === HISTORY_DAYS - 1 ? SPIKE_OUTPUT_TOKENS : BASE_OUTPUT_TOKENS;
    return makeSourceChange(
      `session-${index}.jsonl`,
      `2026-07-${day}`,
      'gpt-source',
      BASE_INPUT_TOKENS,
      outputTokens
    );
  });

  if (includeUnpricedUsage) {
    changes.push(makeSourceChange('unpriced.jsonl', '2026-07-24', undefined, 20_000_000, 0));
  }

  return applyUsageChangeSet(
    createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
    {
      upserted: changes,
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
    FIXED_NOW
  );
};

const makeSourceChange = (
  sourceFile: string,
  date: string,
  modelId: string | undefined,
  inputTokens: number,
  outputTokens: number
): UsageSourceChange => {
  const totalTokens = inputTokens + outputTokens;
  const occurredAt = `${date}T12:00:00.000Z`;

  return {
    sourceFile,
    fingerprint: `${inputTokens}:${outputTokens}`,
    session: {
      sessionId: sourceFile,
      startedAt: occurredAt,
      endedAt: occurredAt,
      projectPath: 'C:\\repo',
      projectName: 'repo',
      usageSlices: [
        {
          occurredAt,
          modelId,
          inputTokens,
          cachedInputTokens: 0,
          outputTokens,
          reasoningOutputTokens: 0,
          totalTokens,
        },
      ],
      inputTokens,
      cachedInputTokens: 0,
      outputTokens,
      reasoningOutputTokens: 0,
      totalTokens,
      eventCount: 1,
      sourceFile,
      warnings: [],
    },
  };
};
