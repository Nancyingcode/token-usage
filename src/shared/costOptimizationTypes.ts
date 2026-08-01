import type { BudgetPolicyStatus, ModelPricingEntry } from './budgetTypes';
import type { TokenUsage, UsagePeriod, UsageSession } from './usageTypes';

export const SHORT_FORECAST_HORIZON_DAYS = 7;
export const LONG_FORECAST_HORIZON_DAYS = 30;

export type CostOptimizationDataState = 'fresh' | 'stale';
export type CostOptimizationTab =
  'overview' | 'comparison' | 'anomalies' | 'forecast' | 'savings' | 'diagnostics';
export type CostAnomalyLevel = 'day' | 'project' | 'model' | 'session';
export type CostAnomalySeverity = 'warning' | 'critical';
export type CostAnomalyBaselineScope =
  | 'global-day'
  | 'project-day'
  | 'global-model-day'
  | 'project-model-day'
  | 'project-model'
  | 'model'
  | 'global';
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

export interface IndexedUsageSessionMetadata {
  sessionId: string;
  threadName?: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  eventCount: number;
  sourceFile: string;
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
  metadata: IndexedUsageSessionMetadata;
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

export type SessionDiagnosisCause =
  | 'input-growth'
  | 'cache-degradation'
  | 'generation-concentration'
  | 'model-cost-dominance'
  | 'interaction-accumulation';
export type SessionDiagnosisSeverity = 'warning' | 'critical';
export type SessionDiagnosisConfidence = 'low' | 'medium' | 'high';
export type SessionDetectorState = 'finding' | 'not-found' | 'insufficient-data' | 'not-applicable';
export type SessionDiagnosisBaselineScope =
  'session' | 'project-model' | 'model' | 'project' | 'global';

export interface SessionDiagnosisBaseline {
  scope: SessionDiagnosisBaselineScope;
  sampleCount: number;
  median: number;
  mad: number;
  score: number;
}

export type SessionDiagnosisEvidence =
  | {
      kind: 'input-growth';
      earlyMedianTokens: number;
      lateMedianTokens: number;
      growthRatio: number;
      absoluteGrowthTokens: number;
    }
  | {
      kind: 'cache-reuse';
      currentPercentage: number;
      firstHalfPercentage: number;
      secondHalfPercentage: number;
      targetPercentage: number;
    }
  | {
      kind: 'generation-share';
      subtype: 'output' | 'reasoning' | 'both';
      outputPercentage: number;
      reasoningPercentage: number;
    }
  | {
      kind: 'model-cost';
      modelId: string;
      costShare: number;
      unitCostRatio: number;
      switchedFromModelId?: string;
      switchedToModelId?: string;
      switchedCostShare?: number;
    }
  | {
      kind: 'interaction-accumulation';
      eventCount: number;
      durationMs?: number;
      maxSliceShare: number;
    };

export interface SessionDiagnosisFinding {
  state: 'finding';
  cause: SessionDiagnosisCause;
  severity: SessionDiagnosisSeverity;
  confidence: SessionDiagnosisConfidence;
  normalizedScore: number;
  baseline?: SessionDiagnosisBaseline;
  evidence: SessionDiagnosisEvidence;
  range?: { start: string; end: string };
}

export interface SessionDiagnosisUnavailable {
  state: Exclude<SessionDetectorState, 'finding'>;
  cause: SessionDiagnosisCause;
  reason:
    | 'within-normal-range'
    | 'insufficient-history'
    | 'insufficient-slices'
    | 'pricing-incomplete'
    | 'zero-input'
    | 'zero-total'
    | 'invalid-time-range';
}

export type SessionDetectorResult = SessionDiagnosisFinding | SessionDiagnosisUnavailable;

export type SessionDiagnosisFindingSummary = Pick<
  SessionDiagnosisFinding,
  'cause' | 'severity' | 'confidence' | 'normalizedScore' | 'baseline'
>;

export interface SessionDiagnosisSummary extends TokenUsage {
  diagnosisId: string;
  sourceFile: string;
  sessionId: string;
  threadName?: string;
  startedAt: string;
  projectPath: string;
  projectName: string;
  eventCount: number;
  pricedCostUsd: number;
  coverage: PricingCoverage;
  tokenPercentile: number;
  pricedCostPercentile?: number;
  impactPercentile: number;
  requiresAttention: boolean;
  anomalySeverity?: CostAnomalySeverity;
  primaryFinding?: SessionDiagnosisFindingSummary;
  additionalFindingCount: number;
}

export interface SessionDiagnosisTimelinePoint extends TokenUsage {
  contributionId: string;
  occurredAt: string;
  modelId?: string;
}

export interface SessionDiagnosisDetail {
  summary: SessionDiagnosisSummary;
  detectors: SessionDetectorResult[];
  timeline: SessionDiagnosisTimelinePoint[];
  invalidTimelinePointCount: number;
}

export interface SessionDiagnosisRequest {
  query: CostOptimizationQuery;
  diagnosisId: string;
}

export type SessionDiagnosisDetailResult =
  { kind: 'ready'; detail: SessionDiagnosisDetail } | { kind: 'not-found'; diagnosisId: string };

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
  baselineScope: CostAnomalyBaselineScope;
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

export interface CostBudgetCrossing {
  policyId: string;
  date: string;
  projectedCostUsd: number;
  limitUsd: number;
}

export interface CostForecast {
  kind: 'ready';
  method: 'weighted-average' | 'weekday-trend';
  intervalKind: 'empirical-80';
  historyDays: number;
  horizonDays: typeof SHORT_FORECAST_HORIZON_DAYS | typeof LONG_FORECAST_HORIZON_DAYS;
  points: CostForecastPoint[];
  projectedCostUsd: number;
  periodEndProjectedCostUsd: number;
  budgetCrossings: CostBudgetCrossing[];
  coverage: PricingCoverage;
}

export interface InsufficientForecast {
  kind: 'insufficient-data' | 'pricing-incomplete';
  requiredHistoryDays: number;
  actualHistoryDays: number;
  coverage: PricingCoverage;
  budgetCrossings: CostBudgetCrossing[];
}

export interface SavingsRecommendation {
  id: string;
  type: SavingsRecommendationType;
  titleKey: string;
  scopeLabel: string;
  savingsUsd: number;
  confidence: RecommendationConfidence;
  evidence: SavingsEvidence[];
  riskKey: string;
  contributionSavings: Record<string, number>;
}

export type SavingsEvidence =
  | { kind: 'sessions'; count: number }
  | { kind: 'pricing-coverage'; percentage: number }
  | { kind: 'baseline-samples'; count: number }
  | { kind: 'baseline-scope'; scope: CostAnomalyBaselineScope }
  | { kind: 'current-cache-percentage'; percentage: number }
  | { kind: 'target-cache-percentage'; percentage: number };

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
  diagnostics: SessionDiagnosisSummary[];
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
    | 'project-not-found'
    | 'diagnosis-id-empty';
}

export interface CostOptimizationIpcError {
  kind: 'validation' | 'unexpected';
  message: string;
  issues: CostOptimizationValidationIssue[];
}

export type CostOptimizationIpcResponse<Result> =
  { ok: true; value: Result } | { ok: false; error: CostOptimizationIpcError };
