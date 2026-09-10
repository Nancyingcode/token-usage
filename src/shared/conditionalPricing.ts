/**
 * @file 逐请求条件计价
 * @description 先按请求分区与条件计费再聚合；缺少证据保留参考估算并返回结构化原因。
 */
import type { UnknownModelPricingInput } from './budgetTypes';
import type {
  ConditionalPricingFields,
  PriceableUsage,
  PricingIssue,
} from './conditionalPricingTypes';

const TOKENS_PER_MILLION = 1_000_000;

export interface ConditionalCostBreakdown {
  regularInputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  cacheWriteCostUsd?: number;
}

export interface ConditionalCostResult {
  costUsd: number;
  breakdown: ConditionalCostBreakdown;
  issues: PricingIssue[];
  conditionAssumedTokens: number;
  conditionAssumedCostUsd: number;
}

export const evaluateConditionalUsage = (
  usage: PriceableUsage,
  pricing: UnknownModelPricingInput & ConditionalPricingFields
): ConditionalCostResult => {
  if (usage.pricingRequests) {
    return Object.values(usage.pricingRequests).reduce<ConditionalCostResult>(
      (total, request) => {
        const next = evaluateConditionalUsage(request, pricing);
        const cacheWriteCostUsd =
          (total.breakdown.cacheWriteCostUsd ?? 0) + (next.breakdown.cacheWriteCostUsd ?? 0);
        return {
          costUsd: total.costUsd + next.costUsd,
          breakdown: {
            regularInputCostUsd:
              total.breakdown.regularInputCostUsd + next.breakdown.regularInputCostUsd,
            cachedInputCostUsd:
              total.breakdown.cachedInputCostUsd + next.breakdown.cachedInputCostUsd,
            outputCostUsd: total.breakdown.outputCostUsd + next.breakdown.outputCostUsd,
            ...(cacheWriteCostUsd > 0 ? { cacheWriteCostUsd } : {}),
          },
          issues: [...new Set([...total.issues, ...next.issues])],
          conditionAssumedTokens: total.conditionAssumedTokens + next.conditionAssumedTokens,
          conditionAssumedCostUsd: total.conditionAssumedCostUsd + next.conditionAssumedCostUsd,
        };
      },
      {
        costUsd: 0,
        breakdown: { regularInputCostUsd: 0, cachedInputCostUsd: 0, outputCostUsd: 0 },
        issues: [],
        conditionAssumedTokens: 0,
        conditionAssumedCostUsd: 0,
      }
    );
  }
  const issues: PricingIssue[] = [];
  const rules = pricing.conditions;
  const context = usage.pricingContext;
  let writes = 0;
  let modeMultiplier = 1;
  let longContext: NonNullable<typeof rules>['longContext'];
  if (!rules) {
    if (pricing.manualFlat || pricing.availableConditions) {
      issues.push('manual-flat');
    } else if (pricing.rulesStatus === 'unavailable') {
      issues.push('rules-unavailable');
    }
  } else {
    if (!context || context.mode === 'unknown' || context.modeSource !== 'response') {
      issues.push('mode-unknown');
    } else {
      const rate = rules.modes[context.mode];
      if (rate === undefined) {
        issues.push('mode-unsupported');
      } else {
        modeMultiplier = rate;
      }
    }
    if (rules.longContext) {
      if (context?.granularity !== 'request') {
        issues.push('request-granularity');
      } else if (usage.inputTokens > rules.longContext.inputTokenThreshold) {
        longContext = rules.longContext;
      }
    }
    if (rules.cacheWriteMultiplier !== undefined) {
      const rawWrites = context?.cacheWriteInputTokens;
      if (context?.cacheWriteInvalid) {
        issues.push('cache-partition-invalid');
      } else if (rawWrites === undefined) {
        issues.push('cache-write-missing');
      } else if (
        !Number.isFinite(rawWrites) ||
        rawWrites < 0 ||
        rawWrites + usage.cachedInputTokens > usage.inputTokens
      ) {
        issues.push('cache-partition-invalid');
      } else if (rawWrites > 0 && context?.cacheWriteSemantics !== 'included-in-input') {
        issues.push('cache-write-unverified');
      } else {
        writes = rawWrites;
      }
    }
  }
  const cached = Math.max(0, Math.min(usage.cachedInputTokens, usage.inputTokens));
  if (rules && cached !== usage.cachedInputTokens && !issues.includes('cache-partition-invalid')) {
    issues.push('cache-partition-invalid');
  }
  const ordinary = Math.max(usage.inputTokens - cached - writes, 0);
  const cacheWriteCostUsd =
    (writes *
      pricing.inputUsdPerMillion *
      (rules?.cacheWriteMultiplier ?? 1) *
      (longContext?.cacheWriteMultiplier ?? 1) *
      modeMultiplier) /
    TOKENS_PER_MILLION;
  const breakdown: ConditionalCostBreakdown = {
    regularInputCostUsd:
      (ordinary *
        pricing.inputUsdPerMillion *
        (longContext?.inputMultiplier ?? 1) *
        modeMultiplier) /
      TOKENS_PER_MILLION,
    cachedInputCostUsd:
      (cached *
        pricing.cachedInputUsdPerMillion *
        (longContext?.cachedInputMultiplier ?? 1) *
        modeMultiplier) /
      TOKENS_PER_MILLION,
    outputCostUsd:
      (usage.outputTokens *
        pricing.outputUsdPerMillion *
        (longContext?.outputMultiplier ?? 1) *
        modeMultiplier) /
      TOKENS_PER_MILLION,
    ...(cacheWriteCostUsd > 0 ? { cacheWriteCostUsd } : {}),
  };
  const costUsd =
    breakdown.regularInputCostUsd +
    breakdown.cachedInputCostUsd +
    breakdown.outputCostUsd +
    cacheWriteCostUsd;
  return {
    costUsd,
    breakdown,
    issues,
    conditionAssumedTokens: issues.length > 0 ? usage.totalTokens : 0,
    conditionAssumedCostUsd: issues.length > 0 ? costUsd : 0,
  };
};
