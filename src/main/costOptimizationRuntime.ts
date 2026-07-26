/**
 * @file 成本优化运行时
 * @description
 * 串行协调增量索引、设置、价格、预算和查询快照，并向 IPC 层发布只读分析结果。
 *
 * 约束：
 * - 会话文件始终只读
 * - 价格或设置变化不得重建 Token 索引
 * - 刷新失败只标记 stale，不丢弃最后成功索引
 */
import type { BudgetSnapshot, ModelPricingEntry } from '../shared/budgetTypes';
import {
  applyUsageChangeSet,
  createEmptyCostOptimizationIndex,
  rebuildCostOptimizationIndex,
} from '../shared/costOptimizationIndex';
import {
  evaluateCostOptimization,
  type EvaluateCostOptimizationInput,
} from '../shared/costOptimizationEvaluation';
import type {
  CostOptimizationDataState,
  CostOptimizationIndex,
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  CostOptimizationValidationIssue,
  PersistedCostOptimizationConfig,
} from '../shared/costOptimizationTypes';
import {
  DEFAULT_COST_OPTIMIZATION_SETTINGS,
  getCostOptimizationQueryIssues,
  getCostOptimizationSettingsIssues,
} from '../shared/costOptimizationValidation';
import type { CostOptimizationCacheStore } from './costOptimizationCacheStore';
import type { CostOptimizationConfigStore } from './costOptimizationConfigStore';
import type { UsageScanCycle } from './usageScanner';

type RuntimeListener = (snapshot: CostOptimizationSnapshot) => void;

export interface CostOptimizationRuntimeDependencies {
  configStore: CostOptimizationConfigStore;
  cacheStore: CostOptimizationCacheStore;
  sessionsDir: string;
  defaultPricing: ModelPricingEntry[];
  now?: () => Date;
  evaluate?: (input: EvaluateCostOptimizationInput) => CostOptimizationSnapshot;
}

export interface CostOptimizationRuntime {
  initialize: () => Promise<void>;
  applyUsageCycle: (cycle: UsageScanCycle) => Promise<CostOptimizationSnapshot>;
  applyBudgetSnapshot: (snapshot: BudgetSnapshot) => Promise<CostOptimizationSnapshot>;
  markStale: (error: unknown) => CostOptimizationSnapshot;
  getSnapshot: (query: CostOptimizationQuery) => CostOptimizationSnapshot;
  updateSettings: (settings: CostOptimizationSettings) => Promise<CostOptimizationSnapshot>;
  subscribe: (listener: RuntimeListener) => () => void;
}

export class CostOptimizationRuntimeValidationError extends Error {
  public readonly issues: CostOptimizationValidationIssue[];

  public constructor(issues: CostOptimizationValidationIssue[]) {
    super(issues.map(({ code }) => code).join(' '));
    this.name = 'CostOptimizationRuntimeValidationError';
    this.issues = issues;
  }
}

const DEFAULT_QUERY: CostOptimizationQuery = { period: 'total' };
const EMPTY_CACHE_STATS: CostOptimizationSnapshot['cacheStats'] = {
  upsertedSources: 0,
  removedSources: 0,
  reusedSources: 0,
};

const cloneSettings = (settings: CostOptimizationSettings): CostOptimizationSettings => ({
  ...settings,
  candidateModelIds: [...settings.candidateModelIds],
});

const cloneDefaultSettings = (): CostOptimizationSettings =>
  cloneSettings(DEFAULT_COST_OPTIMIZATION_SETTINGS);

const getQueryKey = (query: CostOptimizationQuery): string =>
  JSON.stringify([query.period, query.projectPath ?? null]);

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getPricingSignature = (pricing: ModelPricingEntry[]): string => JSON.stringify(pricing);

const getBudgetSignature = (snapshot: BudgetSnapshot): string => JSON.stringify(snapshot.statuses);

const getProjectPaths = (index: CostOptimizationIndex): string[] => [
  ...new Set(
    Object.values(index.sources)
      .flatMap(({ contributions }) => contributions)
      .map(({ projectPath }) => projectPath)
  ),
];

const throwForIssues = (issues: CostOptimizationValidationIssue[]): void => {
  if (issues.length > 0) {
    throw new CostOptimizationRuntimeValidationError(issues);
  }
};

export const createCostOptimizationRuntime = (
  dependencies: CostOptimizationRuntimeDependencies
): CostOptimizationRuntime => {
  const now = dependencies.now ?? (() => new Date());
  const evaluate = dependencies.evaluate ?? evaluateCostOptimization;
  const listeners = new Set<RuntimeListener>();
  const warnings = new Set<string>();
  const activeQueries = new Map<string, CostOptimizationQuery>();
  const snapshots = new Map<string, CostOptimizationSnapshot>();
  let operationQueue: Promise<void> = Promise.resolve();
  let index = createEmptyCostOptimizationIndex(dependencies.sessionsDir, now());
  let settings = cloneDefaultSettings();
  let pricing = dependencies.defaultPricing;
  let budgets: BudgetSnapshot['statuses'] = [];
  let dataState: CostOptimizationDataState = 'fresh';
  let staleReason: string | undefined;
  let cacheStats = { ...EMPTY_CACHE_STATS };
  let pricingSignature = getPricingSignature(pricing);
  let budgetSignature = JSON.stringify(budgets);

  activeQueries.set(getQueryKey(DEFAULT_QUERY), DEFAULT_QUERY);

  const evaluateQuery = (query: CostOptimizationQuery): CostOptimizationSnapshot =>
    evaluate({
      index,
      query,
      settings,
      pricing,
      budgets,
      now: now(),
      dataState,
      staleReason,
      warnings: [...warnings],
      cacheStats,
    });

  const reevaluateActiveQueries = (publish: boolean): CostOptimizationSnapshot => {
    let defaultSnapshot: CostOptimizationSnapshot | undefined;

    activeQueries.forEach((query, key) => {
      const snapshot = evaluateQuery(query);
      snapshots.set(key, snapshot);

      if (key === getQueryKey(DEFAULT_QUERY)) {
        defaultSnapshot = snapshot;
      }
      if (publish) {
        listeners.forEach((listener) => listener(snapshot));
      }
    });

    if (!defaultSnapshot) {
      defaultSnapshot = evaluateQuery(DEFAULT_QUERY);
      snapshots.set(getQueryKey(DEFAULT_QUERY), defaultSnapshot);
    }

    return defaultSnapshot;
  };

  const enqueue = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = operationQueue.then(operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };

  const initialize = (): Promise<void> =>
    enqueue(async () => {
      const pricedModelIds = dependencies.defaultPricing.map(({ modelId }) => modelId);
      const [configResult, cacheResult] = await Promise.all([
        dependencies.configStore.load(pricedModelIds),
        dependencies.cacheStore.load(),
      ]);
      settings = cloneSettings(configResult.config.settings);
      index =
        cacheResult.index ?? createEmptyCostOptimizationIndex(dependencies.sessionsDir, now());
      [configResult.warning, cacheResult.warning].forEach((warning) => {
        if (warning) {
          warnings.add(warning);
        }
      });
      reevaluateActiveQueries(false);
    });

  const applyUsageCycle = (cycle: UsageScanCycle): Promise<CostOptimizationSnapshot> =>
    enqueue(async () => {
      const currentSourceFiles = new Set(
        cycle.result.summary.sessions.map(({ sourceFile }) => sourceFile)
      );
      const reconciledRemovedSourceFiles = Object.keys(index.sources).filter(
        (sourceFile) => !currentSourceFiles.has(sourceFile)
      );
      const removedSourceFiles = [
        ...new Set([...cycle.changes.removedSourceFiles, ...reconciledRemovedSourceFiles]),
      ];
      const requiresFullRebuild =
        cycle.changes.requiresFullRebuild || index.sessionsDir !== cycle.result.sessionsDir;
      const changes = {
        upserted: cycle.changes.upserted,
        removedSourceFiles,
        requiresFullRebuild,
      };

      index = requiresFullRebuild
        ? rebuildCostOptimizationIndex(cycle.result.sessionsDir, changes.upserted, now())
        : applyUsageChangeSet(index, changes, now());
      const indexChanged =
        requiresFullRebuild || changes.upserted.length > 0 || changes.removedSourceFiles.length > 0;

      if (indexChanged) {
        await dependencies.cacheStore.save(index);
      }

      const changedSourceFiles = new Set(changes.upserted.map(({ sourceFile }) => sourceFile));
      cacheStats = {
        upsertedSources: changedSourceFiles.size,
        removedSources: changes.removedSourceFiles.length,
        reusedSources: Math.max(currentSourceFiles.size - changedSourceFiles.size, 0),
      };
      dataState = 'fresh';
      staleReason = undefined;
      return reevaluateActiveQueries(true);
    });

  const applyBudgetSnapshot = (snapshot: BudgetSnapshot): Promise<CostOptimizationSnapshot> =>
    enqueue(async () => {
      const nextPricingSignature = getPricingSignature(snapshot.pricing);
      const nextBudgetSignature = getBudgetSignature(snapshot);
      const pricingChanged = nextPricingSignature !== pricingSignature;
      const budgetsChanged = nextBudgetSignature !== budgetSignature;

      if (!pricingChanged && !budgetsChanged) {
        return snapshots.get(getQueryKey(DEFAULT_QUERY)) ?? reevaluateActiveQueries(false);
      }

      pricing = snapshot.pricing;
      budgets = snapshot.statuses;
      pricingSignature = nextPricingSignature;
      budgetSignature = nextBudgetSignature;
      return reevaluateActiveQueries(true);
    });

  const markStale = (error: unknown): CostOptimizationSnapshot => {
    dataState = 'stale';
    staleReason = getErrorMessage(error);
    return reevaluateActiveQueries(true);
  };

  const getSnapshot = (query: CostOptimizationQuery): CostOptimizationSnapshot => {
    throwForIssues(getCostOptimizationQueryIssues(query, getProjectPaths(index)));
    const key = getQueryKey(query);
    activeQueries.set(key, { ...query });
    const cachedSnapshot = snapshots.get(key);

    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    const snapshot = evaluateQuery(query);
    snapshots.set(key, snapshot);
    return snapshot;
  };

  const updateSettings = (
    nextSettings: CostOptimizationSettings
  ): Promise<CostOptimizationSnapshot> =>
    enqueue(async () => {
      const pricedModelIds = pricing.map(({ modelId }) => modelId);
      throwForIssues(getCostOptimizationSettingsIssues(nextSettings, pricedModelIds));
      const config: PersistedCostOptimizationConfig = {
        schemaVersion: 1,
        settings: cloneSettings(nextSettings),
      };
      await dependencies.configStore.save(config, pricedModelIds);
      settings = cloneSettings(nextSettings);
      return reevaluateActiveQueries(true);
    });

  const subscribe = (listener: RuntimeListener): (() => void) => {
    let subscribed = true;
    listeners.add(listener);

    return () => {
      if (!subscribed) {
        return;
      }

      listeners.delete(listener);
      subscribed = false;
    };
  };

  return {
    initialize,
    applyUsageCycle,
    applyBudgetSnapshot,
    markStale,
    getSnapshot,
    updateSettings,
    subscribe,
  };
};
