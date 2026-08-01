/**
 * @file 模型费用构成诊断
 * @description
 * 使用当前价格表识别高单位费用模型主导和会话内向高费用模型切换，不推断模型能力等价性。
 *
 * 约束：
 * - 任一参与模型未计价时不得输出模型费用结论
 * - 有效单位费用必须按当前会话实际 Token 构成加权
 */
import type { ModelPricingEntry } from './budgetTypes';
import type { IndexedUsageContribution, SessionDetectorResult } from './costOptimizationTypes';
import { calculateEstimatedCost, normalizeModelId } from './pricing';
import { median } from './robustStatistics';
import type { SessionDiagnosisDetectorContext } from './sessionDiagnosisTypes';
import { clampUnitInterval, normalizeDiagnosisScore } from './sessionDiagnosisTypes';
import type { TokenUsage, UsageSlice } from './usageTypes';

const DOMINANT_MODEL_COST_SHARE = 0.5;
const HIGH_UNIT_COST_RATIO = 1.5;
const MODEL_SWITCH_COST_RATIO = 1.5;
const MODEL_SWITCH_MIN_COST_SHARE = 0.2;
const MODEL_COST_CRITICAL_RATIO = 3;
const UNKNOWN_MODEL_KEY = '__unknown_model__';

interface ModelUsageGroup {
  modelId: string;
  pricingEntry?: ModelPricingEntry;
  usage: TokenUsage;
  slices: UsageSlice[];
  costUsd: number;
}

interface ModelCostSignal {
  modelId: string;
  costShare: number;
  unitCostRatio: number;
}

interface ModelSwitchSignal extends ModelCostSignal {
  switchedFromModelId: string;
  switchedToModelId: string;
  switchedCostShare: number;
  occurredAt: string;
  contributionId: string;
}

const EMPTY_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

export const isHighCostModelSwitch = (unitCostRatio: number, switchedCostShare: number): boolean =>
  unitCostRatio >= MODEL_SWITCH_COST_RATIO && switchedCostShare >= MODEL_SWITCH_MIN_COST_SHARE;

const addUsage = (first: TokenUsage, second: TokenUsage): TokenUsage => ({
  inputTokens: first.inputTokens + second.inputTokens,
  cachedInputTokens: first.cachedInputTokens + second.cachedInputTokens,
  outputTokens: first.outputTokens + second.outputTokens,
  reasoningOutputTokens: first.reasoningOutputTokens + second.reasoningOutputTokens,
  totalTokens: first.totalTokens + second.totalTokens,
});

const toUsageSlice = (contribution: IndexedUsageContribution): UsageSlice => ({
  occurredAt: contribution.occurredAt,
  modelId: contribution.modelId,
  inputTokens: contribution.inputTokens,
  cachedInputTokens: contribution.cachedInputTokens,
  outputTokens: contribution.outputTokens,
  reasoningOutputTokens: contribution.reasoningOutputTokens,
  totalTokens: contribution.totalTokens,
});

const getPricingIndex = (pricing: readonly ModelPricingEntry[]): Map<string, ModelPricingEntry> => {
  const index = new Map<string, ModelPricingEntry>();

  pricing.forEach((entry) => {
    [entry.modelId, ...entry.aliases].forEach((modelId) => {
      const key = normalizeModelId(modelId);
      if (key) {
        index.set(key, entry);
      }
    });
  });

  return index;
};

const getModelKey = (modelId: string | undefined): string =>
  modelId?.trim() ? normalizeModelId(modelId) : UNKNOWN_MODEL_KEY;

const getEffectiveUnitCost = (usage: TokenUsage, pricing: ModelPricingEntry): number => {
  const boundedCachedInput = Math.min(
    Math.max(usage.cachedInputTokens, 0),
    Math.max(usage.inputTokens, 0)
  );
  const regularInput = Math.max(usage.inputTokens - boundedCachedInput, 0);
  const pricedTokens = regularInput + boundedCachedInput + Math.max(usage.outputTokens, 0);

  if (pricedTokens === 0) {
    return 0;
  }

  return (
    (regularInput * pricing.inputUsdPerMillion +
      boundedCachedInput * pricing.cachedInputUsdPerMillion +
      Math.max(usage.outputTokens, 0) * pricing.outputUsdPerMillion) /
    pricedTokens
  );
};

const buildModelGroups = (
  contributions: readonly IndexedUsageContribution[],
  pricing: readonly ModelPricingEntry[]
): ModelUsageGroup[] => {
  const pricingById = getPricingIndex(pricing);
  const groups = new Map<
    string,
    {
      modelId: string;
      pricingEntry?: ModelPricingEntry;
      usage: TokenUsage;
      slices: UsageSlice[];
    }
  >();

  contributions.forEach((contribution) => {
    const modelId = getModelKey(contribution.modelId);
    const existing = groups.get(modelId) ?? {
      modelId,
      pricingEntry: pricingById.get(modelId),
      usage: EMPTY_USAGE,
      slices: [],
    };
    existing.usage = addUsage(existing.usage, contribution);
    existing.slices = [...existing.slices, toUsageSlice(contribution)];
    groups.set(modelId, existing);
  });

  return [...groups.values()].map((group) => ({
    ...group,
    costUsd: calculateEstimatedCost(group.slices, [...pricing]).pricedCostUsd,
  }));
};

const hasCompletePricing = (groups: readonly ModelUsageGroup[]): boolean =>
  groups.every(
    ({ pricingEntry, slices }) =>
      pricingEntry !== undefined &&
      calculateEstimatedCost(slices, [pricingEntry]).unpricedModelIds.length === 0
  );

const getDominantSignal = (
  groups: readonly ModelUsageGroup[],
  sessionUsage: TokenUsage,
  referenceUnitCost: number,
  sessionCostUsd: number
): ModelCostSignal | undefined => {
  const dominant = [...groups].sort(
    (first, second) => second.costUsd - first.costUsd || first.modelId.localeCompare(second.modelId)
  )[0];

  if (!dominant?.pricingEntry || sessionCostUsd <= 0) {
    return undefined;
  }

  const unitCostRatio =
    referenceUnitCost > 0
      ? getEffectiveUnitCost(sessionUsage, dominant.pricingEntry) / referenceUnitCost
      : 0;
  const costShare = dominant.costUsd / sessionCostUsd;

  return costShare >= DOMINANT_MODEL_COST_SHARE && unitCostRatio >= HIGH_UNIT_COST_RATIO
    ? { modelId: dominant.modelId, costShare, unitCostRatio }
    : undefined;
};

const getSwitchSignals = (
  contributions: readonly IndexedUsageContribution[],
  groups: readonly ModelUsageGroup[],
  sessionUsage: TokenUsage,
  sessionCostUsd: number,
  pricing: readonly ModelPricingEntry[]
): ModelSwitchSignal[] => {
  const groupByModelId = new Map(groups.map((group) => [group.modelId, group]));
  const ordered = contributions
    .map((contribution) => ({
      contribution,
      time: Date.parse(contribution.occurredAt),
      modelId: getModelKey(contribution.modelId),
    }))
    .filter(({ time }) => Number.isFinite(time))
    .sort(
      (first, second) =>
        first.time - second.time || first.contribution.id.localeCompare(second.contribution.id)
    );
  const signals: ModelSwitchSignal[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];

    if (previous.modelId === current.modelId) {
      continue;
    }

    const previousGroup = groupByModelId.get(previous.modelId);
    const currentGroup = groupByModelId.get(current.modelId);
    if (!previousGroup?.pricingEntry || !currentGroup?.pricingEntry || sessionCostUsd <= 0) {
      continue;
    }

    const previousUnitCost = getEffectiveUnitCost(sessionUsage, previousGroup.pricingEntry);
    const currentUnitCost = getEffectiveUnitCost(sessionUsage, currentGroup.pricingEntry);
    const unitCostRatio = previousUnitCost > 0 ? currentUnitCost / previousUnitCost : 0;
    let runEnd = index;

    while (runEnd + 1 < ordered.length && ordered[runEnd + 1].modelId === current.modelId) {
      runEnd += 1;
    }

    const switchedCostUsd = calculateEstimatedCost(
      ordered.slice(index, runEnd + 1).map(({ contribution }) => toUsageSlice(contribution)),
      [...pricing]
    ).pricedCostUsd;
    const switchedCostShare = switchedCostUsd / sessionCostUsd;

    if (!isHighCostModelSwitch(unitCostRatio, switchedCostShare)) {
      continue;
    }

    signals.push({
      modelId: current.modelId,
      costShare: currentGroup.costUsd / sessionCostUsd,
      unitCostRatio,
      switchedFromModelId: previous.modelId,
      switchedToModelId: current.modelId,
      switchedCostShare,
      occurredAt: current.contribution.occurredAt,
      contributionId: current.contribution.id,
    });
  }

  return signals.sort(
    (first, second) =>
      second.unitCostRatio - first.unitCostRatio ||
      second.switchedCostShare - first.switchedCostShare ||
      first.occurredAt.localeCompare(second.occurredAt) ||
      first.contributionId.localeCompare(second.contributionId)
  );
};

export const detectModelCostDominance = ({
  current,
  pricing,
}: SessionDiagnosisDetectorContext): SessionDetectorResult => {
  const groups = buildModelGroups(current.contributions, pricing);

  if (groups.length === 0 || !hasCompletePricing(groups)) {
    return {
      state: 'not-applicable',
      cause: 'model-cost-dominance',
      reason: 'pricing-incomplete',
    };
  }

  const sessionUsage = current.contributions.reduce<TokenUsage>(addUsage, EMPTY_USAGE);
  const sessionCostUsd = groups.reduce((total, group) => total + group.costUsd, 0);
  const referenceUnitCost = median(
    pricing.map((entry) => getEffectiveUnitCost(sessionUsage, entry))
  );
  const dominantSignal = getDominantSignal(groups, sessionUsage, referenceUnitCost, sessionCostUsd);
  const switchSignal = getSwitchSignals(
    current.contributions,
    groups,
    sessionUsage,
    sessionCostUsd,
    pricing
  )[0];

  if (!dominantSignal && !switchSignal) {
    return {
      state: 'not-found',
      cause: 'model-cost-dominance',
      reason: 'within-normal-range',
    };
  }

  const selectedSignal = switchSignal ?? dominantSignal;
  if (!selectedSignal) {
    return {
      state: 'not-found',
      cause: 'model-cost-dominance',
      reason: 'within-normal-range',
    };
  }

  const unitCostRatio = selectedSignal.unitCostRatio;

  return {
    state: 'finding',
    cause: 'model-cost-dominance',
    severity: unitCostRatio >= MODEL_COST_CRITICAL_RATIO ? 'critical' : 'warning',
    confidence: 'medium',
    normalizedScore: normalizeDiagnosisScore(unitCostRatio, MODEL_COST_CRITICAL_RATIO),
    evidence: {
      kind: 'model-cost',
      modelId: selectedSignal.modelId,
      costShare: clampUnitInterval(selectedSignal.costShare),
      unitCostRatio,
      ...(switchSignal
        ? {
            switchedFromModelId: switchSignal.switchedFromModelId,
            switchedToModelId: switchSignal.switchedToModelId,
            switchedCostShare: clampUnitInterval(switchSignal.switchedCostShare),
          }
        : {}),
    },
    range: { start: current.startedAt, end: current.endedAt },
  };
};
