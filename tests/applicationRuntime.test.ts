import { describe, expect, it, vi } from 'vitest';
import {
  createApplicationRuntime,
  type ApplicationRuntimeDependencies,
} from '../src/main/applicationRuntime';
import type { BudgetRuntime } from '../src/main/budgetRuntime';
import type { CostOptimizationRuntime } from '../src/main/costOptimizationRuntime';
import type { UsageRuntime } from '../src/main/usageRuntime';
import type { BudgetSnapshot } from '../src/shared/budgetTypes';
import type {
  CostOptimizationSnapshot,
  SessionDiagnosisRequest,
} from '../src/shared/costOptimizationTypes';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../src/shared/costOptimizationValidation';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult } from '../src/shared/usageTypes';
import type { UsageScanCycle } from '../src/main/usageScanner';

const TIMESTAMP = '2026-07-20T10:00:00.000Z';
const USAGE_RESULT: UsageScanResult = {
  sessionsDir: 'C:\\codex\\sessions',
  scannedAt: TIMESTAMP,
  summary: buildUsageSummary([]),
  warnings: [],
};
const USAGE_CYCLE: UsageScanCycle = {
  result: USAGE_RESULT,
  changes: {
    upserted: [],
    removedSourceFiles: [],
    requiresFullRebuild: false,
  },
};
const BUDGET_SNAPSHOT: BudgetSnapshot = {
  generatedAt: TIMESTAMP,
  dataState: 'fresh',
  thresholds: {
    warningPercent: 80,
    criticalPercent: 100,
  },
  statuses: [],
  alerts: [],
  summary: {
    warningCount: 0,
    overCount: 0,
    unpricedModelCount: 0,
  },
  pricing: [],
  unpricedModels: [],
};
const COST_SNAPSHOT: CostOptimizationSnapshot = {
  generatedAt: TIMESTAMP,
  dataState: 'fresh',
  warnings: [],
  settings: {
    ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
    candidateModelIds: [...DEFAULT_COST_OPTIMIZATION_SETTINGS.candidateModelIds],
  },
  query: { period: 'total' },
  pricing: [],
  budgets: [],
  coverage: {
    pricedTokens: 0,
    exactPricedTokens: 0,
    assumedTokens: 0,
    unpricedTokens: 0,
    totalTokens: 0,
    percentage: 100,
    exactPercentage: 100,
    assumedPercentage: 0,
    unpricedModelIds: [],
  },
  currentCostUsd: 0,
  modelRows: [],
  substitutionScenarios: [],
  anomalies: [],
  diagnostics: [],
  forecast: {
    kind: 'insufficient-data',
    requiredHistoryDays: DEFAULT_COST_OPTIMIZATION_SETTINGS.forecastMinimumHistoryDays,
    actualHistoryDays: 0,
    coverage: {
      pricedTokens: 0,
      exactPricedTokens: 0,
      assumedTokens: 0,
      unpricedTokens: 0,
      totalTokens: 0,
      percentage: 100,
      exactPercentage: 100,
      assumedPercentage: 0,
      unpricedModelIds: [],
    },
    budgetCrossings: [],
  },
  recommendations: [],
  conservativeSavingsUsd: 0,
  cacheStats: {
    upsertedSources: 0,
    removedSources: 0,
    reusedSources: 0,
  },
};

describe('application runtime', () => {
  it('distributes one usage cycle to budget and cost analysis in order', async () => {
    const callOrder: string[] = [];
    const harness = makeRuntimeHarness(callOrder);
    const runtime = createApplicationRuntime(harness.dependencies);

    await runtime.initialize();
    callOrder.splice(0);
    await runtime.refresh();

    await vi.waitFor(() => {
      expect(harness.costRuntime.applyUsageCycle).toHaveBeenCalledOnce();
    });

    expect(harness.usageRuntime.refresh).toHaveBeenCalledOnce();
    expect(harness.budgetRuntime.applyUsageResult).toHaveBeenCalledOnce();
    expect(harness.costRuntime.applyUsageCycle).toHaveBeenCalledOnce();
    expect(callOrder).toEqual(['budget-usage', 'cost-budget', 'cost-usage']);
  });

  it('returns usage before background analysis finishes', async () => {
    const analysisFinished = deferred<BudgetSnapshot>();
    const harness = makeRuntimeHarness();
    harness.budgetRuntime.applyUsageResult = vi.fn(() => analysisFinished.promise);
    const runtime = createApplicationRuntime(harness.dependencies);

    await runtime.initialize();
    await expect(runtime.refresh()).resolves.toBe(USAGE_RESULT);
    expect(harness.costRuntime.applyUsageCycle).not.toHaveBeenCalled();

    analysisFinished.resolve(BUDGET_SNAPSHOT);
    await vi.waitFor(() => {
      expect(harness.costRuntime.applyUsageCycle).toHaveBeenCalledOnce();
    });
  });

  it('processes usage cycles sequentially in the background', async () => {
    const firstBudget = deferred<BudgetSnapshot>();
    const callOrder: string[] = [];
    const harness = makeRuntimeHarness(callOrder);
    harness.budgetRuntime.applyUsageResult = vi
      .fn<() => Promise<BudgetSnapshot>>()
      .mockReturnValueOnce(firstBudget.promise)
      .mockImplementationOnce(async () => {
        callOrder.push('second-budget');
        return BUDGET_SNAPSHOT;
      });
    const runtime = createApplicationRuntime(harness.dependencies);

    await runtime.initialize();
    callOrder.splice(0);
    harness.emitUsageCycle(USAGE_CYCLE);
    harness.emitUsageCycle({
      ...USAGE_CYCLE,
      result: { ...USAGE_RESULT, scannedAt: '2026-07-20T10:01:00.000Z' },
    });
    await vi.waitFor(() => {
      expect(harness.budgetRuntime.applyUsageResult).toHaveBeenCalledTimes(1);
    });

    firstBudget.resolve(BUDGET_SNAPSHOT);
    await vi.waitFor(() => {
      expect(harness.budgetRuntime.applyUsageResult).toHaveBeenCalledTimes(2);
    });
    expect(callOrder.indexOf('cost-usage')).toBeLessThan(callOrder.indexOf('second-budget'));
  });

  it('marks both analysis runtimes stale after a usage error', async () => {
    const harness = makeRuntimeHarness();
    const runtime = createApplicationRuntime(harness.dependencies);
    const error = new Error('disk unavailable');

    await runtime.initialize();
    harness.emitUsageError(error);

    expect(harness.budgetRuntime.markUsageStale).toHaveBeenCalledWith(error);
    expect(harness.costRuntime.markStale).toHaveBeenCalledWith(error);
  });

  it('finishes critical initialization before cost optimization is ready', async () => {
    const costReady = deferred<void>();
    const harness = makeRuntimeHarness();
    harness.costRuntime.initialize = vi.fn(() => costReady.promise);
    const runtime = createApplicationRuntime(harness.dependencies);

    await expect(runtime.initialize()).resolves.toBeUndefined();
    expect(harness.budgetRuntime.initialize).toHaveBeenCalledOnce();
    expect(harness.costRuntime.applyBudgetSnapshot).not.toHaveBeenCalled();

    costReady.resolve();
    await expect(runtime.waitForCostOptimization()).resolves.toBeUndefined();
    expect(harness.costRuntime.applyBudgetSnapshot).toHaveBeenCalledWith(BUDGET_SNAPSHOT);
  });
});

interface RuntimeHarness {
  dependencies: ApplicationRuntimeDependencies;
  usageRuntime: UsageRuntime;
  budgetRuntime: BudgetRuntime;
  costRuntime: CostOptimizationRuntime;
  emitUsageError: (error: unknown) => void;
  emitUsageCycle: (cycle: UsageScanCycle) => void;
}

const makeRuntimeHarness = (callOrder: string[] = []): RuntimeHarness => {
  let cycleListener: ((cycle: UsageScanCycle) => void | Promise<void>) | undefined;
  let errorListener: ((error: unknown) => void) | undefined;
  const usageRuntime: UsageRuntime = {
    refresh: vi.fn(async () => {
      void cycleListener?.(USAGE_CYCLE);
      return USAGE_RESULT;
    }),
    getInitialUsage: vi.fn(async () => USAGE_RESULT),
    refreshOnFocus: vi.fn(async () => undefined),
    updateSessionsDir: vi.fn(async () => USAGE_RESULT),
    getResult: vi.fn(() => USAGE_RESULT),
    subscribe: vi.fn(() => () => undefined),
    subscribeCycle: vi.fn((listener) => {
      cycleListener = listener;
      return () => undefined;
    }),
    subscribeError: vi.fn((listener) => {
      errorListener = listener;
      return () => undefined;
    }),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const budgetRuntime: BudgetRuntime = {
    initialize: vi.fn(async () => undefined),
    applyUsageResult: vi.fn(async () => {
      callOrder.push('budget-usage');
      return BUDGET_SNAPSHOT;
    }),
    markUsageStale: vi.fn(() => BUDGET_SNAPSHOT),
    getSnapshot: vi.fn(() => BUDGET_SNAPSHOT),
    savePolicy: vi.fn(async () => BUDGET_SNAPSHOT),
    deletePolicy: vi.fn(async () => BUDGET_SNAPSHOT),
    updateThresholds: vi.fn(async () => BUDGET_SNAPSHOT),
    savePricingOverride: vi.fn(async () => BUDGET_SNAPSHOT),
    resetPricingOverride: vi.fn(async () => BUDGET_SNAPSHOT),
    saveUnknownModelPricing: vi.fn(async () => BUDGET_SNAPSHOT),
    deleteUnknownModelPricing: vi.fn(async () => BUDGET_SNAPSHOT),
    subscribe: vi.fn(() => () => undefined),
    subscribeNavigation: vi.fn(() => () => undefined),
    navigateToPolicy: vi.fn(),
  };
  const costRuntime: CostOptimizationRuntime = {
    initialize: vi.fn(async () => undefined),
    applyUsageCycle: vi.fn(async () => {
      callOrder.push('cost-usage');
      return COST_SNAPSHOT;
    }),
    applyBudgetSnapshot: vi.fn(async () => {
      callOrder.push('cost-budget');
      return COST_SNAPSHOT;
    }),
    markStale: vi.fn(() => COST_SNAPSHOT),
    getSnapshot: vi.fn(() => COST_SNAPSHOT),
    getSessionDiagnosis: vi.fn(({ diagnosisId }: SessionDiagnosisRequest) => ({
      kind: 'not-found' as const,
      diagnosisId,
    })),
    updateSettings: vi.fn(async () => COST_SNAPSHOT),
    subscribe: vi.fn(() => () => undefined),
  };

  return {
    dependencies: {
      usageRuntime,
      budgetRuntime,
      costRuntime,
    },
    usageRuntime,
    budgetRuntime,
    costRuntime,
    emitUsageError: (error) => errorListener?.(error),
    emitUsageCycle: (cycle) => {
      void cycleListener?.(cycle);
    },
  };
};

const deferred = <Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} => {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
};
