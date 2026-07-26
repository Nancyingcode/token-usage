import { describe, expect, it, vi } from 'vitest';
import type { BudgetSnapshot, ModelPricingEntry } from '../src/shared/budgetTypes';
import { evaluateCostOptimization } from '../src/shared/costOptimizationEvaluation';
import type { UsageScanCycle } from '../src/main/usageScanner';
import {
  createCostOptimizationRuntime,
  type CostOptimizationRuntimeDependencies,
} from '../src/main/costOptimizationRuntime';
import { FIXED_NOW, PRICING, SETTINGS, makeSourceChange } from './helpers/costOptimizationFixtures';

const UPDATED_COST_USD = 4;
const SOURCE_TOKENS = 1_000_000;

describe('cost optimization runtime', () => {
  it('persists changed sources and revalues without rebuilding the token index', async () => {
    const evaluate = vi.fn(evaluateCostOptimization);
    const dependencies = makeRuntimeDependencies({ evaluate });
    const runtime = createCostOptimizationRuntime(dependencies);
    await runtime.initialize();
    await runtime.applyUsageCycle(makeCycleWithOneSource());
    const firstEvaluation = evaluate.mock.calls.at(-1)?.[0];
    if (!firstEvaluation) {
      throw new Error('Expected an evaluation after applying usage.');
    }
    const sourceReference = firstEvaluation.index.sources;

    await runtime.applyBudgetSnapshot(makeBudgetSnapshotWithUpdatedPricing());
    const repricedEvaluation = evaluate.mock.calls.at(-1)?.[0];
    if (!repricedEvaluation) {
      throw new Error('Expected an evaluation after repricing.');
    }

    expect(repricedEvaluation.index.sources).toBe(sourceReference);
    expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot({ period: 'total' }).currentCostUsd).toBe(UPDATED_COST_USD);
  });

  it('keeps the last snapshot when usage refresh becomes stale', async () => {
    const runtime = createCostOptimizationRuntime(makeRuntimeDependencies());
    await runtime.initialize();
    await runtime.applyUsageCycle(makeCycleWithOneSource());
    runtime.markStale(new Error('scan failed'));

    expect(runtime.getSnapshot({ period: 'total' })).toEqual(
      expect.objectContaining({
        dataState: 'stale',
        staleReason: 'scan failed',
        currentCostUsd: 2,
      })
    );
  });
});

const makeRuntimeDependencies = (
  overrides: Partial<CostOptimizationRuntimeDependencies> = {}
): CostOptimizationRuntimeDependencies => ({
  configStore: {
    load: vi.fn(async () => ({
      config: { schemaVersion: 1, settings: SETTINGS },
      warning: undefined,
    })),
    save: vi.fn(async () => undefined),
  },
  cacheStore: {
    load: vi.fn(async () => ({ index: undefined, warning: undefined })),
    save: vi.fn(async () => undefined),
  },
  sessionsDir: 'C:\\sessions',
  defaultPricing: PRICING,
  now: () => FIXED_NOW,
  ...overrides,
});

const makeCycleWithOneSource = (): UsageScanCycle => {
  const change = makeSourceChange('usage.jsonl', '1', SOURCE_TOKENS);
  return {
    result: {
      sessionsDir: 'C:\\sessions',
      scannedAt: FIXED_NOW.toISOString(),
      summary: {
        totals: {
          inputTokens: SOURCE_TOKENS,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: SOURCE_TOKENS,
        },
        byDay: [],
        byProject: [],
        sessions: [change.session],
      },
      warnings: [],
    },
    changes: {
      upserted: [change],
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
  };
};

const makeBudgetSnapshotWithUpdatedPricing = (): BudgetSnapshot => ({
  generatedAt: FIXED_NOW.toISOString(),
  dataState: 'fresh',
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  statuses: [],
  alerts: [],
  summary: {
    warningCount: 0,
    overCount: 0,
    unpricedModelCount: 0,
  },
  pricing: PRICING.map((entry): ModelPricingEntry =>
    entry.modelId === 'gpt-source' ? { ...entry, inputUsdPerMillion: UPDATED_COST_USD } : entry
  ),
  unpricedModels: [],
});
