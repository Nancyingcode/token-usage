import { describe, expect, it, vi } from 'vitest';
import type { BudgetSnapshot, ModelPricingEntry } from '../src/shared/budgetTypes';
import { evaluateCostOptimization } from '../src/shared/costOptimizationEvaluation';
import { createEmptyCostOptimizationIndex } from '../src/shared/costOptimizationIndex';
import type { UsageScanCycle } from '../src/main/usageScanner';
import {
  createCostOptimizationRuntime,
  type CostOptimizationRuntimeDependencies,
} from '../src/main/costOptimizationRuntime';
import { FIXED_NOW, PRICING, SETTINGS, makeSourceChange } from './helpers/costOptimizationFixtures';

const UPDATED_COST_USD = 4;
const SOURCE_TOKENS = 1_000_000;

describe('cost optimization runtime', () => {
  it('evaluates one diagnosis from the latest index without rescanning usage', async () => {
    const dependencies = makeRuntimeDependencies();
    const runtime = createCostOptimizationRuntime(dependencies);
    await runtime.initialize();
    await runtime.applyUsageCycle(makeCycleWithOneSource());
    const snapshot = runtime.getSnapshot({ period: 'total' });
    const diagnosisId = snapshot.diagnostics[0]?.diagnosisId ?? '';

    const result = runtime.getSessionDiagnosis({
      query: { period: 'total' },
      diagnosisId,
    });

    expect(result).toMatchObject({ kind: 'ready' });
    expect(dependencies.cacheStore.load).toHaveBeenCalledTimes(1);
    expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
  });

  it('returns not-found after the source is removed', async () => {
    const runtime = createCostOptimizationRuntime(makeRuntimeDependencies());
    await runtime.initialize();
    await runtime.applyUsageCycle(makeCycleWithOneSource());
    const diagnosisId = runtime.getSnapshot({ period: 'total' }).diagnostics[0].diagnosisId;
    await runtime.applyUsageCycle(makeEmptyRemovalCycle());

    expect(
      runtime.getSessionDiagnosis({
        query: { period: 'total' },
        diagnosisId,
      })
    ).toEqual({ kind: 'not-found', diagnosisId });
  });

  it('revalues detail after pricing changes without rebuilding the index', async () => {
    const dependencies = makeRuntimeDependencies();
    const runtime = createCostOptimizationRuntime(dependencies);
    await runtime.initialize();
    await runtime.applyUsageCycle(makeCycleWithOneSource());
    const diagnosisId = runtime.getSnapshot({ period: 'total' }).diagnostics[0].diagnosisId;

    await runtime.applyBudgetSnapshot(makeBudgetSnapshotWithUpdatedPricing());
    const result = runtime.getSessionDiagnosis({
      query: { period: 'total' },
      diagnosisId,
    });

    expect(result).toMatchObject({
      kind: 'ready',
      detail: {
        summary: { pricedCostUsd: UPDATED_COST_USD },
      },
    });
    expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a blank diagnosis id with a structured validation issue', async () => {
    const runtime = createCostOptimizationRuntime(makeRuntimeDependencies());
    await runtime.initialize();

    expect(() =>
      runtime.getSessionDiagnosis({
        query: { period: 'total' },
        diagnosisId: '   ',
      })
    ).toThrow('diagnosis-id-empty');
  });

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
        staleReason: 'Cost optimization data refresh failed.',
        currentCostUsd: 2,
      })
    );
  });

  it('does not commit a new index when its cache transaction fails', async () => {
    const save = vi
      .fn<CostOptimizationRuntimeDependencies['cacheStore']['save']>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cannot save C:\\private\\cache.json'));
    const runtime = createCostOptimizationRuntime(
      makeRuntimeDependencies({
        cacheStore: {
          load: vi.fn(async () => ({ index: undefined, warning: undefined })),
          save,
        },
      })
    );
    await runtime.initialize();
    await runtime.applyUsageCycle(makeCycleWithOneSource());

    await expect(runtime.applyUsageCycle(makeCycleWithOneSource('2', 2_000_000))).rejects.toThrow(
      'cannot save'
    );
    runtime.markStale(new Error('cannot save C:\\private\\cache.json'));

    expect(runtime.getSnapshot({ period: 'total' })).toEqual(
      expect.objectContaining({
        dataState: 'stale',
        staleReason: 'Cost optimization data refresh failed.',
        currentCostUsd: 2,
      })
    );
  });

  it('retains unavailable candidates after a pricing change and allows removing them', async () => {
    const dependencies = makeRuntimeDependencies();
    const runtime = createCostOptimizationRuntime(dependencies);
    await runtime.initialize();

    await runtime.applyBudgetSnapshot({
      ...makeBudgetSnapshotWithUpdatedPricing(),
      pricing: PRICING.filter(({ modelId }) => modelId !== 'gpt-target'),
    });
    const snapshot = runtime.getSnapshot({ period: 'total' });

    expect(snapshot.settings.candidateModelIds).toContain('gpt-target');
    expect(snapshot.warnings).toContainEqual(expect.stringContaining('gpt-target'));

    await runtime.updateSettings({
      ...snapshot.settings,
      candidateModelIds: [],
    });
    expect(dependencies.configStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ candidateModelIds: [] }),
      }),
      ['gpt-source']
    );
  });

  it('reuses active snapshots when a scan cycle has no index changes', async () => {
    const evaluate = vi.fn(evaluateCostOptimization);
    const dependencies = makeRuntimeDependencies({ evaluate });
    const runtime = createCostOptimizationRuntime(dependencies);
    await runtime.initialize();
    const firstCycle = makeCycleWithOneSource();
    await runtime.applyUsageCycle(firstCycle);
    const evaluationCount = evaluate.mock.calls.length;
    const snapshot = runtime.getSnapshot({ period: 'total' });

    const unchangedCycle: UsageScanCycle = {
      ...firstCycle,
      changes: {
        upserted: [],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
    };
    const unchangedSnapshot = await runtime.applyUsageCycle(unchangedCycle);

    expect(unchangedSnapshot).toBe(snapshot);
    expect(evaluate).toHaveBeenCalledTimes(evaluationCount);
    expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
  });

  it('discards a cache created for a different sessions directory during initialization', async () => {
    const evaluate = vi.fn(evaluateCostOptimization);
    const runtime = createCostOptimizationRuntime(
      makeRuntimeDependencies({
        evaluate,
        cacheStore: {
          load: vi.fn(async () => ({
            index: createEmptyCostOptimizationIndex('C:\\old-sessions', FIXED_NOW),
            warning: undefined,
          })),
          save: vi.fn(async () => undefined),
        },
      })
    );

    await runtime.initialize();

    expect(evaluate.mock.calls.at(-1)?.[0].index.sessionsDir).toBe('C:\\sessions');
    expect(runtime.getSnapshot({ period: 'total' }).warnings).toContain(
      'Cost optimization cache directory changed and will be rebuilt.'
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

const makeCycleWithOneSource = (fingerprint = '1', inputTokens = SOURCE_TOKENS): UsageScanCycle => {
  const change = makeSourceChange('usage.jsonl', fingerprint, inputTokens);
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

const makeEmptyRemovalCycle = (): UsageScanCycle => ({
  result: {
    sessionsDir: 'C:\\sessions',
    scannedAt: FIXED_NOW.toISOString(),
    summary: {
      totals: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
      },
      byDay: [],
      byProject: [],
      sessions: [],
    },
    warnings: [],
  },
  changes: {
    upserted: [],
    removedSourceFiles: ['usage.jsonl'],
    requiresFullRebuild: false,
  },
});
