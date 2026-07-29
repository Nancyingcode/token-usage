/**
 * @file 会话诊断内部类型
 * @description
 * 定义纯诊断计算使用的会话观测、候选与检测器上下文，不包含 Renderer 状态。
 */
import type { ModelPricingEntry } from './budgetTypes';
import type {
  CostAnomaly,
  CostOptimizationIndex,
  CostOptimizationSettings,
  IndexedUsageContribution,
  PricingCoverage,
} from './costOptimizationTypes';
import type { TokenUsage } from './usageTypes';

export interface SessionDiagnosisObservation extends TokenUsage {
  diagnosisId: string;
  sourceFile: string;
  sessionId: string;
  threadName?: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  eventCount: number;
  dominantModelId?: string;
  contributions: IndexedUsageContribution[];
  pricedCostUsd: number;
  coverage: PricingCoverage;
}

export interface SessionDiagnosisCandidate extends SessionDiagnosisObservation {
  tokenPercentile: number;
  pricedCostPercentile?: number;
  impactPercentile: number;
  requiresAttention: boolean;
}

export interface BuildSessionDiagnosisObservationsInput {
  index: CostOptimizationIndex;
  pricing: ModelPricingEntry[];
}

export interface SelectDiagnosisCandidatesInput {
  observations: SessionDiagnosisObservation[];
  anomalies: CostAnomaly[];
  minimumPricingCoveragePercentage: number;
}

export interface SessionDiagnosisDetectorContext {
  current: SessionDiagnosisObservation;
  history: SessionDiagnosisObservation[];
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
}

export const clampUnitInterval = (value: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;

export const normalizeDiagnosisScore = (score: number, criticalThreshold: number): number =>
  criticalThreshold > 0 ? clampUnitInterval(score / criticalThreshold) : 0;
