export type BudgetScope = 'global' | 'project';
export type BudgetPeriod = 'day' | 'week' | 'month';
export type BudgetMetric = 'token' | 'cost';
export type BudgetSeverity = 'normal' | 'warning' | 'critical' | 'over';
export type BudgetDataState = 'fresh' | 'stale';
export type ModelPricingSourceKind = 'built-in' | 'override';

export interface BudgetPolicyInput {
  id?: string;
  scope: BudgetScope;
  projectPath?: string;
  period: BudgetPeriod;
  tokenLimit?: number;
  costLimitUsd?: number;
}

export interface BudgetPolicy extends BudgetPolicyInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetThresholds {
  warningPercent: number;
  criticalPercent: number;
}

export interface ModelPricingOverrideInput {
  modelId: string;
  aliases: string[];
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface ModelPricingOverride extends ModelPricingOverrideInput {
  updatedAt: string;
}

export interface ModelPricingEntry extends ModelPricingOverrideInput {
  effectiveAt: string;
  sourceKind: ModelPricingSourceKind;
  sourceUrl?: string;
}

export interface BudgetProgress {
  used: number;
  limit: number;
  percent: number;
  severity: BudgetSeverity;
  incomplete?: boolean;
}

export interface BudgetPolicyStatus {
  policy: BudgetPolicy;
  periodStart: string;
  periodEnd: string;
  token?: BudgetProgress;
  cost?: BudgetProgress;
  unpricedTokens: number;
  unpricedModelIds: string[];
}

export interface BudgetAlert {
  id: string;
  policyId: string;
  period: BudgetPeriod;
  periodStart: string;
  metric: BudgetMetric;
  thresholdPercent: number;
  severity: Exclude<BudgetSeverity, 'normal'>;
  message: string;
}

export interface NotificationReceipt {
  key: string;
  policyId: string;
  periodStart: string;
}

export interface PersistedBudgetConfig {
  schemaVersion: number;
  policies: BudgetPolicy[];
  thresholds: BudgetThresholds;
  pricingOverrides: ModelPricingOverride[];
  notificationReceipts: NotificationReceipt[];
}

export interface UnpricedModelSummary {
  modelId?: string;
  totalTokens: number;
}

export interface BudgetSnapshotSummary {
  warningCount: number;
  overCount: number;
  unpricedModelCount: number;
}

export interface BudgetSnapshot {
  generatedAt: string;
  dataState: BudgetDataState;
  staleReason?: string;
  thresholds: BudgetThresholds;
  statuses: BudgetPolicyStatus[];
  alerts: BudgetAlert[];
  summary: BudgetSnapshotSummary;
  pricing: ModelPricingEntry[];
  unpricedModels: UnpricedModelSummary[];
}

export interface CostEstimate {
  pricedCostUsd: number;
  unpricedTokens: number;
  unpricedModelIds: string[];
}

export interface DailyCostEstimate extends CostEstimate {
  date: string;
}

export interface NaturalPeriodRange {
  start: Date;
  end: Date;
}

export interface ValidationIssue {
  field: string;
  message: string;
}
