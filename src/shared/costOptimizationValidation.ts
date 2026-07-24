import type {
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationValidationIssue,
} from './costOptimizationTypes';

const MIN_HISTORY_WINDOW = 7;
const MAX_HISTORY_WINDOW = 90;
const MIN_ANOMALY_SAMPLES = 3;
const MIN_SENSITIVITY = 1;
const MAX_SENSITIVITY = 10;
const MIN_FORECAST_HISTORY = 7;
const MAX_FORECAST_HISTORY = 28;
const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;

export const DEFAULT_COST_OPTIMIZATION_SETTINGS: CostOptimizationSettings = {
  anomalyHistoryWindow: 28,
  anomalyMinimumSamples: 7,
  anomalySensitivity: 3.5,
  forecastHorizonDays: 30,
  forecastMinimumHistoryDays: 7,
  candidateModelIds: [],
  minimumSavingsUsd: 1,
  targetCachePercentage: 80,
  minimumPricingCoveragePercentage: 80,
};

const isFiniteInRange = (value: number, minimum: number, maximum: number): boolean =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

const normalizeModelId = (modelId: string): string => modelId.trim().toLocaleLowerCase('en-US');

export const getCostOptimizationSettingsIssues = (
  settings: CostOptimizationSettings,
  pricedModelIds: string[] = settings.candidateModelIds
): CostOptimizationValidationIssue[] => {
  const issues: CostOptimizationValidationIssue[] = [];
  const normalizedPricedIds = new Set(pricedModelIds.map(normalizeModelId));
  const seenCandidateIds = new Set<string>();

  if (
    !Number.isInteger(settings.anomalyHistoryWindow) ||
    !isFiniteInRange(settings.anomalyHistoryWindow, MIN_HISTORY_WINDOW, MAX_HISTORY_WINDOW)
  ) {
    issues.push({ field: 'anomalyHistoryWindow', code: 'history-window-range' });
  }
  if (
    !Number.isInteger(settings.anomalyMinimumSamples) ||
    !isFiniteInRange(
      settings.anomalyMinimumSamples,
      MIN_ANOMALY_SAMPLES,
      settings.anomalyHistoryWindow
    )
  ) {
    issues.push({ field: 'anomalyMinimumSamples', code: 'minimum-samples-range' });
  }
  if (!isFiniteInRange(settings.anomalySensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY)) {
    issues.push({ field: 'anomalySensitivity', code: 'sensitivity-range' });
  }
  if (settings.forecastHorizonDays !== 7 && settings.forecastHorizonDays !== 30) {
    issues.push({ field: 'forecastHorizonDays', code: 'forecast-horizon-invalid' });
  }
  if (
    !Number.isInteger(settings.forecastMinimumHistoryDays) ||
    !isFiniteInRange(
      settings.forecastMinimumHistoryDays,
      MIN_FORECAST_HISTORY,
      MAX_FORECAST_HISTORY
    )
  ) {
    issues.push({ field: 'forecastMinimumHistoryDays', code: 'forecast-history-range' });
  }

  settings.candidateModelIds.forEach((modelId) => {
    const normalizedModelId = normalizeModelId(modelId);

    if (seenCandidateIds.has(normalizedModelId)) {
      issues.push({ field: 'candidateModelIds', code: 'candidate-model-duplicate' });
    } else if (!normalizedPricedIds.has(normalizedModelId)) {
      issues.push({ field: 'candidateModelIds', code: 'candidate-model-unpriced' });
    }
    seenCandidateIds.add(normalizedModelId);
  });

  if (!Number.isFinite(settings.minimumSavingsUsd) || settings.minimumSavingsUsd < 0) {
    issues.push({ field: 'minimumSavingsUsd', code: 'minimum-savings-range' });
  }
  if (!isFiniteInRange(settings.targetCachePercentage, MIN_PERCENTAGE, MAX_PERCENTAGE)) {
    issues.push({ field: 'targetCachePercentage', code: 'percentage-range' });
  }
  if (!isFiniteInRange(settings.minimumPricingCoveragePercentage, MIN_PERCENTAGE, MAX_PERCENTAGE)) {
    issues.push({
      field: 'minimumPricingCoveragePercentage',
      code: 'percentage-range',
    });
  }

  return issues;
};

export const getCostOptimizationQueryIssues = (
  query: CostOptimizationQuery,
  projectPaths: string[]
): CostOptimizationValidationIssue[] =>
  query.projectPath && !projectPaths.includes(query.projectPath)
    ? [{ field: 'projectPath', code: 'project-not-found' }]
    : [];
