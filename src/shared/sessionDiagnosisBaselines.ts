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

const getScopeKey = (
  scope: SessionDiagnosisBaselineScope,
  metric: NumericDiagnosisMetric
): string => {
  switch (scope) {
    case 'session':
      return metric.diagnosisId;
    case 'project-model':
      return JSON.stringify([metric.projectPath, getModelKey(metric.dominantModelId)]);
    case 'model':
      return JSON.stringify(getModelKey(metric.dominantModelId) ?? null);
    case 'project':
      return metric.projectPath;
    case 'global':
      return '';
  }
};

interface TimedDiagnosisMetric {
  metric: NumericDiagnosisMetric;
  time: number;
}

export type DiagnosisBaselineResolver = (
  input: Omit<ResolveDiagnosisBaselineInput, 'history'>
) => SessionDiagnosisBaseline | undefined;

export const createDiagnosisBaselineResolver = (
  history: NumericDiagnosisMetric[]
): DiagnosisBaselineResolver => {
  const orderedHistory = history
    .map((metric) => ({
      metric,
      time: Date.parse(metric.occurredAt),
    }))
    .filter(({ metric, time }) => Number.isFinite(time) && Number.isFinite(metric.value))
    .sort(
      (first, second) =>
        first.time - second.time ||
        first.metric.diagnosisId.localeCompare(second.metric.diagnosisId)
    );
  // 索引只属于本次诊断评估；同一历史按范围复用，评估结束即释放，不跨数据刷新缓存。
  const historiesByScope = new Map<
    SessionDiagnosisBaselineScope,
    Map<string, TimedDiagnosisMetric[]>
  >();

  const getScopedHistory = (
    scope: SessionDiagnosisBaselineScope,
    current: NumericDiagnosisMetric
  ): TimedDiagnosisMetric[] => {
    let groups = historiesByScope.get(scope);
    if (!groups) {
      groups = new Map<string, TimedDiagnosisMetric[]>();
      for (const entry of orderedHistory) {
        const key = getScopeKey(scope, entry.metric);
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
      }
      historiesByScope.set(scope, groups);
    }
    return groups.get(getScopeKey(scope, current)) ?? [];
  };

  return ({
    current,
    scopeOrder,
    minimumSamples,
    historyWindow,
    direction,
    zeroMadAbsoluteScale,
  }) => {
    const currentTime = Date.parse(current.occurredAt);
    if (!Number.isFinite(currentTime)) {
      return undefined;
    }

    for (const scope of scopeOrder) {
      const scopedHistory = getScopedHistory(scope, current);
      let start = 0;
      let end = scopedHistory.length;
      // 取严格早于当前会话的前缀，排除同时刻及未来数据，防止历史基线泄漏。
      while (start < end) {
        const middle = Math.floor((start + end) / 2);
        if (scopedHistory[middle].time < currentTime) {
          start = middle + 1;
        } else {
          end = middle;
        }
      }
      const windowSize = Math.trunc(Math.max(historyWindow, 0));
      const samples = scopedHistory
        .slice(windowSize > 0 ? Math.max(0, end - windowSize) : 0, end)
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
};

export const resolveDiagnosisBaseline = ({
  history,
  ...input
}: ResolveDiagnosisBaselineInput): SessionDiagnosisBaseline | undefined =>
  createDiagnosisBaselineResolver(history)(input);
