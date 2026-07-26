import type { BudgetPolicyStatus, ModelPricingEntry } from './budgetTypes';
import type { TokenUsage, UsagePeriod, UsageSession } from './usageTypes';

export const SHORT_FORECAST_HORIZON_DAYS = 7;
export const LONG_FORECAST_HORIZON_DAYS = 30;

export type CostOptimizationDataState = 'fresh' | 'stale';
export type CostOptimizationTab = 'overview' | 'comparison' | 'anomalies' | 'forecast' | 'savings';
export type CostAnomalyLevel = 'day' | 'project' | 'model' | 'session';
export type CostAnomalySeverity = 'warning' | 'critical';
export type SavingsRecommendationType =
  'model-substitution' | 'cache-improvement' | 'anomaly-recovery';
export type RecommendationConfidence = 'high' | 'medium';

export interface CostOptimizationSettings {
  anomalyHistoryWindow: number;
  anomalyMinimumSamples: number;
  anomalySensitivity: number;
  forecastHorizonDays: typeof SHORT_FORECAST_HORIZON_DAYS | typeof LONG_FORECAST_HORIZON_DAYS;
  forecastMinimumHistoryDays: number;
  candidateModelIds: string[];
  minimumSavingsUsd: number;
  targetCachePercentage: number;
  minimumPricingCoveragePercentage: number;
}

export interface PersistedCostOptimizationConfig {
  schemaVersion: number;
  settings: CostOptimizationSettings;
}

export interface CostOptimizationQuery {
  period: UsagePeriod;
  projectPath?: string;
}

export interface UsageSourceChange {
  sourceFile: string;
  fingerprint: string;
  session: UsageSession;
}

export interface UsageChangeSet {
  upserted: UsageSourceChange[];
  removedSourceFiles: string[];
  requiresFullRebuild: boolean;
}

export interface IndexedUsageContribution extends TokenUsage {
  id: string;
  sourceFile: string;
  sessionId: string;
  occurredAt: string;
  date: string;
  projectPath: string;
  projectName: string;
  modelId?: string;
}

export interface IndexedUsageBucket extends TokenUsage {
  id: string;
  date?: string;
  projectPath?: string;
  projectName?: string;
  sessionId?: string;
  occurredAt?: string;
  modelId?: string;
  memberCounts: Record<string, number>;
  contributionCounts: Record<string, number>;
}

export interface IndexedUsageSource {
  fingerprint: string;
  contributions: IndexedUsageContribution[];
}

export interface CostOptimizationIndex {
  schemaVersion: number;
  sessionsDir: string;
  generatedAt: string;
  sources: Record<string, IndexedUsageSource>;
  dayModelBuckets: Record<string, IndexedUsageBucket>;
  projectDayModelBuckets: Record<string, IndexedUsageBucket>;
  sessionModelBuckets: Record<string, IndexedUsageBucket>;
}

export interface PricingCoverage {
  pricedTokens: number;
  unpricedTokens: number;
  totalTokens: number;
  percentage: number;
  unpricedModelIds: string[];
}

export interface ModelCostRow extends TokenUsage {
  modelId?: string;
  sessionCount: number;
  pricedCostUsd: number;
  costShare: number;
  averageSessionCostUsd: number;
  coverage: PricingCoverage;
}

export interface ModelSubstitutionScenario {
  sourceModelId?: string;
  targetModelId: string;
  actualCostUsd: number;
  scenarioCostUsd: number;
  savingsUsd: number;
  affectedSessionCount: number;
  contributionIds: string[];
}

export interface CostAnomaly {
  id: string;
  level: CostAnomalyLevel;
  severity: CostAnomalySeverity;
  occurredAt: string;
  date?: string;
  projectPath?: string;
  projectName?: string;
  modelId?: string;
  sessionId?: string;
  actualCostUsd: number;
  baselineCostUsd: number;
  deviationRatio: number;
  score: number;
  sampleCount: number;
  baselineScope: string;
  coverage: PricingCoverage;
  contributionIds: string[];
}

export interface CostForecastPoint {
  date: string;
  predictedCostUsd: number;
  lowerCostUsd: number;
  upperCostUsd: number;
}

export interface DailyCostObservation {
  date: string;
  costUsd: number;
}

export interface CostForecast {
  kind: 'ready';
  method: 'weighted-average' | 'weekday-trend';
  intervalLabel: '80% empirical interval';
  historyDays: number;
  horizonDays: typeof SHORT_FORECAST_HORIZON_DAYS | typeof LONG_FORECAST_HORIZON_DAYS;
  points: CostForecastPoint[];
  projectedCostUsd: number;
  periodEndProjectedCostUsd: number;
  budgetCrossings: Array<{
    policyId: string;
    date: string;
    projectedCostUsd: number;
    limitUsd: number;
  }>;
  coverage: PricingCoverage;
}

export interface InsufficientForecast {
  kind: 'insufficient-data' | 'pricing-incomplete';
  requiredHistoryDays: number;
  actualHistoryDays: number;
  coverage: PricingCoverage;
}

export interface SavingsRecommendation {
  id: string;
  type: SavingsRecommendationType;
  titleKey: string;
  scopeLabel: string;
  savingsUsd: number;
  confidence: RecommendationConfidence;
  evidence: string[];
  riskKey: string;
  contributionSavings: Record<string, number>;
}

export interface CostOptimizationSnapshot {
  generatedAt: string;
  dataState: CostOptimizationDataState;
  staleReason?: string;
  warnings: string[];
  settings: CostOptimizationSettings;
  query: CostOptimizationQuery;
  pricing: ModelPricingEntry[];
  budgets: BudgetPolicyStatus[];
  coverage: PricingCoverage;
  currentCostUsd: number;
  modelRows: ModelCostRow[];
  substitutionScenarios: ModelSubstitutionScenario[];
  anomalies: CostAnomaly[];
  forecast: CostForecast | InsufficientForecast;
  recommendations: SavingsRecommendation[];
  conservativeSavingsUsd: number;
  cacheStats: {
    upsertedSources: number;
    removedSources: number;
    reusedSources: number;
  };
}

export interface CostOptimizationValidationIssue {
  field: string;
  code:
    | 'history-window-range'
    | 'minimum-samples-range'
    | 'sensitivity-range'
    | 'forecast-horizon-invalid'
    | 'forecast-history-range'
    | 'candidate-model-duplicate'
    | 'candidate-model-unpriced'
    | 'minimum-savings-range'
    | 'percentage-range'
    | 'project-not-found';
}

export interface CostOptimizationIpcError {
  kind: 'validation' | 'unexpected';
  message: string;
  issues: CostOptimizationValidationIssue[];
}

export type CostOptimizationIpcResponse<Result> =
  { ok: true; value: Result } | { ok: false; error: CostOptimizationIpcError };
