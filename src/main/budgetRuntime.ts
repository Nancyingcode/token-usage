/**
 * @file 预算运行时
 * @description
 * 协调预算配置、用量评估、通知发送和快照订阅，为 IPC 层提供统一的预算操作边界。
 */
import { randomUUID } from 'node:crypto';
import { evaluateBudgets } from '../shared/budgetEvaluation';
import { getBudgetBusinessKey } from '../shared/budgetPeriods';
import type {
  BudgetAlert,
  BudgetPolicy,
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingEntry,
  ModelPricingOverride,
  ModelPricingOverrideInput,
  PersistedBudgetConfig,
  ValidationIssue,
} from '../shared/budgetTypes';
import {
  getBudgetPolicyIssues,
  getPricingOverrideIssues,
  getThresholdIssues,
} from '../shared/budgetValidation';
import { recordNotifications, selectPendingNotifications } from '../shared/notificationPolicy';
import { mergeModelPricing } from '../shared/pricing';
import type { UsageScanResult } from '../shared/usageTypes';
import { DEFAULT_BUDGET_CONFIG, type BudgetStore } from './budgetStore';
import { createUsageMonitor } from './usageMonitor';

export type RuntimeListener = (snapshot: BudgetSnapshot) => void;
export type RuntimeNavigationListener = (policyId: string) => void;
export type RuntimeUsageListener = (result: UsageScanResult) => void;

export interface BudgetRuntimeDependencies {
  store: BudgetStore;
  scan: () => Promise<UsageScanResult>;
  defaultPricing: ModelPricingEntry[];
  notify: (alert: BudgetAlert) => boolean | void;
  now?: () => Date;
  createId?: () => string;
}

export interface BudgetRuntime {
  initialize: () => Promise<void>;
  refresh: () => Promise<UsageScanResult>;
  getSnapshot: () => BudgetSnapshot;
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  subscribe: (listener: RuntimeListener) => () => void;
  subscribeUsage: (listener: RuntimeUsageListener) => () => void;
  subscribeNavigation: (listener: RuntimeNavigationListener) => () => void;
  navigateToPolicy: (policyId: string) => void;
  start: () => void;
  stop: () => void;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
}

export class BudgetRuntimeValidationError extends Error {
  public readonly issues: ValidationIssue[];

  public constructor(issues: ValidationIssue[]) {
    super(issues.map(({ message }) => message).join(' '));
    this.name = 'BudgetRuntimeValidationError';
    this.issues = issues;
  }
}

const cloneDefaultConfig = (): PersistedBudgetConfig => ({
  ...DEFAULT_BUDGET_CONFIG,
  thresholds: { ...DEFAULT_BUDGET_CONFIG.thresholds },
  policies: [],
  pricingOverrides: [],
  notificationReceipts: [],
});

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const throwForIssues = (issues: ValidationIssue[]): void => {
  if (issues.length > 0) {
    throw new BudgetRuntimeValidationError(issues);
  }
};

const getNotificationGroupKey = (alert: BudgetAlert): string =>
  `${alert.policyId}:${alert.periodStart}:${alert.metric}`;

const groupPendingAlerts = (alerts: BudgetAlert[]): BudgetAlert[][] => {
  const groups = new Map<string, BudgetAlert[]>();

  alerts.forEach((alert) => {
    const key = getNotificationGroupKey(alert);
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  });

  return [...groups.values()];
};

const getHighestThresholdAlert = (alerts: BudgetAlert[]): BudgetAlert | undefined =>
  alerts.reduce<BudgetAlert | undefined>(
    (highest, alert) =>
      !highest || alert.thresholdPercent > highest.thresholdPercent ? alert : highest,
    undefined
  );

export const createBudgetRuntime = (dependencies: BudgetRuntimeDependencies): BudgetRuntime => {
  const now = dependencies.now ?? (() => new Date());
  const createId = dependencies.createId ?? randomUUID;
  const listeners = new Set<RuntimeListener>();
  const usageListeners = new Set<RuntimeUsageListener>();
  const navigationListeners = new Set<RuntimeNavigationListener>();
  let config = cloneDefaultConfig();
  let lastUsageResult: UsageScanResult | undefined;
  let snapshot = evaluateBudgets({
    sessions: [],
    policies: config.policies,
    thresholds: config.thresholds,
    pricing: mergeModelPricing(dependencies.defaultPricing, config.pricingOverrides),
    now: now(),
    dataState: 'fresh',
  });

  const publish = (): void => {
    listeners.forEach((listener) => listener(snapshot));
  };

  const buildSnapshot = (
    dataState: BudgetSnapshot['dataState'],
    staleReason?: string
  ): BudgetSnapshot =>
    evaluateBudgets({
      sessions: lastUsageResult?.summary.sessions ?? [],
      policies: config.policies,
      thresholds: config.thresholds,
      pricing: mergeModelPricing(dependencies.defaultPricing, config.pricingOverrides),
      now: now(),
      dataState,
      staleReason,
    });

  const processNotifications = async (nextSnapshot: BudgetSnapshot): Promise<void> => {
    const pendingAlerts = selectPendingNotifications(
      nextSnapshot.alerts,
      config.notificationReceipts
    );
    const notifiedAlerts: BudgetAlert[] = [];

    groupPendingAlerts(pendingAlerts).forEach((alerts) => {
      const highestAlert = getHighestThresholdAlert(alerts);

      if (!highestAlert) {
        return;
      }

      try {
        const notificationResult = dependencies.notify(highestAlert);

        if (notificationResult !== false) {
          notifiedAlerts.push(...alerts);
        }
      } catch {
        return;
      }
    });

    const notificationReceipts = recordNotifications(
      config.notificationReceipts,
      notifiedAlerts,
      config.policies.map(({ id }) => id)
    );
    const receiptsChanged =
      JSON.stringify(notificationReceipts) !== JSON.stringify(config.notificationReceipts);

    if (receiptsChanged) {
      const nextConfig = { ...config, notificationReceipts };
      await dependencies.store.save(nextConfig);
      config = nextConfig;
    }
  };

  const reevaluateAndPublish = async (): Promise<BudgetSnapshot> => {
    const nextSnapshot = buildSnapshot('fresh');
    await processNotifications(nextSnapshot);
    snapshot = nextSnapshot;
    publish();
    return snapshot;
  };

  const scanAndEvaluate = async (): Promise<UsageScanResult> => {
    const result = await dependencies.scan();
    lastUsageResult = result;
    await reevaluateAndPublish();
    usageListeners.forEach((listener) => listener(result));
    return result;
  };

  const handleScanError = (error: unknown): void => {
    snapshot = buildSnapshot('stale', getErrorMessage(error));
    publish();
  };

  const monitor = createUsageMonitor({
    scan: scanAndEvaluate,
    onUpdate: () => undefined,
    onError: handleScanError,
    now: () => now().getTime(),
    setIntervalFn: (callback, delay) => setInterval(callback, delay),
    clearIntervalFn: (intervalId) => clearInterval(intervalId),
  });

  const saveConfigAndReevaluate = async (
    nextConfig: PersistedBudgetConfig
  ): Promise<BudgetSnapshot> => {
    await dependencies.store.save(nextConfig);
    config = nextConfig;
    return reevaluateAndPublish();
  };

  const initialize = async (): Promise<void> => {
    const result = await dependencies.store.load();
    config = result.config;
    snapshot = buildSnapshot('fresh', result.warnings[0]);
  };

  const savePolicy = async (input: BudgetPolicyInput): Promise<BudgetSnapshot> => {
    throwForIssues(getBudgetPolicyIssues(input));

    const existingPolicy = input.id ? config.policies.find(({ id }) => id === input.id) : undefined;

    if (input.id && !existingPolicy) {
      throw new BudgetRuntimeValidationError([
        { field: 'id', message: 'Budget policy was not found.' },
      ]);
    }

    const businessKey = getBudgetBusinessKey(input);
    const duplicatePolicy = config.policies.find(
      (policy) => policy.id !== input.id && getBudgetBusinessKey(policy) === businessKey
    );

    if (duplicatePolicy) {
      throw new BudgetRuntimeValidationError([
        { field: 'businessKey', message: 'A budget already exists for this scope.' },
      ]);
    }

    const timestamp = now().toISOString();
    const policy: BudgetPolicy = {
      id: existingPolicy?.id ?? createId(),
      scope: input.scope,
      ...(input.scope === 'project' ? { projectPath: input.projectPath?.trim() } : {}),
      period: input.period,
      ...(input.tokenLimit === undefined ? {} : { tokenLimit: input.tokenLimit }),
      ...(input.costLimitUsd === undefined ? {} : { costLimitUsd: input.costLimitUsd }),
      createdAt: existingPolicy?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const policies = existingPolicy
      ? config.policies.map((current) => (current.id === policy.id ? policy : current))
      : [...config.policies, policy];

    return saveConfigAndReevaluate({ ...config, policies });
  };

  const deletePolicy = async (id: string): Promise<BudgetSnapshot> => {
    const policies = config.policies.filter((policy) => policy.id !== id);
    const activePolicyIds = policies.map((policy) => policy.id);
    const notificationReceipts = recordNotifications(
      config.notificationReceipts,
      [],
      activePolicyIds
    );

    return saveConfigAndReevaluate({ ...config, policies, notificationReceipts });
  };

  const updateThresholds = async (thresholds: BudgetThresholds): Promise<BudgetSnapshot> => {
    throwForIssues(getThresholdIssues(thresholds));
    return saveConfigAndReevaluate({ ...config, thresholds: { ...thresholds } });
  };

  const savePricingOverride = async (input: ModelPricingOverrideInput): Promise<BudgetSnapshot> => {
    throwForIssues(getPricingOverrideIssues(input));

    const normalizedModelId = input.modelId.trim().toLocaleLowerCase('en-US');
    const pricingOverride: ModelPricingOverride = {
      ...input,
      modelId: input.modelId.trim(),
      aliases: input.aliases.map((alias) => alias.trim()),
      updatedAt: now().toISOString(),
    };
    const existingOverride = config.pricingOverrides.some(
      ({ modelId }) => modelId.toLocaleLowerCase('en-US') === normalizedModelId
    );
    const pricingOverrides = existingOverride
      ? config.pricingOverrides.map((current) =>
          current.modelId.toLocaleLowerCase('en-US') === normalizedModelId
            ? pricingOverride
            : current
        )
      : [...config.pricingOverrides, pricingOverride];

    return saveConfigAndReevaluate({ ...config, pricingOverrides });
  };

  const resetPricingOverride = async (modelId: string): Promise<BudgetSnapshot> => {
    const normalizedModelId = modelId.trim().toLocaleLowerCase('en-US');
    const pricingOverrides = config.pricingOverrides.filter(
      (current) => current.modelId.toLocaleLowerCase('en-US') !== normalizedModelId
    );

    return saveConfigAndReevaluate({ ...config, pricingOverrides });
  };

  const subscribe = (listener: RuntimeListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const subscribeNavigation = (listener: RuntimeNavigationListener): (() => void) => {
    navigationListeners.add(listener);
    return () => navigationListeners.delete(listener);
  };

  const subscribeUsage = (listener: RuntimeUsageListener): (() => void) => {
    usageListeners.add(listener);
    return () => usageListeners.delete(listener);
  };

  const navigateToPolicy = (policyId: string): void => {
    navigationListeners.forEach((listener) => listener(policyId));
  };

  return {
    initialize,
    refresh: monitor.refresh,
    getSnapshot: () => snapshot,
    savePolicy,
    deletePolicy,
    updateThresholds,
    savePricingOverride,
    resetPricingOverride,
    subscribe,
    subscribeUsage,
    subscribeNavigation,
    navigateToPolicy,
    start: monitor.start,
    stop: monitor.stop,
    refreshOnFocus: monitor.refreshOnFocus,
  };
};
