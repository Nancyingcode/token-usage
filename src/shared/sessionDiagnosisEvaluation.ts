/**
 * @file 会话高消耗诊断评估
 * @description
 * 组合候选排序与五个纯检测器，生成轻量列表摘要和按需详情。
 *
 * 约束：
 * - 当前查询只过滤展示候选，较早观测仍可作为历史基线
 * - 摘要不得包含贡献数组、检测器证据或时间线
 */
import type {
  CostAnomaly,
  CostOptimizationIndex,
  CostOptimizationQuery,
  CostOptimizationSettings,
  SessionDetectorResult,
  SessionDiagnosisCause,
  SessionDiagnosisConfidence,
  SessionDiagnosisDetailResult,
  SessionDiagnosisFinding,
  SessionDiagnosisFindingSummary,
  SessionDiagnosisSeverity,
  SessionDiagnosisSummary,
  SessionDiagnosisTimelinePoint,
} from './costOptimizationTypes';
import type { ModelPricingEntry } from './budgetTypes';
import { detectCacheDegradation } from './sessionDiagnosisCache';
import {
  buildSessionDiagnosisObservations,
  selectDiagnosisCandidates,
} from './sessionDiagnosisCandidates';
import { detectGenerationConcentration } from './sessionDiagnosisGeneration';
import { detectInputGrowth } from './sessionDiagnosisInput';
import { detectInteractionAccumulation } from './sessionDiagnosisAccumulation';
import { detectModelCostDominance } from './sessionDiagnosisModelCost';
import type {
  SessionDiagnosisCandidate,
  SessionDiagnosisObservation,
} from './sessionDiagnosisTypes';
import type { RollingUsagePeriod } from './usageTypes';

const CAUSE_ORDER: Record<SessionDiagnosisCause, number> = {
  'input-growth': 0,
  'cache-degradation': 1,
  'generation-concentration': 2,
  'model-cost-dominance': 3,
  'interaction-accumulation': 4,
};

const CONFIDENCE_RANK: Record<SessionDiagnosisConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const SEVERITY_RANK: Record<SessionDiagnosisSeverity, number> = {
  warning: 0,
  critical: 1,
};

const PERIOD_DAY_COUNTS: Record<RollingUsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

const DETECTORS = [
  detectInputGrowth,
  detectCacheDegradation,
  detectGenerationConcentration,
  detectModelCostDominance,
  detectInteractionAccumulation,
] as const;

export interface EvaluateSessionDiagnosticsInput {
  index: CostOptimizationIndex;
  query: CostOptimizationQuery;
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
  anomalies: CostAnomaly[];
  now: Date;
}

export interface EvaluateSessionDiagnosisDetailInput extends EvaluateSessionDiagnosticsInput {
  diagnosisId: string;
}

interface EvaluatedSessionDiagnosis {
  candidate: SessionDiagnosisCandidate;
  detectors: SessionDetectorResult[];
  summary: SessionDiagnosisSummary;
}

const getSafeNormalizedScore = (finding: SessionDiagnosisFinding): number =>
  Number.isFinite(finding.normalizedScore) ? Math.min(Math.max(finding.normalizedScore, 0), 1) : 0;

const cloneFinding = (finding: SessionDiagnosisFinding): SessionDiagnosisFinding => ({
  ...finding,
  normalizedScore: getSafeNormalizedScore(finding),
  evidence: { ...finding.evidence },
  ...(finding.baseline ? { baseline: { ...finding.baseline } } : {}),
  ...(finding.range ? { range: { ...finding.range } } : {}),
});

export const selectPrimaryFinding = (
  findings: SessionDiagnosisFinding[]
): SessionDiagnosisFinding | undefined =>
  findings
    .map(cloneFinding)
    .sort(
      (first, second) =>
        SEVERITY_RANK[second.severity] - SEVERITY_RANK[first.severity] ||
        getSafeNormalizedScore(second) - getSafeNormalizedScore(first) ||
        CONFIDENCE_RANK[second.confidence] - CONFIDENCE_RANK[first.confidence] ||
        CAUSE_ORDER[first.cause] - CAUSE_ORDER[second.cause]
    )[0];

const isObservationInQuery = (
  observation: SessionDiagnosisObservation,
  query: CostOptimizationQuery,
  now: Date
): boolean => {
  if (query.projectPath !== undefined && observation.projectPath !== query.projectPath) {
    return false;
  }
  if (query.period === 'total') {
    return true;
  }

  const startedAt = Date.parse(observation.startedAt);
  const endTime = now.getTime();

  if (!Number.isFinite(startedAt) || !Number.isFinite(endTime)) {
    return false;
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAY_COUNTS[query.period] - 1));

  return startedAt >= start.getTime() && startedAt <= endTime;
};

const getAnomalySeverity = (
  candidate: SessionDiagnosisCandidate,
  anomalies: readonly CostAnomaly[]
): SessionDiagnosisSeverity | undefined => {
  const matching = anomalies.filter(
    ({ level, sessionId }) => level === 'session' && sessionId === candidate.sessionId
  );

  if (matching.some(({ severity }) => severity === 'critical')) {
    return 'critical';
  }
  return matching.length > 0 ? 'warning' : undefined;
};

const toFindingSummary = (finding: SessionDiagnosisFinding): SessionDiagnosisFindingSummary => ({
  cause: finding.cause,
  severity: finding.severity,
  confidence: finding.confidence,
  normalizedScore: getSafeNormalizedScore(finding),
  ...(finding.baseline ? { baseline: { ...finding.baseline } } : {}),
});

const toSummary = (
  candidate: SessionDiagnosisCandidate,
  detectors: SessionDetectorResult[],
  anomalies: readonly CostAnomaly[]
): SessionDiagnosisSummary => {
  const findings = detectors.filter(
    (result): result is SessionDiagnosisFinding => result.state === 'finding'
  );
  const primaryFinding = selectPrimaryFinding(findings);
  const anomalySeverity = getAnomalySeverity(candidate, anomalies);

  return {
    diagnosisId: candidate.diagnosisId,
    sourceFile: candidate.sourceFile,
    sessionId: candidate.sessionId,
    ...(candidate.threadName ? { threadName: candidate.threadName } : {}),
    startedAt: candidate.startedAt,
    projectPath: candidate.projectPath,
    projectName: candidate.projectName,
    eventCount: candidate.eventCount,
    pricedCostUsd: candidate.pricedCostUsd,
    coverage: {
      ...candidate.coverage,
      unpricedModelIds: [...candidate.coverage.unpricedModelIds],
    },
    tokenPercentile: candidate.tokenPercentile,
    ...(candidate.pricedCostPercentile === undefined
      ? {}
      : {
          pricedCostPercentile: candidate.pricedCostPercentile,
        }),
    impactPercentile: candidate.impactPercentile,
    requiresAttention: candidate.requiresAttention,
    ...(anomalySeverity ? { anomalySeverity } : {}),
    primaryFinding: primaryFinding ? toFindingSummary(primaryFinding) : undefined,
    additionalFindingCount: Math.max(findings.length - (primaryFinding ? 1 : 0), 0),
    inputTokens: candidate.inputTokens,
    cachedInputTokens: candidate.cachedInputTokens,
    outputTokens: candidate.outputTokens,
    reasoningOutputTokens: candidate.reasoningOutputTokens,
    totalTokens: candidate.totalTokens,
  };
};

const evaluateSessions = (input: EvaluateSessionDiagnosticsInput): EvaluatedSessionDiagnosis[] => {
  const observations = buildSessionDiagnosisObservations({
    index: input.index,
    pricing: input.pricing,
  });
  const currentObservations = observations.filter((observation) =>
    isObservationInQuery(observation, input.query, input.now)
  );
  const candidates = selectDiagnosisCandidates({
    observations: currentObservations,
    anomalies: input.anomalies,
    minimumPricingCoveragePercentage: input.settings.minimumPricingCoveragePercentage,
  });

  return candidates.map((candidate) => {
    const context = {
      current: candidate,
      history: observations,
      settings: input.settings,
      pricing: input.pricing,
    };
    const detectors = DETECTORS.map((detector) => detector(context));

    return {
      candidate,
      detectors,
      summary: toSummary(candidate, detectors, input.anomalies),
    };
  });
};

export const evaluateSessionDiagnostics = (
  input: EvaluateSessionDiagnosticsInput
): SessionDiagnosisSummary[] => evaluateSessions(input).map(({ summary }) => summary);

const buildTimeline = (
  candidate: SessionDiagnosisCandidate
): {
  timeline: SessionDiagnosisTimelinePoint[];
  invalidTimelinePointCount: number;
} => {
  const points = candidate.contributions.map((contribution) => ({
    contribution,
    time: Date.parse(contribution.occurredAt),
  }));
  const validPoints = points
    .filter(({ time }) => Number.isFinite(time))
    .sort(
      (first, second) =>
        first.time - second.time || first.contribution.id.localeCompare(second.contribution.id)
    );

  return {
    timeline: validPoints.map(({ contribution }): SessionDiagnosisTimelinePoint => ({
      contributionId: contribution.id,
      occurredAt: contribution.occurredAt,
      ...(contribution.modelId ? { modelId: contribution.modelId } : {}),
      inputTokens: contribution.inputTokens,
      cachedInputTokens: contribution.cachedInputTokens,
      outputTokens: contribution.outputTokens,
      reasoningOutputTokens: contribution.reasoningOutputTokens,
      totalTokens: contribution.totalTokens,
    })),
    invalidTimelinePointCount: points.length - validPoints.length,
  };
};

export const evaluateSessionDiagnosisDetail = (
  input: EvaluateSessionDiagnosisDetailInput
): SessionDiagnosisDetailResult => {
  const evaluated = evaluateSessions(input).find(
    ({ candidate }) => candidate.diagnosisId === input.diagnosisId
  );

  if (!evaluated) {
    return {
      kind: 'not-found',
      diagnosisId: input.diagnosisId,
    };
  }

  const timeline = buildTimeline(evaluated.candidate);

  return {
    kind: 'ready',
    detail: {
      summary: evaluated.summary,
      detectors: evaluated.detectors,
      ...timeline,
    },
  };
};
