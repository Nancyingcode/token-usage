/**
 * @file 缓存复用诊断
 * @description
 * 综合目标缓存率、会话后段下降和历史负向异常，识别缓存复用信号偏低或恶化。
 *
 * 约束：
 * - 缓存输入始终限制在输入 Token 范围内
 * - 缓存证据的最高置信度固定为 medium
 */
import type {
  IndexedUsageContribution,
  SessionDetectorResult,
  SessionDiagnosisConfidence,
} from './costOptimizationTypes';
import { resolveDiagnosisBaseline, type NumericDiagnosisMetric } from './sessionDiagnosisBaselines';
import type {
  SessionDiagnosisDetectorContext,
  SessionDiagnosisObservation,
} from './sessionDiagnosisTypes';
import { clampUnitInterval, normalizeDiagnosisScore } from './sessionDiagnosisTypes';

const CACHE_TARGET_GAP_POINTS = 10;
const CACHE_DECLINE_POINTS = 15;
const CACHE_CRITICAL_GAP_POINTS = 30;
const PERCENTAGE_SCALE = 100;

const getCachePercentage = (inputTokens: number, cachedInputTokens: number): number => {
  if (inputTokens <= 0) {
    return 0;
  }

  const boundedCachedInputTokens = Math.min(Math.max(cachedInputTokens, 0), inputTokens);
  return clampUnitInterval(boundedCachedInputTokens / inputTokens) * PERCENTAGE_SCALE;
};

const getContributionCachePercentage = (
  contributions: readonly IndexedUsageContribution[],
  fallbackPercentage: number
): number => {
  const totals = contributions.reduce(
    (result, contribution) => ({
      inputTokens: result.inputTokens + contribution.inputTokens,
      cachedInputTokens:
        result.cachedInputTokens +
        Math.min(
          Math.max(contribution.cachedInputTokens, 0),
          Math.max(contribution.inputTokens, 0)
        ),
    }),
    { inputTokens: 0, cachedInputTokens: 0 }
  );

  return totals.inputTokens > 0
    ? getCachePercentage(totals.inputTokens, totals.cachedInputTokens)
    : fallbackPercentage;
};

const getSessionHalves = (
  current: SessionDiagnosisObservation,
  currentPercentage: number
): {
  firstHalfPercentage: number;
  secondHalfPercentage: number;
  range?: { start: string; end: string };
} => {
  const ordered = current.contributions
    .map((contribution) => ({
      contribution,
      time: Date.parse(contribution.occurredAt),
    }))
    .filter(({ time }) => Number.isFinite(time))
    .sort(
      (first, second) =>
        first.time - second.time || first.contribution.id.localeCompare(second.contribution.id)
    );

  if (ordered.length < 2) {
    return {
      firstHalfPercentage: currentPercentage,
      secondHalfPercentage: currentPercentage,
      ...(ordered.length === 1
        ? {
            range: {
              start: ordered[0].contribution.occurredAt,
              end: ordered[0].contribution.occurredAt,
            },
          }
        : {}),
    };
  }

  const splitIndex = Math.floor(ordered.length / 2);
  const firstHalf = ordered.slice(0, splitIndex).map(({ contribution }) => contribution);
  const secondHalf = ordered.slice(splitIndex).map(({ contribution }) => contribution);

  return {
    firstHalfPercentage: getContributionCachePercentage(firstHalf, currentPercentage),
    secondHalfPercentage: getContributionCachePercentage(secondHalf, currentPercentage),
    range: {
      start: ordered[0].contribution.occurredAt,
      end: ordered.at(-1)?.contribution.occurredAt ?? '',
    },
  };
};

const toCacheMetric = (
  observation: SessionDiagnosisObservation
): NumericDiagnosisMetric | undefined =>
  observation.inputTokens > 0
    ? {
        diagnosisId: observation.diagnosisId,
        occurredAt: observation.startedAt,
        projectPath: observation.projectPath,
        dominantModelId: observation.dominantModelId,
        value: getCachePercentage(observation.inputTokens, observation.cachedInputTokens),
      }
    : undefined;

const capCacheConfidence = (confidence: SessionDiagnosisConfidence): SessionDiagnosisConfidence =>
  confidence === 'low' ? 'low' : 'medium';

export const detectCacheDegradation = ({
  current,
  history,
  settings,
}: SessionDiagnosisDetectorContext): SessionDetectorResult => {
  if (current.inputTokens <= 0) {
    return {
      state: 'not-applicable',
      cause: 'cache-degradation',
      reason: 'zero-input',
    };
  }

  const currentPercentage = getCachePercentage(current.inputTokens, current.cachedInputTokens);
  const halves = getSessionHalves(current, currentPercentage);
  const targetGap = settings.targetCachePercentage - currentPercentage;
  const withinSessionDecline = halves.firstHalfPercentage - halves.secondHalfPercentage;
  const currentMetric = toCacheMetric(current);
  const historyMetrics = history.flatMap((observation) => {
    const metric = toCacheMetric(observation);
    return metric ? [metric] : [];
  });
  const baseline = currentMetric
    ? resolveDiagnosisBaseline({
        current: currentMetric,
        history: historyMetrics,
        scopeOrder: ['project-model', 'model', 'project', 'global'],
        minimumSamples: settings.anomalyMinimumSamples,
        historyWindow: settings.anomalyHistoryWindow,
        direction: 'negative',
        zeroMadAbsoluteScale: 1,
      })
    : undefined;
  const historicalGap = baseline ? baseline.median - currentPercentage : 0;
  const historicalFinding =
    Boolean(baseline) && (baseline?.score ?? 0) >= settings.anomalySensitivity;
  const historicalPointFinding = Boolean(baseline) && historicalGap >= CACHE_DECLINE_POINTS;
  const targetFinding = targetGap >= CACHE_TARGET_GAP_POINTS;
  const declineFinding = withinSessionDecline >= CACHE_DECLINE_POINTS;

  if (!historicalFinding && !historicalPointFinding && !targetFinding && !declineFinding) {
    return {
      state: 'not-found',
      cause: 'cache-degradation',
      reason: 'within-normal-range',
    };
  }

  const historicalIsCritical =
    (baseline?.score ?? 0) >= settings.anomalySensitivity * 2 ||
    historicalGap >= CACHE_CRITICAL_GAP_POINTS;
  const severity =
    historicalIsCritical ||
    targetGap >= CACHE_CRITICAL_GAP_POINTS ||
    withinSessionDecline >= CACHE_CRITICAL_GAP_POINTS
      ? 'critical'
      : 'warning';
  const candidateConfidence: SessionDiagnosisConfidence = baseline ? 'high' : 'medium';

  return {
    state: 'finding',
    cause: 'cache-degradation',
    severity,
    confidence: capCacheConfidence(candidateConfidence),
    normalizedScore: Math.max(
      normalizeDiagnosisScore(baseline?.score ?? 0, settings.anomalySensitivity * 2),
      normalizeDiagnosisScore(historicalGap, CACHE_CRITICAL_GAP_POINTS),
      normalizeDiagnosisScore(targetGap, CACHE_CRITICAL_GAP_POINTS),
      normalizeDiagnosisScore(withinSessionDecline, CACHE_CRITICAL_GAP_POINTS)
    ),
    ...(historicalFinding || historicalPointFinding ? { baseline } : {}),
    evidence: {
      kind: 'cache-reuse',
      currentPercentage,
      firstHalfPercentage: halves.firstHalfPercentage,
      secondHalfPercentage: halves.secondHalfPercentage,
      targetPercentage: settings.targetCachePercentage,
    },
    ...(halves.range ? { range: halves.range } : {}),
  };
};
