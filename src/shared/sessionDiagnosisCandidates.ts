/**
 * @file 会话诊断候选排序
 * @description
 * 从增量索引构建会话观测，以 Token、可安全比较的已计价费用和现有异常确定关注范围。
 *
 * 约束：
 * - 费用百分位只使用达到定价覆盖阈值的会话
 * - 所有排序均在副本上完成
 */
import type { IndexedUsageContribution } from './costOptimizationTypes';
import { calculateEstimatedCost, normalizeModelId } from './pricing';
import type {
  BuildSessionDiagnosisObservationsInput,
  SelectDiagnosisCandidatesInput,
  SessionDiagnosisCandidate,
  SessionDiagnosisObservation,
} from './sessionDiagnosisTypes';
import type { TokenUsage, UsageSlice } from './usageTypes';

const KEY_SEPARATOR = '\u001f';
const UNKNOWN_MODEL_KEY = '__unknown_model__';
const HIGH_IMPACT_PERCENTILE = 0.8;
const PERCENTAGE_SCALE = 100;

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const sumContributions = (contributions: readonly IndexedUsageContribution[]): TokenUsage =>
  contributions.reduce<TokenUsage>(
    (total, contribution) => ({
      inputTokens: total.inputTokens + contribution.inputTokens,
      cachedInputTokens: total.cachedInputTokens + contribution.cachedInputTokens,
      outputTokens: total.outputTokens + contribution.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens + contribution.reasoningOutputTokens,
      totalTokens: total.totalTokens + contribution.totalTokens,
    }),
    EMPTY_USAGE
  );

const toUsageSlice = (contribution: IndexedUsageContribution): UsageSlice => ({
  occurredAt: contribution.occurredAt,
  modelId: contribution.modelId,
  inputTokens: contribution.inputTokens,
  cachedInputTokens: contribution.cachedInputTokens,
  outputTokens: contribution.outputTokens,
  reasoningOutputTokens: contribution.reasoningOutputTokens,
  totalTokens: contribution.totalTokens,
});

const getModelKey = (modelId: string | undefined): string =>
  modelId?.trim() ? normalizeModelId(modelId) : UNKNOWN_MODEL_KEY;

const getDominantModelId = (
  contributions: readonly IndexedUsageContribution[]
): string | undefined => {
  const totalsByModel = new Map<string, number>();

  contributions.forEach((contribution) => {
    const modelKey = getModelKey(contribution.modelId);
    totalsByModel.set(modelKey, (totalsByModel.get(modelKey) ?? 0) + contribution.totalTokens);
  });

  const dominantModelKey = [...totalsByModel.entries()].sort(
    ([firstModelId, firstTokens], [secondModelId, secondTokens]) =>
      secondTokens - firstTokens || firstModelId.localeCompare(secondModelId)
  )[0]?.[0];

  return dominantModelKey === UNKNOWN_MODEL_KEY ? undefined : dominantModelKey;
};

export const buildSessionDiagnosisObservations = ({
  index,
  pricing,
}: BuildSessionDiagnosisObservationsInput): SessionDiagnosisObservation[] =>
  Object.entries(index.sources)
    .sort(([firstSourceFile], [secondSourceFile]) =>
      firstSourceFile.localeCompare(secondSourceFile)
    )
    .map(([sourceFile, source]) => {
      const contributions = source.contributions.map((contribution) => ({
        ...contribution,
      }));
      const usage = sumContributions(contributions);
      const estimate = calculateEstimatedCost(contributions.map(toUsageSlice), pricing);
      const unpricedTokens = Math.min(Math.max(estimate.unpricedTokens, 0), usage.totalTokens);
      const pricedTokens = usage.totalTokens - unpricedTokens;
      const dominantModelId = getDominantModelId(contributions);

      return {
        diagnosisId: [sourceFile, source.metadata.sessionId].join(KEY_SEPARATOR),
        sourceFile,
        sessionId: source.metadata.sessionId,
        ...(source.metadata.threadName ? { threadName: source.metadata.threadName } : {}),
        startedAt: source.metadata.startedAt,
        endedAt: source.metadata.endedAt,
        projectPath: source.metadata.projectPath,
        projectName: source.metadata.projectName,
        eventCount: source.metadata.eventCount,
        ...(dominantModelId ? { dominantModelId } : {}),
        contributions,
        pricedCostUsd: estimate.pricedCostUsd,
        coverage: {
          pricedTokens,
          unpricedTokens,
          totalTokens: usage.totalTokens,
          percentage:
            usage.totalTokens > 0
              ? (pricedTokens / usage.totalTokens) * PERCENTAGE_SCALE
              : PERCENTAGE_SCALE,
          unpricedModelIds: [...estimate.unpricedModelIds],
        },
        ...usage,
      };
    });

export const getMidrankPercentiles = (values: readonly number[]): number[] => {
  if (values.length === 0) {
    return [];
  }
  if (values.length === 1) {
    return [1];
  }

  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((first, second) => first.value - second.value || first.index - second.index);
  const percentiles = Array<number>(values.length).fill(0);
  let groupStart = 0;

  while (groupStart < sorted.length) {
    let groupEnd = groupStart;

    while (
      groupEnd + 1 < sorted.length &&
      sorted[groupEnd + 1].value === sorted[groupStart].value
    ) {
      groupEnd += 1;
    }

    const percentile = Math.min(Math.max((groupStart + groupEnd) / 2 / (sorted.length - 1), 0), 1);
    for (let index = groupStart; index <= groupEnd; index += 1) {
      percentiles[sorted[index].index] = percentile;
    }
    groupStart = groupEnd + 1;
  }

  return percentiles;
};

export const selectDiagnosisCandidates = ({
  observations,
  anomalies,
  minimumPricingCoveragePercentage,
}: SelectDiagnosisCandidatesInput): SessionDiagnosisCandidate[] => {
  const tokenPercentiles = getMidrankPercentiles(
    observations.map(({ totalTokens }) => totalTokens)
  );
  const safeCostCandidates = observations.filter(
    ({ coverage }) => coverage.percentage >= minimumPricingCoveragePercentage
  );
  const safeCostPercentiles = getMidrankPercentiles(
    safeCostCandidates.map(({ pricedCostUsd }) => pricedCostUsd)
  );
  const costPercentileByDiagnosisId = new Map(
    safeCostCandidates.map(({ diagnosisId }, index) => [diagnosisId, safeCostPercentiles[index]])
  );
  const sessionAnomalyIds = new Set(
    anomalies.flatMap(({ level, sessionId }) =>
      level === 'session' && sessionId ? [sessionId] : []
    )
  );

  return observations
    .map((observation, index): SessionDiagnosisCandidate => {
      const tokenPercentile = tokenPercentiles[index];
      const pricedCostPercentile = costPercentileByDiagnosisId.get(observation.diagnosisId);
      const impactPercentile = Math.max(tokenPercentile, pricedCostPercentile ?? 0);

      return {
        ...observation,
        tokenPercentile,
        ...(pricedCostPercentile === undefined ? {} : { pricedCostPercentile }),
        impactPercentile,
        requiresAttention:
          impactPercentile >= HIGH_IMPACT_PERCENTILE ||
          sessionAnomalyIds.has(observation.sessionId),
      };
    })
    .sort(
      (first, second) =>
        Number(second.requiresAttention) - Number(first.requiresAttention) ||
        second.impactPercentile - first.impactPercentile ||
        second.startedAt.localeCompare(first.startedAt) ||
        first.diagnosisId.localeCompare(second.diagnosisId)
    );
};
