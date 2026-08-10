/**
 * @file 用量比例指标
 * @description 计算并约束缓存 Token 百分比，统一处理无输入 Token 的空值语义。
 */
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
