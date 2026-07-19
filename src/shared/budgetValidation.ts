import type {
  BudgetPolicyInput,
  BudgetThresholds,
  ModelPricingOverrideInput,
  ValidationIssue,
} from './budgetTypes';

const MINIMUM_PERCENT = 0;
const MAXIMUM_PERCENT = 100;
const MINIMUM_PRICE = 0;

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
