/**
 * @file 概览自定义趋势
 * @description 将选中的自然日连续分组，使长区间也能在有限数量的图表点上展示。
 */
import {
  formatCalendarDateKey,
  MILLISECONDS_PER_DAY,
  parseCalendarDate,
} from '../../shared/calendarDate';
import { addTokenUsage, emptyTokenUsage } from '../../shared/usageMath';
import type { UsageDateRange, UsageDay } from '../../shared/usageTypes';

const MAX_TREND_POINTS = 31;

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
