/**
 * @file 概览趋势的日期分组和 Token 纵轴
 * @description 让不同跨度的区间使用有限数量的数据点，并按最大用量确定刻度。
 */
import {
  formatCalendarDateKey,
  MILLISECONDS_PER_DAY,
  parseCalendarDate,
} from '../../shared/calendarDate';
import { addTokenUsage, emptyTokenUsage } from '../../shared/usageMath';
import type { UsageDateRange, UsageDay } from '../../shared/usageTypes';

const MAX_TREND_POINTS = 31;
const MAX_TREND_TICK_INTERVALS = 3;
const MIN_TREND_TICK_INTERVALS = 2;
const DECIMAL_BASE = 10;
const QUARTER_DECIMAL_MULTIPLIER = 2.5;
const HALF_DECIMAL_MULTIPLIER = 5;
const TREND_TICK_MULTIPLIERS = [1, 2, QUARTER_DECIMAL_MULTIPLIER, HALF_DECIMAL_MULTIPLIER];

export const buildTrendTokenTicks = (maxTokens: number): number[] => {
  const minimumStep = Math.max(1, maxTokens / MAX_TREND_TICK_INTERVALS);
  const magnitude = DECIMAL_BASE ** Math.floor(Math.log10(minimumStep));
  const multiplier =
    TREND_TICK_MULTIPLIERS.find((value) => value * magnitude >= minimumStep) ?? DECIMAL_BASE;
  const step = Math.ceil(multiplier * magnitude);
  const intervals = Math.max(MIN_TREND_TICK_INTERVALS, Math.ceil(maxTokens / step));
  return Array.from({ length: intervals + 1 }, (_, index) => index * step);
};

interface TrendBucket extends UsageDay {
  endDate: string;
}

interface OverviewTrendBuckets {
  buckets: TrendBucket[];
  daysPerPoint: number;
  bucketStartByDay: ReadonlyMap<string, string>;
}

export const buildOverviewTrendBuckets = (
  days: readonly UsageDay[],
  range: UsageDateRange
): OverviewTrendBuckets => {
  const startTime = parseCalendarDate(range.startDate)?.getTime();
  const endTime = parseCalendarDate(range.endDate)?.getTime();
  const bucketStartByDay = new Map<string, string>();
  if (startTime === undefined || endTime === undefined || startTime > endTime) {
    return { buckets: [], daysPerPoint: 1, bucketStartByDay };
  }

  // UTC 午夜只用于计算自然日跨度。范围再长，也只创建图表用到的日期段。
  const dayCount = (endTime - startTime) / MILLISECONDS_PER_DAY + 1;
  const daysPerPoint = Math.ceil(dayCount / MAX_TREND_POINTS);
  const bucketDuration = daysPerPoint * MILLISECONDS_PER_DAY;
  const buckets: TrendBucket[] = Array.from(
    { length: Math.ceil(dayCount / daysPerPoint) },
    (_, index) => {
      const bucketStart = startTime + index * bucketDuration;
      const bucketEnd = Math.min(endTime, bucketStart + bucketDuration - MILLISECONDS_PER_DAY);
      return {
        ...emptyTokenUsage(),
        date: formatCalendarDateKey(new Date(bucketStart)),
        endDate: formatCalendarDateKey(new Date(bucketEnd)),
        sessionCount: 0,
      };
    }
  );

  for (const day of days) {
    const time = parseCalendarDate(day.date)?.getTime();
    if (time === undefined || time < startTime || time > endTime) {
      continue;
    }

    const index = Math.floor((time - startTime) / bucketDuration);
    const bucket = buckets[index];
    buckets[index] = {
      ...bucket,
      ...addTokenUsage(bucket, day),
      sessionCount: bucket.sessionCount + day.sessionCount,
    };
    bucketStartByDay.set(day.date, bucket.date);
  }

  return { buckets, daysPerPoint, bucketStartByDay };
};
