/**
 * @file 量化节省建议
 * @description
 * 基于模型替代、缓存提升和异常回落生成可追溯建议，并按贡献 ID 去除重叠金额。
 *
 * 约束：
 * - 定价覆盖不足时不得输出货币化建议
 * - 建议只携带结构化证据和 i18n key，不生成最终展示文案
 */
import type { ModelPricingEntry } from './budgetTypes';
import type {
  CostAnomaly,
  CostOptimizationSettings,
  IndexedUsageContribution,
  ModelSubstitutionScenario,
  PricingCoverage,
  SavingsRecommendation,
  SavingsRecommendationType,
} from './costOptimizationTypes';
import type { TokenUsage } from './usageTypes';

const TOKENS_PER_MILLION = 1_000_000;
const PERCENTAGE_DIVISOR = 100;
const MINIMUM_HIGH_CONFIDENCE_SESSIONS = 7;
const HIGH_CONFIDENCE_BASELINE_SAMPLES = 28;
const UNKNOWN_MODEL_ID = 'Unknown model';

const RECOMMENDATION_TYPE_ORDER: Record<SavingsRecommendationType, number> = {
  'model-substitution': 0,
  'anomaly-recovery': 1,
  'cache-improvement': 2,
};

export interface SavingsRecommendationInput {
  contributions: IndexedUsageContribution[];
  substitutionScenarios: ModelSubstitutionScenario[];
  anomalies: CostAnomaly[];
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
  coverage: PricingCoverage;
}

const normalizeModelId = (modelId: string): string => modelId.trim().toLocaleLowerCase('en-US');

const buildPricingIndex = (pricingEntries: ModelPricingEntry[]): Map<string, ModelPricingEntry> => {
  const pricingById = new Map<string, ModelPricingEntry>();

  pricingEntries.forEach((entry) => {
    [entry.modelId, ...entry.aliases].forEach((modelId) => {
      const key = normalizeModelId(modelId);

      if (key) {
        pricingById.set(key, entry);
      }
    });
  });

  return pricingById;
};

const getUsageCost = (usage: TokenUsage, pricing: ModelPricingEntry): number => {
  const regularInputTokens = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  return (
    (regularInputTokens * pricing.inputUsdPerMillion +
      usage.cachedInputTokens * pricing.cachedInputUsdPerMillion +
      usage.outputTokens * pricing.outputUsdPerMillion) /
    TOKENS_PER_MILLION
  );
};

const sumContributionSavings = (contributionSavings: Record<string, number>): number =>
  Object.values(contributionSavings).reduce((total, savings) => total + savings, 0);

const getContributionMap = (
  contributions: IndexedUsageContribution[]
): Map<string, IndexedUsageContribution> =>
  new Map(contributions.map((contribution) => [contribution.id, contribution]));

const buildModelSubstitutionRecommendations = (
  input: SavingsRecommendationInput,
  pricingById: Map<string, ModelPricingEntry>,
  contributionsById: Map<string, IndexedUsageContribution>
): SavingsRecommendation[] =>
  input.substitutionScenarios.flatMap((scenario) => {
    if (
      !scenario.sourceModelId ||
      scenario.affectedSessionCount < MINIMUM_HIGH_CONFIDENCE_SESSIONS
    ) {
      return [];
    }

    const sourcePricing = pricingById.get(normalizeModelId(scenario.sourceModelId));
    const targetPricing = pricingById.get(normalizeModelId(scenario.targetModelId));

    if (!sourcePricing || !targetPricing) {
      return [];
    }

    const contributionSavings: Record<string, number> = {};
    scenario.contributionIds.forEach((contributionId) => {
      const contribution = contributionsById.get(contributionId);
      const contributionMatchesSource =
        contribution?.modelId &&
        pricingById.get(normalizeModelId(contribution.modelId)) === sourcePricing;

      if (!contribution || !contributionMatchesSource) {
        return;
      }

      const savings =
        getUsageCost(contribution, sourcePricing) - getUsageCost(contribution, targetPricing);

      if (savings > 0) {
        contributionSavings[contributionId] = savings;
      }
    });

    const savingsUsd = sumContributionSavings(contributionSavings);

    if (savingsUsd < input.settings.minimumSavingsUsd) {
      return [];
    }

    return [
      {
        id: [
          'model-substitution',
          normalizeModelId(sourcePricing.modelId),
          normalizeModelId(targetPricing.modelId),
        ].join(':'),
        type: 'model-substitution',
        titleKey: 'recommendation.modelSubstitution',
        scopeLabel: `${scenario.sourceModelId} → ${targetPricing.modelId}`,
        savingsUsd,
        confidence: 'high',
        evidence: [
          `sessions:${scenario.affectedSessionCount}`,
          `pricing-coverage:${input.coverage.percentage}`,
        ],
        riskKey: 'risk.modelEquivalence',
        contributionSavings,
      },
    ];
  });

const getAnomalyScopeLabel = (anomaly: CostAnomaly): string =>
  anomaly.sessionId ?? anomaly.modelId ?? anomaly.projectName ?? anomaly.date ?? anomaly.level;

const buildAnomalyRecoveryRecommendations = (
  input: SavingsRecommendationInput,
  pricingById: Map<string, ModelPricingEntry>,
  contributionsById: Map<string, IndexedUsageContribution>
): SavingsRecommendation[] =>
  input.anomalies.flatMap((anomaly) => {
    const recoverableSavings = Math.max(anomaly.actualCostUsd - anomaly.baselineCostUsd, 0);
    const pricedContributions = anomaly.contributionIds.flatMap((contributionId) => {
      const contribution = contributionsById.get(contributionId);
      const pricing = contribution?.modelId
        ? pricingById.get(normalizeModelId(contribution.modelId))
        : undefined;

      if (!contribution || !pricing) {
        return [];
      }

      return [
        {
          contribution,
          currentCostUsd: getUsageCost(contribution, pricing),
        },
      ];
    });
    const totalCurrentCostUsd = pricedContributions.reduce(
      (total, { currentCostUsd }) => total + currentCostUsd,
      0
    );

    if (recoverableSavings <= 0 || totalCurrentCostUsd <= 0) {
      return [];
    }

    const contributionSavings = Object.fromEntries(
      pricedContributions.map(({ contribution, currentCostUsd }) => [
        contribution.id,
        recoverableSavings * (currentCostUsd / totalCurrentCostUsd),
      ])
    );
    const savingsUsd = sumContributionSavings(contributionSavings);

    if (savingsUsd < input.settings.minimumSavingsUsd) {
      return [];
    }

    return [
      {
        id: `anomaly-recovery:${anomaly.id}`,
        type: 'anomaly-recovery',
        titleKey: 'recommendation.anomalyRecovery',
        scopeLabel: getAnomalyScopeLabel(anomaly),
        savingsUsd,
        confidence: anomaly.sampleCount >= HIGH_CONFIDENCE_BASELINE_SAMPLES ? 'high' : 'medium',
        evidence: [
          `baseline-samples:${anomaly.sampleCount}`,
          `baseline-scope:${anomaly.baselineScope}`,
        ],
        riskKey: 'risk.anomalyRecurrence',
        contributionSavings,
      },
    ];
  });

const buildCacheImprovementRecommendations = (
  input: SavingsRecommendationInput,
  pricingById: Map<string, ModelPricingEntry>
): SavingsRecommendation[] => {
  const contributionsByModel = new Map<string, IndexedUsageContribution[]>();

  input.contributions.forEach((contribution) => {
    if (!contribution.modelId) {
      return;
    }

    const pricing = pricingById.get(normalizeModelId(contribution.modelId));

    if (!pricing) {
      return;
    }

    const key = normalizeModelId(pricing.modelId);
    const contributions = contributionsByModel.get(key) ?? [];
    contributions.push(contribution);
    contributionsByModel.set(key, contributions);
  });

  return [...contributionsByModel.entries()].flatMap(([modelKey, contributions]) => {
    const pricing = pricingById.get(modelKey);

    if (!pricing || pricing.cachedInputUsdPerMillion >= pricing.inputUsdPerMillion) {
      return [];
    }

    const contributionSavings: Record<string, number> = {};
    let inputTokens = 0;
    let cachedInputTokens = 0;

    contributions.forEach((contribution) => {
      const boundedCachedInputTokens = Math.min(
        Math.max(contribution.cachedInputTokens, 0),
        contribution.inputTokens
      );
      const targetCachedInputTokens =
        contribution.inputTokens * (input.settings.targetCachePercentage / PERCENTAGE_DIVISOR);
      const additionalCachedInputTokens = Math.min(
        Math.max(targetCachedInputTokens - boundedCachedInputTokens, 0),
        contribution.inputTokens - boundedCachedInputTokens
      );
      const savings =
        (additionalCachedInputTokens *
          (pricing.inputUsdPerMillion - pricing.cachedInputUsdPerMillion)) /
        TOKENS_PER_MILLION;

      inputTokens += contribution.inputTokens;
      cachedInputTokens += boundedCachedInputTokens;

      if (savings > 0) {
        contributionSavings[contribution.id] = savings;
      }
    });

    const currentCachePercentage =
      inputTokens > 0 ? (cachedInputTokens / inputTokens) * PERCENTAGE_DIVISOR : 0;
    const savingsUsd = sumContributionSavings(contributionSavings);

    if (
      input.settings.targetCachePercentage <= currentCachePercentage ||
      savingsUsd < input.settings.minimumSavingsUsd
    ) {
      return [];
    }

    return [
      {
        id: `cache-improvement:${modelKey}`,
        type: 'cache-improvement',
        titleKey: 'recommendation.cacheImprovement',
        scopeLabel: pricing.modelId || UNKNOWN_MODEL_ID,
        savingsUsd,
        confidence: 'medium',
        evidence: [
          `current-cache-percentage:${currentCachePercentage}`,
          `target-cache-percentage:${input.settings.targetCachePercentage}`,
        ],
        riskKey: 'risk.cacheEligibility',
        contributionSavings,
      },
    ];
  });
};

export const buildSavingsRecommendations = (
  input: SavingsRecommendationInput
): SavingsRecommendation[] => {
  if (input.coverage.percentage < input.settings.minimumPricingCoveragePercentage) {
    return [];
  }

  const pricingById = buildPricingIndex(input.pricing);
  const contributionsById = getContributionMap(input.contributions);
  const recommendations = [
    ...buildModelSubstitutionRecommendations(input, pricingById, contributionsById),
    ...buildAnomalyRecoveryRecommendations(input, pricingById, contributionsById),
    ...buildCacheImprovementRecommendations(input, pricingById),
  ];

  return recommendations.sort(
    (first, second) =>
      second.savingsUsd - first.savingsUsd ||
      RECOMMENDATION_TYPE_ORDER[first.type] - RECOMMENDATION_TYPE_ORDER[second.type] ||
      first.id.localeCompare(second.id)
  );
};

export const getConservativeSavingsUsd = (recommendations: SavingsRecommendation[]): number => {
  const maximumSavingsByContribution = new Map<string, number>();

  recommendations.forEach(({ contributionSavings }) => {
    Object.entries(contributionSavings).forEach(([contributionId, savings]) => {
      const safeSavings = Number.isFinite(savings) && savings > 0 ? savings : 0;
      maximumSavingsByContribution.set(
        contributionId,
        Math.max(maximumSavingsByContribution.get(contributionId) ?? 0, safeSavings)
      );
    });
  });

  return [...maximumSavingsByContribution.values()].reduce((total, savings) => total + savings, 0);
};
