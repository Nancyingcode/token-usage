const PERCENT_SCALE = 100;

export const getCachePercentage = (inputTokens: number, cachedInputTokens: number): number => {
  if (inputTokens <= 0) {
    return 0;
  }

  return Math.round((cachedInputTokens / inputTokens) * PERCENT_SCALE);
};
