const PERCENT_SCALE = 100;

export const getCachePercentageOrNull = (
  inputTokens: number,
  cachedInputTokens: number
): number | null => {
  if (inputTokens <= 0) {
    return null;
  }

  const percentage = Math.round((cachedInputTokens / inputTokens) * PERCENT_SCALE);
  return Math.min(PERCENT_SCALE, Math.max(0, percentage));
};

export const getCachePercentage = (inputTokens: number, cachedInputTokens: number): number => {
  return getCachePercentageOrNull(inputTokens, cachedInputTokens) ?? 0;
};
