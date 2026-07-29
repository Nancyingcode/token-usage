/**
 * @file 交互累积诊断
 * @description
 * 使用事件数和持续时间历史基线识别分散在多次用量事件中的会话累积。
 *
 * 约束：
 * - 单个切片占比超过一半时不得归因为交互累积
 * - 无效会话时间只移除持续时间证据，不影响事件数证据
 */
import type { SessionDetectorResult, SessionDiagnosisBaseline } from './costOptimizationTypes';
import { resolveDiagnosisBaseline, type NumericDiagnosisMetric } from './sessionDiagnosisBaselines';
import type {
  SessionDiagnosisDetectorContext,
  SessionDiagnosisObservation,
} from './sessionDiagnosisTypes';
import { clampUnitInterval, normalizeDiagnosisScore } from './sessionDiagnosisTypes';

const SINGLE_SPIKE_MAX_SHARE = 0.5;
const MIN_EVENT_SCALE = 1;
const MIN_DURATION_SCALE_MS = 60_000;
const CRITICAL_SCORE_MULTIPLIER = 2;

const getDurationMs = (observation: SessionDiagnosisObservation): number | undefined => {
  const start = Date.parse(observation.startedAt);
  const end = Date.parse(observation.endedAt);

  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : undefined;
};

const getObservationTime = (observation: SessionDiagnosisObservation): string | undefined => {
  if (Number.isFinite(Date.parse(observation.startedAt))) {
    return observation.startedAt;
  }

  return observation.contributions
    .map(({ occurredAt }) => ({
      occurredAt,
      time: Date.parse(occurredAt),
    }))
    .filter(({ time }) => Number.isFinite(time))
    .sort(
      (first, second) =>
        first.time - second.time || first.occurredAt.localeCompare(second.occurredAt)
    )[0]?.occurredAt;
};

const toMetric = (
  observation: SessionDiagnosisObservation,
  value: number
): NumericDiagnosisMetric | undefined => {
  const occurredAt = getObservationTime(observation);

  return occurredAt
    ? {
        diagnosisId: observation.diagnosisId,
        occurredAt,
        projectPath: observation.projectPath,
        dominantModelId: observation.dominantModelId,
        value,
      }
    : undefined;
};

const chooseBaseline = (
  eventBaseline: SessionDiagnosisBaseline | undefined,
  durationBaseline: SessionDiagnosisBaseline | undefined
): SessionDiagnosisBaseline | undefined => {
  if (!eventBaseline) {
    return durationBaseline;
  }
  if (!durationBaseline) {
    return eventBaseline;
  }
  return durationBaseline.score > eventBaseline.score ? durationBaseline : eventBaseline;
};

export const detectInteractionAccumulation = ({
  current,
  history,
  settings,
}: SessionDiagnosisDetectorContext): SessionDetectorResult => {
  if (current.totalTokens <= 0) {
    return {
      state: 'not-applicable',
      cause: 'interaction-accumulation',
      reason: 'zero-total',
    };
  }

  const maxSliceShare = clampUnitInterval(
    Math.max(
      0,
      ...current.contributions.map(
        ({ totalTokens }) => Math.max(totalTokens, 0) / current.totalTokens
      )
    )
  );

  if (maxSliceShare > SINGLE_SPIKE_MAX_SHARE) {
    return {
      state: 'not-found',
      cause: 'interaction-accumulation',
      reason: 'within-normal-range',
    };
  }

  const currentEventMetric = toMetric(current, current.eventCount);
  const currentDuration = getDurationMs(current);
  const currentDurationMetric =
    currentDuration === undefined ? undefined : toMetric(current, currentDuration);
  const eventHistory = history.flatMap((observation) => {
    const metric = toMetric(observation, observation.eventCount);
    return metric ? [metric] : [];
  });
  const durationHistory = history.flatMap((observation) => {
    const duration = getDurationMs(observation);
    const metric = duration === undefined ? undefined : toMetric(observation, duration);
    return metric ? [metric] : [];
  });
  const baselineInput = {
    scopeOrder: ['project', 'global'] as const,
    minimumSamples: settings.anomalyMinimumSamples,
    historyWindow: settings.anomalyHistoryWindow,
    direction: 'positive' as const,
  };
  const eventBaseline = currentEventMetric
    ? resolveDiagnosisBaseline({
        current: currentEventMetric,
        history: eventHistory,
        ...baselineInput,
        zeroMadAbsoluteScale: MIN_EVENT_SCALE,
      })
    : undefined;
  const durationBaseline = currentDurationMetric
    ? resolveDiagnosisBaseline({
        current: currentDurationMetric,
        history: durationHistory,
        ...baselineInput,
        zeroMadAbsoluteScale: MIN_DURATION_SCALE_MS,
      })
    : undefined;

  if (!eventBaseline && !durationBaseline) {
    return {
      state: 'insufficient-data',
      cause: 'interaction-accumulation',
      reason: 'insufficient-history',
    };
  }

  const eventFinding =
    (eventBaseline?.score ?? Number.NEGATIVE_INFINITY) >= settings.anomalySensitivity;
  const durationFinding =
    (durationBaseline?.score ?? Number.NEGATIVE_INFINITY) >= settings.anomalySensitivity;

  if (!eventFinding && !durationFinding) {
    return {
      state: 'not-found',
      cause: 'interaction-accumulation',
      reason: 'within-normal-range',
    };
  }

  const criticalThreshold = settings.anomalySensitivity * CRITICAL_SCORE_MULTIPLIER;
  const highestScore = Math.max(
    eventFinding ? (eventBaseline?.score ?? 0) : 0,
    durationFinding ? (durationBaseline?.score ?? 0) : 0
  );
  const baseline = chooseBaseline(eventBaseline, durationBaseline);

  return {
    state: 'finding',
    cause: 'interaction-accumulation',
    severity: highestScore >= criticalThreshold ? 'critical' : 'warning',
    confidence: 'high',
    normalizedScore: normalizeDiagnosisScore(highestScore, criticalThreshold),
    ...(baseline ? { baseline } : {}),
    evidence: {
      kind: 'interaction-accumulation',
      eventCount: current.eventCount,
      ...(currentDuration === undefined ? {} : { durationMs: currentDuration }),
      maxSliceShare,
    },
    ...(currentDuration === undefined
      ? {}
      : {
          range: {
            start: current.startedAt,
            end: current.endedAt,
          },
        }),
  };
};
