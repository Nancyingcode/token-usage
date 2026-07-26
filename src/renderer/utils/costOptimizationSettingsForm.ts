/**
 * @file 成本优化设置表单
 * @description 在字符串表单状态与已校验的成本优化设置之间执行无副作用转换。
 */
import type {
  CostOptimizationSettings,
  CostOptimizationValidationIssue,
} from '../../shared/costOptimizationTypes';
import { getCostOptimizationSettingsIssues } from '../../shared/costOptimizationValidation';
import { isRecord } from '../../shared/runtimeTypes';

export interface CostOptimizationSettingsForm {
  anomalyHistoryWindow: string;
  anomalyMinimumSamples: string;
  anomalySensitivity: string;
  forecastHorizonDays: string;
  forecastMinimumHistoryDays: string;
  candidateModelIds: string[];
  minimumSavingsUsd: string;
  targetCachePercentage: string;
  minimumPricingCoveragePercentage: string;
}

export type CostOptimizationSettingsFormField = keyof CostOptimizationSettingsForm;

const VALIDATION_CODES = new Set<CostOptimizationValidationIssue['code']>([
  'history-window-range',
  'minimum-samples-range',
  'sensitivity-range',
  'forecast-horizon-invalid',
  'forecast-history-range',
  'candidate-model-duplicate',
  'candidate-model-unpriced',
  'minimum-savings-range',
  'percentage-range',
  'project-not-found',
]);

export const createCostOptimizationSettingsForm = (
  settings: CostOptimizationSettings
): CostOptimizationSettingsForm => ({
  anomalyHistoryWindow: String(settings.anomalyHistoryWindow),
  anomalyMinimumSamples: String(settings.anomalyMinimumSamples),
  anomalySensitivity: String(settings.anomalySensitivity),
  forecastHorizonDays: String(settings.forecastHorizonDays),
  forecastMinimumHistoryDays: String(settings.forecastMinimumHistoryDays),
  candidateModelIds: [...settings.candidateModelIds],
  minimumSavingsUsd: String(settings.minimumSavingsUsd),
  targetCachePercentage: String(settings.targetCachePercentage),
  minimumPricingCoveragePercentage: String(settings.minimumPricingCoveragePercentage),
});

export const updateCostOptimizationSettingsForm = (
  form: CostOptimizationSettingsForm,
  field: CostOptimizationSettingsFormField,
  value: string
): CostOptimizationSettingsForm => {
  if (field === 'candidateModelIds') {
    const candidateModelIds = form.candidateModelIds.includes(value)
      ? form.candidateModelIds.filter((modelId) => modelId !== value)
      : [...form.candidateModelIds, value];

    return { ...form, candidateModelIds };
  }

  return { ...form, [field]: value };
};

export const toCostOptimizationSettings = (
  form: CostOptimizationSettingsForm
): CostOptimizationSettings => ({
  anomalyHistoryWindow: Number(form.anomalyHistoryWindow),
  anomalyMinimumSamples: Number(form.anomalyMinimumSamples),
  anomalySensitivity: Number(form.anomalySensitivity),
  forecastHorizonDays: Number(
    form.forecastHorizonDays
  ) as CostOptimizationSettings['forecastHorizonDays'],
  forecastMinimumHistoryDays: Number(form.forecastMinimumHistoryDays),
  candidateModelIds: [...form.candidateModelIds],
  minimumSavingsUsd: Number(form.minimumSavingsUsd),
  targetCachePercentage: Number(form.targetCachePercentage),
  minimumPricingCoveragePercentage: Number(form.minimumPricingCoveragePercentage),
});

export const getCostOptimizationSettingsFormIssues = (
  form: CostOptimizationSettingsForm,
  pricedModelIds: string[]
): CostOptimizationValidationIssue[] =>
  getCostOptimizationSettingsIssues(toCostOptimizationSettings(form), pricedModelIds);

const isCostOptimizationValidationIssue = (
  value: unknown
): value is CostOptimizationValidationIssue =>
  isRecord(value) &&
  typeof value.field === 'string' &&
  typeof value.code === 'string' &&
  VALIDATION_CODES.has(value.code as CostOptimizationValidationIssue['code']);

export const getCostOptimizationIpcIssues = (error: unknown): CostOptimizationValidationIssue[] =>
  isRecord(error) && Array.isArray(error.issues)
    ? error.issues.filter(isCostOptimizationValidationIssue)
    : [];
