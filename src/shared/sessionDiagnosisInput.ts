/**
 * @file 输入 Token 增长诊断
 * @description
 * 比较会话前后段输入 Token 足迹，并优先使用只向前历史基线解释持续放大。
 *
 * 约束：
 * - 只使用时间有效的切片
 * - 历史不足时必须同时满足相对和绝对保守阈值
 */
import type { SessionDetectorResult, SessionDiagnosisFinding } from './costOptimizationTypes';
import { resolveDiagnosisBaseline, type NumericDiagnosisMetric } from './sessionDiagnosisBaselines';
import type {
  SessionDiagnosisDetectorContext,
  SessionDiagnosisObservation,
} from './sessionDiagnosisTypes';
import { normalizeDiagnosisScore } from './sessionDiagnosisTypes';
import { median } from './robustStatistics';

const MIN_INPUT_GROWTH_SLICES = 3;
const INPUT_GROWTH_FALLBACK_RATIO = 2;
const INPUT_GROWTH_FALLBACK_MIN_TOKENS = 8_192;
const INPUT_GROWTH_CRITICAL_RATIO = 4;
const INPUT_GROWTH_CRITICAL_MIN_TOKENS = INPUT_GROWTH_FALLBACK_MIN_TOKENS * 2;
const MIN_RATIO_DENOMINATOR_TOKENS = 1;
const MIN_ABSOLUTE_GROWTH_SCALE_TOKENS = 1;

interface InputGrowthMetric {
  growthRatio: number;
  absoluteGrowthTokens: number;
  earlyMedianTokens: number;
  lateMedianTokens: number;
  range: { start: string; end: string };
}

const getInputGrowthMetric = (
  observation: SessionDiagnosisObservation
): InputGrowthMetric | undefined => {
  const validContributions = observation.contributions
    .map((contribution) => ({
      contribution,
      time: Date.parse(contribution.occurredAt),
    }))
    .filter(({ time }) => Number.isFinite(time))
    .sort(
      (first, second) =>
        first.time - second.time || first.contribution.id.localeCompare(second.contribution.id)
    );

  if (validContributions.length < MIN_INPUT_GROWTH_SLICES) {
    return undefined;
  }

  const segmentSize = Math.floor(validContributions.length / MIN_INPUT_GROWTH_SLICES);
  const earlyMedianTokens = median(
    validContributions.slice(0, segmentSize).map(({ contribution }) => contribution.inputTokens)
  );
  const lateMedianTokens = median(
    validContributions.slice(-segmentSize).map(({ contribution }) => contribution.inputTokens)
  );
  const growthRatio = lateMedianTokens / Math.max(earlyMedianTokens, MIN_RATIO_DENOMINATOR_TOKENS);

  return {
    growthRatio,
    absoluteGrowthTokens: lateMedianTokens - earlyMedianTokens,
    earlyMedianTokens,
    lateMedianTokens,
    range: {
      start: validContributions[0].contribution.occurredAt,
      end: validContributions.at(-1)?.contribution.occurredAt ?? '',
    },
  };
};

const toNumericMetric = (
  observation: SessionDiagnosisObservation,
  value: number
): NumericDiagnosisMetric => ({
  diagnosisId: observation.diagnosisId,
  occurredAt: observation.startedAt,
  projectPath: observation.projectPath,
  dominantModelId: observation.dominantModelId,
  value,
});

const getHistoricalMetrics = (
  history: SessionDiagnosisObservation[]
): Array<{
  observation: SessionDiagnosisObservation;
  metric: InputGrowthMetric;
}> =>
  history.flatMap((observation) => {
    const metric = getInputGrowthMetric(observation);
    return metric ? [{ observation, metric }] : [];
  });

const buildFinding = (
  metric: InputGrowthMetric,
  finding: Omit<SessionDiagnosisFinding, 'state' | 'cause' | 'evidence' | 'range'>
): SessionDiagnosisFinding => ({
  state: 'finding',
  cause: 'input-growth',
  ...finding,
  evidence: {
    kind: 'input-growth',
    earlyMedianTokens: metric.earlyMedianTokens,
    lateMedianTokens: metric.lateMedianTokens,
    growthRatio: metric.growthRatio,
    absoluteGrowthTokens: metric.absoluteGrowthTokens,
  },
  range: metric.range,
});

export const detectInputGrowth = ({
  current,
  history,
  settings,
}: SessionDiagnosisDetectorContext): SessionDetectorResult => {
  const currentMetric = getInputGrowthMetric(current);

  if (!currentMetric) {
    return {
      state: 'insufficient-data',
      cause: 'input-growth',
      reason: 'insufficient-slices',
    };
  }

  const historicalMetrics = getHistoricalMetrics(history);
  const sharedBaselineInput = {
    scopeOrder: ['project-model', 'model', 'global'] as const,
    minimumSamples: settings.anomalyMinimumSamples,
    historyWindow: settings.anomalyHistoryWindow,
    direction: 'positive' as const,
  };
  const ratioBaseline = resolveDiagnosisBaseline({
    current: toNumericMetric(current, currentMetric.growthRatio),
    history: historicalMetrics.map(({ observation, metric }) =>
      toNumericMetric(observation, metric.growthRatio)
    ),
    ...sharedBaselineInput,
    zeroMadAbsoluteScale: MIN_RATIO_DENOMINATOR_TOKENS,
  });
  const absoluteBaseline = resolveDiagnosisBaseline({
    current: toNumericMetric(current, currentMetric.absoluteGrowthTokens),
    history: historicalMetrics.map(({ observation, metric }) =>
      toNumericMetric(observation, metric.absoluteGrowthTokens)
    ),
    ...sharedBaselineInput,
    zeroMadAbsoluteScale: MIN_ABSOLUTE_GROWTH_SCALE_TOKENS,
  });

  if (ratioBaseline && absoluteBaseline) {
    const ratioIsAnomalous = ratioBaseline.score >= settings.anomalySensitivity;
    const absoluteIsAnomalous = absoluteBaseline.score >= settings.anomalySensitivity;

    if (!ratioIsAnomalous || !absoluteIsAnomalous) {
      return {
        state: 'not-found',
        cause: 'input-growth',
        reason: 'within-normal-range',
      };
    }

    return buildFinding(currentMetric, {
      severity: currentMetric.growthRatio >= INPUT_GROWTH_CRITICAL_RATIO ? 'critical' : 'warning',
      confidence: 'high',
      normalizedScore: Math.min(
        normalizeDiagnosisScore(ratioBaseline.score, settings.anomalySensitivity * 2),
        normalizeDiagnosisScore(absoluteBaseline.score, settings.anomalySensitivity * 2)
      ),
      baseline: ratioBaseline,
    });
  }

  const meetsFallback =
    currentMetric.growthRatio >= INPUT_GROWTH_FALLBACK_RATIO &&
    currentMetric.absoluteGrowthTokens >= INPUT_GROWTH_FALLBACK_MIN_TOKENS;

  if (!meetsFallback) {
    return {
      state: 'insufficient-data',
      cause: 'input-growth',
      reason: 'insufficient-history',
    };
  }

  return buildFinding(currentMetric, {
    severity: currentMetric.growthRatio >= INPUT_GROWTH_CRITICAL_RATIO ? 'critical' : 'warning',
    confidence: 'low',
    normalizedScore: Math.min(
      normalizeDiagnosisScore(currentMetric.growthRatio, INPUT_GROWTH_CRITICAL_RATIO),
      normalizeDiagnosisScore(currentMetric.absoluteGrowthTokens, INPUT_GROWTH_CRITICAL_MIN_TOKENS)
    ),
  });
};
