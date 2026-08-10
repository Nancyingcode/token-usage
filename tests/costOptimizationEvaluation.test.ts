import { describe, expect, it } from 'vitest';
import {
  applyUsageChangeSet,
  createEmptyCostOptimizationIndex,
} from '../src/shared/costOptimizationIndex';
import { evaluateCostOptimization } from '../src/shared/costOptimizationEvaluation';
import type { CostOptimizationIndex, UsageSourceChange } from '../src/shared/costOptimizationTypes';
import { DEFAULT_MODEL_PRICING } from '../src/main/defaultModelPricing';
import { FIXED_NOW, PRICING, SETTINGS } from './helpers/costOptimizationFixtures';
import type { BudgetPolicyStatus, ModelPricingEntry } from '../src/shared/budgetTypes';

const BASE_INPUT_TOKENS = 200_000;
const BASE_OUTPUT_TOKENS = 200_000;
const SPIKE_OUTPUT_TOKENS = 1_200_000;
const HISTORY_DAYS = 8;
const LATEST_PRICING: ModelPricingEntry[] = PRICING.map((entry, index) => ({
  ...entry,
  modelId: index === 0 ? 'gpt-5.6-sol' : 'gpt-5.6-luna',
  aliases: [entry.modelId, ...entry.aliases],
}));
const LATEST_SETTINGS = {
  ...SETTINGS,
  candidateModelIds: ['gpt-5.6-luna'],
};

describe('cost optimization evaluation', () => {
  it('combines comparison, anomalies, forecast and de-duplicated savings', () => {
    const snapshot = evaluateCostOptimization(makeEvaluationInput());

    expect(snapshot.modelRows).not.toHaveLength(0);
    expect(snapshot.anomalies).not.toHaveLength(0);
    expect(snapshot.forecast.kind).toBe('ready');
    expect(snapshot.recommendations).not.toHaveLength(0);
    expect(snapshot.conservativeSavingsUsd).toBeGreaterThan(0);
  });

  it('keeps historical costs but limits substitutions to the latest model series', () => {
    const oldModel = makeSourceChange('old.jsonl', '2026-07-24', 'gpt-5.5', 1_000_000, 0);
    const latestModel = makeSourceChange('latest.jsonl', '2026-07-24', 'gpt-5.6-sol', 1_000_000, 0);
    const index = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: [oldModel, latestModel],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInput(),
      index,
      settings: {
        ...SETTINGS,
        candidateModelIds: ['gpt-5.5', 'gpt-5.6-luna'],
        minimumSavingsUsd: 0,
      },
      pricing: [
        makePricing('gpt-5.5', 10),
        makePricing('gpt-5.6-sol', 5),
        makePricing('gpt-5.6-terra', 2.5),
        makePricing('gpt-5.6-luna', 1),
      ],
    });

    expect(snapshot.currentCostUsd).toBe(15);
    expect(snapshot.modelRows.map(({ modelId }) => modelId)).toEqual(['gpt-5.5', 'gpt-5.6-sol']);
    expect(snapshot.substitutionScenarios).toEqual([
      expect.objectContaining({
        sourceModelId: 'gpt-5.6-sol',
        targetModelId: 'gpt-5.6-luna',
        scenarioCostUsd: 1,
        savingsUsd: 4,
      }),
    ]);
    expect(snapshot.recommendations).toEqual([
      expect.objectContaining({
        type: 'cache-improvement',
        scopeLabel: 'gpt-5.6-sol',
      }),
    ]);
  });

  it('excludes every legacy built-in target from model substitution recommendations', () => {
    const latestSessions = Array.from({ length: 7 }, (_, index) =>
      makeSourceChange(`latest-${index}.jsonl`, '2026-07-24', 'gpt-5.6-sol', 1_000_000, 0)
    );
    const index = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: latestSessions,
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInput(),
      index,
      pricing: DEFAULT_MODEL_PRICING,
      settings: {
        ...SETTINGS,
        candidateModelIds: DEFAULT_MODEL_PRICING.map(({ modelId }) => modelId),
        minimumSavingsUsd: 0,
      },
    });

    expect(
      snapshot.substitutionScenarios.map(({ sourceModelId, targetModelId }) => ({
        sourceModelId,
        targetModelId,
      }))
    ).toEqual([
      { sourceModelId: 'gpt-5.6-sol', targetModelId: 'gpt-5.6-luna' },
      { sourceModelId: 'gpt-5.6-sol', targetModelId: 'gpt-5.6-terra' },
    ]);
    expect(
      snapshot.recommendations
        .filter(({ type }) => type === 'model-substitution')
        .map(({ scopeLabel }) => scopeLabel)
    ).toEqual(['gpt-5.6-sol → gpt-5.6-luna', 'gpt-5.6-sol → gpt-5.6-terra']);
  });

  it('includes lightweight session diagnosis summaries without timeline data', () => {
    const snapshot = evaluateCostOptimization(makeEvaluationInput());

    expect(snapshot.diagnostics.length).toBeGreaterThan(0);
    expect(snapshot.diagnostics[0]).not.toHaveProperty('timeline');
    expect(snapshot.diagnostics.every(({ diagnosisId }) => diagnosisId.length > 0)).toBe(true);
  });

  it('hides full forecast and recommendations below minimum pricing coverage', () => {
    const snapshot = evaluateCostOptimization(makeEvaluationInputWithUnpricedUsage());

    expect(snapshot.coverage.percentage).toBeLessThan(80);
    expect(snapshot.forecast.kind).toBe('pricing-incomplete');
    expect(snapshot.recommendations).toEqual([]);
    expect(snapshot.conservativeSavingsUsd).toBe(0);
  });

  it('includes configured unknown-model fallback pricing in totals and forecast coverage', () => {
    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInputWithUnpricedUsage(),
      unknownModelPricing: {
        inputUsdPerMillion: 2,
        cachedInputUsdPerMillion: 0.5,
        outputUsdPerMillion: 10,
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
    });

    expect(snapshot.coverage.assumedTokens).toBe(20_000_000);
    expect(snapshot.coverage.unpricedTokens).toBe(0);
    expect(snapshot.coverage.exactPercentage).toBeLessThan(100);
    expect(snapshot.currentCostUsd).toBeGreaterThan(40);
    expect(snapshot.forecast.kind).toBe('ready');
    expect(snapshot.unknownModelPricing).toEqual(
      expect.objectContaining({ inputUsdPerMillion: 2 })
    );
  });

  it('gates forecasting with full forecast-history coverage, not the current query window', () => {
    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInputWithUnpricedUsage(),
      query: { period: 'today' },
    });

    expect(snapshot.coverage.percentage).toBe(100);
    expect(snapshot.forecast.kind).toBe('pricing-incomplete');
    expect(snapshot.forecast.coverage.percentage).toBeLessThan(80);
  });

  it('clones nested budget model targets before exposing them to consumers', () => {
    const budget: BudgetPolicyStatus = {
      policy: {
        id: 'model-budget',
        scope: 'global',
        period: 'month',
        modelTarget: { kind: 'model', modelId: 'gpt-source' },
        costLimitUsd: 10,
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
      },
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: FIXED_NOW.toISOString(),
      assumedTokens: 0,
      unpricedTokens: 0,
      unpricedModelIds: [],
    };

    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInput(),
      budgets: [budget],
    });
    const clonedTarget = snapshot.budgets[0].policy.modelTarget;

    if (clonedTarget.kind !== 'model') {
      throw new TypeError('Expected a concrete model target.');
    }
    clonedTarget.modelId = 'changed';

    expect(budget.policy.modelTarget).toEqual({ kind: 'model', modelId: 'gpt-source' });
  });

  it('includes global budget crossings in a project-scoped forecast', () => {
    const globalBudget: BudgetPolicyStatus = {
      policy: {
        id: 'global-month',
        scope: 'global',
        period: 'month',
        modelTarget: { kind: 'all' },
        costLimitUsd: 1,
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
      },
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: FIXED_NOW.toISOString(),
      cost: {
        used: 1,
        limit: 1,
        percent: 100,
        severity: 'over',
      },
      assumedTokens: 0,
      unpricedTokens: 0,
      unpricedModelIds: [],
    };
    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInput(),
      query: { period: 'total', projectPath: 'C:\\repo' },
      budgets: [globalBudget],
    });

    expect(snapshot.forecast.kind).toBe('ready');
    if (snapshot.forecast.kind === 'ready') {
      expect(snapshot.forecast.budgetCrossings).toContainEqual(
        expect.objectContaining({ policyId: 'global-month' })
      );
    }
  });

  it('retains an independently ready global budget forecast when project history is insufficient', () => {
    const changes = Array.from({ length: HISTORY_DAYS }, (_, index) => {
      const day = String(index + 17).padStart(2, '0');
      const change = makeSourceChange(
        `global-${index}.jsonl`,
        `2026-07-${day}`,
        'gpt-source',
        BASE_INPUT_TOKENS,
        BASE_OUTPUT_TOKENS
      );
      const belongsToSelectedProject = index >= HISTORY_DAYS - 2;
      change.session.projectPath = belongsToSelectedProject ? 'C:\\selected' : 'C:\\other';
      change.session.projectName = belongsToSelectedProject ? 'selected' : 'other';
      return change;
    });
    const index = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: changes,
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const globalBudget: BudgetPolicyStatus = {
      policy: {
        id: 'global-ready',
        scope: 'global',
        period: 'month',
        modelTarget: { kind: 'all' },
        costLimitUsd: 1,
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
      },
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: FIXED_NOW.toISOString(),
      cost: {
        used: 1,
        limit: 1,
        percent: 100,
        severity: 'over',
      },
      assumedTokens: 0,
      unpricedTokens: 0,
      unpricedModelIds: [],
    };

    const snapshot = evaluateCostOptimization({
      ...makeEvaluationInput(),
      index,
      query: { period: 'total', projectPath: 'C:\\selected' },
      budgets: [globalBudget],
    });

    expect(snapshot.forecast.kind).toBe('insufficient-data');
    expect(snapshot.forecast.budgetCrossings).toContainEqual(
      expect.objectContaining({ policyId: 'global-ready' })
    );
  });
});

const makeEvaluationInput = () => ({
  index: makeEvaluationIndex(false),
  query: { period: 'total' as const },
  settings: LATEST_SETTINGS,
  pricing: LATEST_PRICING,
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
      turnOutcomes: [],
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

const makePricing = (modelId: string, inputUsdPerMillion: number): ModelPricingEntry => ({
  modelId,
  aliases: [],
  inputUsdPerMillion,
  cachedInputUsdPerMillion: inputUsdPerMillion / 10,
  outputUsdPerMillion: inputUsdPerMillion * 6,
  effectiveAt: '2026-08-10',
  sourceKind: 'built-in',
});
