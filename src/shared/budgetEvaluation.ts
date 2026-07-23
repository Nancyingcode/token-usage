/**
 * @file 预算评估
 * @description
 * 根据用量切片、预算策略和模型价格计算预算进度、严重级别、提醒及未定价模型。
 */
import { getNaturalPeriodRange, normalizeProjectPath } from './budgetPeriods';
import type {
  BudgetAlert,
  BudgetMetric,
  BudgetPolicy,
  BudgetPolicyStatus,
  BudgetProgress,
  BudgetSeverity,
  BudgetSnapshot,
  BudgetThresholds,
  EvaluateBudgetsInput,
  ModelPricingEntry,
  UnpricedModelSummary,
} from './budgetTypes';
import { calculateEstimatedCost, getSessionUsageSlices } from './pricing';
import type { UsageSession, UsageSlice } from './usageTypes';

const PERCENTAGE_SCALE = 100;
const OVER_BUDGET_PERCENT = 100;
const UNKNOWN_MODEL_KEY = '__unknown_model__';

const getSeverity = (percent: number, thresholds: BudgetThresholds): BudgetSeverity => {
  if (percent >= OVER_BUDGET_PERCENT) {
    return 'over';
  }

  if (percent >= thresholds.criticalPercent) {
    return 'critical';
  }

  if (percent >= thresholds.warningPercent) {
    return 'warning';
  }

  return 'normal';
};

const buildProgress = (
  used: number,
  limit: number,
  thresholds: BudgetThresholds,
  incomplete?: boolean
): BudgetProgress => {
  const percent = limit > 0 ? (used / limit) * PERCENTAGE_SCALE : 0;

  return {
    used,
    limit,
    percent,
    severity: getSeverity(percent, thresholds),
    ...(incomplete === undefined ? {} : { incomplete }),
  };
};

const isSliceInPolicy = (
  session: UsageSession,
  slice: UsageSlice,
  policy: BudgetPolicy,
  startTime: number,
  endTime: number
): boolean => {
  const occurredAt = new Date(slice.occurredAt).getTime();
  const matchesTime = !Number.isNaN(occurredAt) && occurredAt >= startTime && occurredAt <= endTime;
  const matchesProject =
    policy.scope === 'global' ||
    normalizeProjectPath(session.projectPath) === normalizeProjectPath(policy.projectPath ?? '');

  return matchesTime && matchesProject;
};

const getPolicySlices = (
  sessions: UsageSession[],
  policy: BudgetPolicy,
  startTime: number,
  endTime: number
): UsageSlice[] =>
  sessions.flatMap((session) =>
    getSessionUsageSlices(session).filter((slice) =>
      isSliceInPolicy(session, slice, policy, startTime, endTime)
    )
  );

const buildPolicyStatus = (
  sessions: UsageSession[],
  policy: BudgetPolicy,
  thresholds: BudgetThresholds,
  pricing: ModelPricingEntry[],
  now: Date
): BudgetPolicyStatus => {
  const range = getNaturalPeriodRange(policy.period, now);
  const slices = getPolicySlices(sessions, policy, range.start.getTime(), range.end.getTime());
  const totalTokens = slices.reduce((total, slice) => total + slice.totalTokens, 0);
  const costEstimate = calculateEstimatedCost(slices, pricing);

  return {
    policy,
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
    ...(policy.tokenLimit === undefined
      ? {}
      : { token: buildProgress(totalTokens, policy.tokenLimit, thresholds) }),
    ...(policy.costLimitUsd === undefined
      ? {}
      : {
          cost: buildProgress(
            costEstimate.pricedCostUsd,
            policy.costLimitUsd,
            thresholds,
            costEstimate.unpricedTokens > 0
          ),
        }),
    unpricedTokens: costEstimate.unpricedTokens,
    unpricedModelIds: costEstimate.unpricedModelIds,
  };
};

const buildAlert = (
  status: BudgetPolicyStatus,
  metric: BudgetMetric,
  thresholdPercent: number,
  severity: Exclude<BudgetSeverity, 'normal'>
): BudgetAlert => {
  const metricLabel = metric === 'token' ? 'Token' : 'Cost';
  const id = `${status.policy.id}:${status.policy.period}:${metric}:${thresholdPercent}:${status.periodStart}`;

  return {
    id,
    policyId: status.policy.id,
    period: status.policy.period,
    periodStart: status.periodStart,
    metric,
    thresholdPercent,
    severity,
    message: `${metricLabel} budget reached ${thresholdPercent}%.`,
  };
};

const buildProgressAlerts = (
  status: BudgetPolicyStatus,
  metric: BudgetMetric,
  progress: BudgetProgress | undefined,
  thresholds: BudgetThresholds
): BudgetAlert[] => {
  if (!progress || progress.percent < thresholds.warningPercent) {
    return [];
  }

  const warningAlert = buildAlert(status, metric, thresholds.warningPercent, 'warning');

  if (progress.percent < thresholds.criticalPercent) {
    return [warningAlert];
  }

  const criticalSeverity = progress.severity === 'over' ? 'over' : 'critical';
  return [warningAlert, buildAlert(status, metric, thresholds.criticalPercent, criticalSeverity)];
};

const buildAlerts = (statuses: BudgetPolicyStatus[], thresholds: BudgetThresholds): BudgetAlert[] =>
  statuses.flatMap((status) => [
    ...buildProgressAlerts(status, 'token', status.token, thresholds),
    ...buildProgressAlerts(status, 'cost', status.cost, thresholds),
  ]);

const getStatusSeverity = (status: BudgetPolicyStatus): BudgetSeverity => {
  const severities = [status.token?.severity, status.cost?.severity];

  if (severities.includes('over')) {
    return 'over';
  }

  if (severities.includes('critical')) {
    return 'critical';
  }

  return severities.includes('warning') ? 'warning' : 'normal';
};

const buildUnpricedModels = (
  sessions: UsageSession[],
  pricing: ModelPricingEntry[]
): UnpricedModelSummary[] => {
  const summariesByModel = new Map<string, UnpricedModelSummary>();

  sessions.flatMap(getSessionUsageSlices).forEach((slice) => {
    const estimate = calculateEstimatedCost([slice], pricing);

    if (estimate.unpricedTokens === 0) {
      return;
    }

    const normalizedModelId = slice.modelId?.trim().toLocaleLowerCase('en-US');
    const key = normalizedModelId || UNKNOWN_MODEL_KEY;
    const current = summariesByModel.get(key);
    summariesByModel.set(key, {
      modelId: slice.modelId?.trim() || undefined,
      totalTokens: (current?.totalTokens ?? 0) + estimate.unpricedTokens,
    });
  });

  return [...summariesByModel.values()].sort((first, second) =>
    (first.modelId ?? '').localeCompare(second.modelId ?? '')
  );
};

export const evaluateBudgets = (input: EvaluateBudgetsInput): BudgetSnapshot => {
  const now = input.now ?? new Date();
  const statuses = input.policies.map((policy) =>
    buildPolicyStatus(input.sessions, policy, input.thresholds, input.pricing, now)
  );
  const statusSeverities = statuses.map(getStatusSeverity);
  const unpricedModels = buildUnpricedModels(input.sessions, input.pricing);

  return {
    generatedAt: now.toISOString(),
    dataState: input.dataState,
    ...(input.staleReason ? { staleReason: input.staleReason } : {}),
    thresholds: input.thresholds,
    statuses,
    alerts: buildAlerts(statuses, input.thresholds),
    summary: {
      warningCount: statusSeverities.filter(
        (severity) => severity === 'warning' || severity === 'critical'
      ).length,
      overCount: statusSeverities.filter((severity) => severity === 'over').length,
      unpricedModelCount: unpricedModels.length,
    },
    pricing: input.pricing,
    unpricedModels,
  };
};
