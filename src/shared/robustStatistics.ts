/**
 * @file 稳健统计工具
 * @description
 * 提供不修改输入的中位数、MAD 与零 MAD 回退分数，供费用异常和会话诊断共享。
 */

const MAD_SCALE_FACTOR = 1.4826;

export interface RobustScoreOptions {
  zeroMadRelativeScale: number;
  zeroMadAbsoluteScale: number;
}

export interface RobustScore {
  median: number;
  mad: number;
  scale: number;
  score: number;
  ratio: number;
}

export const median = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export const medianAbsoluteDeviation = (
  values: readonly number[],
  center: number = median(values)
): number => median(values.map((value) => Math.abs(value - center)));

export const getRobustScore = (
  actual: number,
  samples: readonly number[],
  options: RobustScoreOptions
): RobustScore => {
  const center = median(samples);
  const mad = medianAbsoluteDeviation(samples, center);
  const scale =
    mad > 0
      ? MAD_SCALE_FACTOR * mad
      : Math.max(center * options.zeroMadRelativeScale, options.zeroMadAbsoluteScale);

  return {
    median: center,
    mad,
    scale,
    score: (actual - center) / scale,
    ratio: center > 0 ? actual / center : actual / options.zeroMadAbsoluteScale,
  };
};
