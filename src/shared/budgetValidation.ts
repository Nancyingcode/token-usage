import type {
  BudgetPeriod,
  BudgetPolicy,
  BudgetPolicyInput,
  BudgetScope,
  BudgetThresholds,
  ModelPricingOverride,
  ModelPricingOverrideInput,
  NotificationReceipt,
  PersistedBudgetConfig,
  ValidationIssue,
} from './budgetTypes';
import { getBudgetBusinessKey } from './budgetPeriods';
import { isRecord } from './runtimeTypes';

const MINIMUM_PERCENT = 0;
const MAXIMUM_PERCENT = 100;
const MINIMUM_PRICE = 0;

export const BUDGET_CONFIG_SCHEMA_VERSION = 1;

const isPositiveFinite = (value: number | undefined): boolean =>
  value !== undefined && Number.isFinite(value) && value > 0;

const isNonNegativeFinite = (value: number): boolean =>
  Number.isFinite(value) && value >= MINIMUM_PRICE;

export const getBudgetPolicyIssues = (input: BudgetPolicyInput): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const hasTokenLimit = isPositiveFinite(input.tokenLimit);
  const hasCostLimit = isPositiveFinite(input.costLimitUsd);

  if (input.scope === 'project' && !input.projectPath?.trim()) {
    issues.push({ field: 'projectPath', message: 'Project is required.' });
  }

  if (input.tokenLimit !== undefined && !hasTokenLimit) {
    issues.push({ field: 'tokenLimit', message: 'Token limit must be greater than 0.' });
  }

  if (input.costLimitUsd !== undefined && !hasCostLimit) {
    issues.push({ field: 'costLimitUsd', message: 'Cost limit must be greater than 0.' });
  }

  if (!hasTokenLimit && !hasCostLimit) {
    issues.push({ field: 'limits', message: 'Enable at least one budget limit.' });
  }

  return issues;
};

export const getThresholdIssues = (input: BudgetThresholds): ValidationIssue[] => {
  const thresholdsAreOrdered = input.warningPercent < input.criticalPercent;
  const thresholdsAreInRange =
    input.warningPercent > MINIMUM_PERCENT && input.criticalPercent <= MAXIMUM_PERCENT;

  return thresholdsAreOrdered && thresholdsAreInRange
    ? []
    : [
        {
          field: 'thresholds',
          message: 'Thresholds must be ordered between 0 and 100.',
        },
      ];
};

export const getPricingOverrideIssues = (input: ModelPricingOverrideInput): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const normalizedAliases = input.aliases.map((alias) => alias.trim().toLocaleLowerCase('en-US'));
  const uniqueAliases = new Set(normalizedAliases.filter(Boolean));

  if (!input.modelId.trim()) {
    issues.push({ field: 'modelId', message: 'Model ID is required.' });
  }

  if (uniqueAliases.size !== normalizedAliases.length) {
    issues.push({ field: 'aliases', message: 'Model aliases must be unique.' });
  }

  if (!isNonNegativeFinite(input.inputUsdPerMillion)) {
    issues.push({ field: 'inputUsdPerMillion', message: 'Input price must be 0 or greater.' });
  }

  if (!isNonNegativeFinite(input.cachedInputUsdPerMillion)) {
    issues.push({
      field: 'cachedInputUsdPerMillion',
      message: 'Cached input price must be 0 or greater.',
    });
  }

  if (!isNonNegativeFinite(input.outputUsdPerMillion)) {
    issues.push({ field: 'outputUsdPerMillion', message: 'Output price must be 0 or greater.' });
  }

  return issues;
};

const isBudgetScope = (value: unknown): value is BudgetScope =>
  value === 'global' || value === 'project';

const isBudgetPeriod = (value: unknown): value is BudgetPeriod =>
  value === 'day' || value === 'week' || value === 'month';

const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || typeof value === 'number';

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isBudgetPolicy = (value: unknown): value is BudgetPolicy => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !isBudgetScope(value.scope) ||
    !isBudgetPeriod(value.period) ||
    !isOptionalString(value.projectPath) ||
    !isOptionalNumber(value.tokenLimit) ||
    !isOptionalNumber(value.costLimitUsd) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return false;
  }

  const policyInput: BudgetPolicyInput = {
    scope: value.scope,
    period: value.period,
    projectPath: value.projectPath,
    tokenLimit: value.tokenLimit,
    costLimitUsd: value.costLimitUsd,
  };

  return getBudgetPolicyIssues(policyInput).length === 0;
};

const isBudgetThresholds = (value: unknown): value is BudgetThresholds =>
  isRecord(value) &&
  typeof value.warningPercent === 'number' &&
  typeof value.criticalPercent === 'number' &&
  getThresholdIssues({
    warningPercent: value.warningPercent,
    criticalPercent: value.criticalPercent,
  }).length === 0;

const isPricingOverride = (value: unknown): value is ModelPricingOverride => {
  if (
    !isRecord(value) ||
    typeof value.modelId !== 'string' ||
    !Array.isArray(value.aliases) ||
    !value.aliases.every((alias) => typeof alias === 'string') ||
    typeof value.inputUsdPerMillion !== 'number' ||
    typeof value.cachedInputUsdPerMillion !== 'number' ||
    typeof value.outputUsdPerMillion !== 'number' ||
    typeof value.updatedAt !== 'string'
  ) {
    return false;
  }

  const pricingInput: ModelPricingOverrideInput = {
    modelId: value.modelId,
    aliases: value.aliases,
    inputUsdPerMillion: value.inputUsdPerMillion,
    cachedInputUsdPerMillion: value.cachedInputUsdPerMillion,
    outputUsdPerMillion: value.outputUsdPerMillion,
  };

  return getPricingOverrideIssues(pricingInput).length === 0;
};

const isNotificationReceipt = (value: unknown): value is NotificationReceipt =>
  isRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.policyId === 'string' &&
  typeof value.periodStart === 'string';

const hasUniqueValues = (values: string[]): boolean => new Set(values).size === values.length;

export const decodePersistedBudgetConfig = (raw: unknown): PersistedBudgetConfig => {
  if (!isRecord(raw) || raw.schemaVersion !== BUDGET_CONFIG_SCHEMA_VERSION) {
    throw new TypeError('Budget configuration has an invalid schema.');
  }

  if (!Array.isArray(raw.policies) || !raw.policies.every(isBudgetPolicy)) {
    throw new TypeError('Budget configuration contains invalid policies.');
  }

  if (!isBudgetThresholds(raw.thresholds)) {
    throw new TypeError('Budget configuration contains invalid thresholds.');
  }

  if (!Array.isArray(raw.pricingOverrides) || !raw.pricingOverrides.every(isPricingOverride)) {
    throw new TypeError('Budget configuration contains invalid pricing overrides.');
  }

  if (
    !Array.isArray(raw.notificationReceipts) ||
    !raw.notificationReceipts.every(isNotificationReceipt)
  ) {
    throw new TypeError('Budget configuration contains invalid notification receipts.');
  }

  const policyIdsAreUnique = hasUniqueValues(raw.policies.map(({ id }) => id));
  const businessKeysAreUnique = hasUniqueValues(raw.policies.map(getBudgetBusinessKey));
  const pricingIdsAreUnique = hasUniqueValues(
    raw.pricingOverrides.map(({ modelId }) => modelId.trim().toLocaleLowerCase('en-US'))
  );

  if (!policyIdsAreUnique || !businessKeysAreUnique || !pricingIdsAreUnique) {
    throw new TypeError('Budget configuration contains duplicate entries.');
  }

  return {
    schemaVersion: raw.schemaVersion,
    policies: raw.policies,
    thresholds: raw.thresholds,
    pricingOverrides: raw.pricingOverrides,
    notificationReceipts: raw.notificationReceipts,
  };
};
