/**
 * @file 会话诊断筛选与排序
 * @description 以无副作用的方式筛选诊断摘要，并按关注度、严重程度和影响稳定排序。
 */

import type {
  SessionDiagnosisCause,
  SessionDiagnosisConfidence,
  SessionDiagnosisSeverity,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';

export interface SessionDiagnosisFilters {
  scope: 'attention' | 'all';
  cause: SessionDiagnosisCause | 'all';
  severity: SessionDiagnosisSeverity | 'all';
  confidence: SessionDiagnosisConfidence | 'all';
}

export const DEFAULT_DIAGNOSIS_FILTERS: SessionDiagnosisFilters = {
  scope: 'attention',
  cause: 'all',
  severity: 'all',
  confidence: 'all',
};

export interface FilterSessionDiagnosisSummariesInput extends SessionDiagnosisFilters {
  summaries: SessionDiagnosisSummary[];
}

const SEVERITY_RANK: Record<SessionDiagnosisSeverity, number> = {
  warning: 1,
  critical: 2,
};

const getStartedAtTime = (summary: SessionDiagnosisSummary): number => {
  const value = new Date(summary.startedAt).getTime();

  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

export const filterSessionDiagnosisSummaries = ({
  summaries,
  scope,
  cause,
  severity,
  confidence,
}: FilterSessionDiagnosisSummariesInput): SessionDiagnosisSummary[] =>
  summaries
    .filter(
      (summary) =>
        (scope === 'all' || summary.requiresAttention) &&
        (cause === 'all' || summary.primaryFinding?.cause === cause) &&
        (severity === 'all' || summary.primaryFinding?.severity === severity) &&
        (confidence === 'all' || summary.primaryFinding?.confidence === confidence)
    )
    .sort(
      (first, second) =>
        Number(second.requiresAttention) - Number(first.requiresAttention) ||
        (second.primaryFinding ? SEVERITY_RANK[second.primaryFinding.severity] : 0) -
          (first.primaryFinding ? SEVERITY_RANK[first.primaryFinding.severity] : 0) ||
        second.impactPercentile - first.impactPercentile ||
        getStartedAtTime(second) - getStartedAtTime(first) ||
        first.diagnosisId.localeCompare(second.diagnosisId)
    );
