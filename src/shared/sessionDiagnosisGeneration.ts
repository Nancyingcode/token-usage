/**
 * @file 生成 Token 占比诊断
 * @description
 * 使用同项目/模型的历史比例判断输出或推理 Token 是否异常集中。
 *
 * 约束：
 * - 没有历史基线时不使用固定占比阈值替代
 * - 总 Token 为零时不进行比例计算
 */
import type { SessionDetectorResult, SessionDiagnosisBaseline } from './costOptimizationTypes';
import { resolveDiagnosisBaseline, type NumericDiagnosisMetric } from './sessionDiagnosisBaselines';
import type {
  SessionDiagnosisDetectorContext,
  SessionDiagnosisObservation,
} from './sessionDiagnosisTypes';
import { clampUnitInterval, normalizeDiagnosisScore } from './sessionDiagnosisTypes';

const PERCENTAGE_SCALE = 100;
const MIN_PERCENTAGE_SCALE = 1;
const CRITICAL_SCORE_MULTIPLIER = 2;

interface GenerationPercentages {
  outputPercentage: number;
  reasoningPercentage: number;
}

const getGenerationPercentages = (
  observation: SessionDiagnosisObservation
): GenerationPercentages | undefined => {
  if (observation.totalTokens <= 0) {
    return undefined;
  }

  return {
    outputPercentage:
      clampUnitInterval(observation.outputTokens / observation.totalTokens) * PERCENTAGE_SCALE,
    reasoningPercentage:
      clampUnitInterval(observation.reasoningOutputTokens / observation.totalTokens) *
      PERCENTAGE_SCALE,
  };
};

const toMetric = (
  observation: SessionDiagnosisObservation,
  value: number
): NumericDiagnosisMetric => ({
  diagnosisId: observation.diagnosisId,
  occurredAt: observation.startedAt,
  projectPath: observation.projectPath,
  dominantModelId: observation.dominantModelId,
  value,
});

const selectStrongerBaseline = (
  first: SessionDiagnosisBaseline,
  second: SessionDiagnosisBaseline
): SessionDiagnosisBaseline => (second.score > first.score ? second : first);

export const detectGenerationConcentration = ({
  current,
  history,
  settings,
}: SessionDiagnosisDetectorContext): SessionDetectorResult => {
  const currentPercentages = getGenerationPercentages(current);

  if (!currentPercentages) {
    return {
      state: 'not-applicable',
      cause: 'generation-concentration',
      reason: 'zero-total',
    };
  }

  const historicalPercentages = history.flatMap((observation) => {
    const percentages = getGenerationPercentages(observation);
    return percentages ? [{ observation, percentages }] : [];
  });
  const baselineInput = {
    scopeOrder: ['project-model', 'model', 'global'] as const,
    minimumSamples: settings.anomalyMinimumSamples,
    historyWindow: settings.anomalyHistoryWindow,
    direction: 'positive' as const,
    zeroMadAbsoluteScale: MIN_PERCENTAGE_SCALE,
  };
  const outputBaseline = resolveDiagnosisBaseline({
    current: toMetric(current, currentPercentages.outputPercentage),
    history: historicalPercentages.map(({ observation, percentages }) =>
      toMetric(observation, percentages.outputPercentage)
    ),
    ...baselineInput,
  });
  const reasoningBaseline = resolveDiagnosisBaseline({
    current: toMetric(current, currentPercentages.reasoningPercentage),
    history: historicalPercentages.map(({ observation, percentages }) =>
      toMetric(observation, percentages.reasoningPercentage)
    ),
    ...baselineInput,
  });

  if (!outputBaseline || !reasoningBaseline) {
    return {
      state: 'insufficient-data',
      cause: 'generation-concentration',
      reason: 'insufficient-history',
    };
  }

  const outputFinding = outputBaseline.score >= settings.anomalySensitivity;
  const reasoningFinding = reasoningBaseline.score >= settings.anomalySensitivity;

  if (!outputFinding && !reasoningFinding) {
    return {
      state: 'not-found',
      cause: 'generation-concentration',
      reason: 'within-normal-range',
    };
  }

  const subtype =
    outputFinding && reasoningFinding ? 'both' : outputFinding ? 'output' : 'reasoning';
  const criticalThreshold = settings.anomalySensitivity * CRITICAL_SCORE_MULTIPLIER;
  const highestScore = Math.max(
    outputFinding ? outputBaseline.score : 0,
    reasoningFinding ? reasoningBaseline.score : 0
  );

  return {
    state: 'finding',
    cause: 'generation-concentration',
    severity: highestScore >= criticalThreshold ? 'critical' : 'warning',
    confidence: 'high',
    normalizedScore: normalizeDiagnosisScore(highestScore, criticalThreshold),
    baseline: selectStrongerBaseline(outputBaseline, reasoningBaseline),
    evidence: {
      kind: 'generation-share',
      subtype,
      outputPercentage: currentPercentages.outputPercentage,
      reasoningPercentage: currentPercentages.reasoningPercentage,
    },
    range: { start: current.startedAt, end: current.endedAt },
  };
};
