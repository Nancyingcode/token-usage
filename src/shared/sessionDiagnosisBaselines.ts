/**
 * @file 会话诊断历史基线
 * @description
 * 按检测器指定范围选择当前会话之前的有限样本，并计算可解释的稳健基线。
 *
 * 约束：
 * - 未来、同时刻和无效时间样本不得进入基线
 * - 范围回退顺序由调用方显式提供
 */
import type {
  SessionDiagnosisBaseline,
  SessionDiagnosisBaselineScope,
} from './costOptimizationTypes';
import { normalizeModelId } from './pricing';
import { getRobustScore } from './robustStatistics';

const ZERO_MAD_RELATIVE_SCALE = 0.25;

export interface NumericDiagnosisMetric {
  diagnosisId: string;
  occurredAt: string;
  projectPath: string;
  dominantModelId?: string;
  value: number;
}

export interface ResolveDiagnosisBaselineInput {
  current: NumericDiagnosisMetric;
  history: NumericDiagnosisMetric[];
  scopeOrder: readonly SessionDiagnosisBaselineScope[];
  minimumSamples: number;
  historyWindow: number;
  direction: 'positive' | 'negative';
  zeroMadAbsoluteScale: number;
}

const getModelKey = (modelId: string | undefined): string | undefined =>
  modelId?.trim() ? normalizeModelId(modelId) : undefined;

const matchesScope = (
  scope: SessionDiagnosisBaselineScope,
  current: NumericDiagnosisMetric,
  candidate: NumericDiagnosisMetric
): boolean => {
  const currentModelId = getModelKey(current.dominantModelId);
  const candidateModelId = getModelKey(candidate.dominantModelId);

  switch (scope) {
    case 'session':
      return candidate.diagnosisId === current.diagnosisId;
    case 'project-model':
      return candidate.projectPath === current.projectPath && candidateModelId === currentModelId;
    case 'model':
      return candidateModelId === currentModelId;
    case 'project':
      return candidate.projectPath === current.projectPath;
    case 'global':
      return true;
  }
};

export const resolveDiagnosisBaseline = ({
  current,
  history,
  scopeOrder,
  minimumSamples,
  historyWindow,
  direction,
  zeroMadAbsoluteScale,
}: ResolveDiagnosisBaselineInput): SessionDiagnosisBaseline | undefined => {
  const currentTime = Date.parse(current.occurredAt);

  if (!Number.isFinite(currentTime)) {
    return undefined;
  }

  const priorHistory = history
    .map((metric) => ({
      metric,
      time: Date.parse(metric.occurredAt),
    }))
    .filter(
      ({ metric, time }) =>
        Number.isFinite(time) && time < currentTime && Number.isFinite(metric.value)
    );

  for (const scope of scopeOrder) {
    const samples = priorHistory
      .filter(({ metric }) => matchesScope(scope, current, metric))
      .sort(
        (first, second) =>
          first.time - second.time ||
          first.metric.diagnosisId.localeCompare(second.metric.diagnosisId)
      )
      .slice(-Math.max(historyWindow, 0))
      .map(({ metric }) => metric.value);

    if (samples.length < minimumSamples) {
      continue;
    }

    const robustScore = getRobustScore(current.value, samples, {
      zeroMadRelativeScale: ZERO_MAD_RELATIVE_SCALE,
      zeroMadAbsoluteScale,
    });

    return {
      scope,
      sampleCount: samples.length,
      median: robustScore.median,
      mad: robustScore.mad,
      score: direction === 'negative' ? -robustScore.score : robustScore.score,
    };
  }

  return undefined;
};
