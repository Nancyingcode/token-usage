const TOKENS_PER_MILLION = 1_000_000;
const ESTIMATED_COST_PER_MILLION_TOKENS = 1.35;
const PERCENT_SCALE = 100;

export const estimateTokenCost = (totalTokens: number): number =>
  (totalTokens / TOKENS_PER_MILLION) * ESTIMATED_COST_PER_MILLION_TOKENS;

export const getCachePercentage = (inputTokens: number, cachedInputTokens: number): number => {
  if (inputTokens <= 0) {
    return 0;
  }

  return Math.round((cachedInputTokens / inputTokens) * PERCENT_SCALE);
};
