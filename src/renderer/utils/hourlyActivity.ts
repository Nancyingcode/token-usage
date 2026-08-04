/**
 * @file Hourly activity aggregation
 * @description Builds immutable local-hour token, session, and active-day metrics for performance UI.
 */

import type { UsageSession } from '../../shared/usageTypes';

export interface HourlyActivityBucket {
  hour: number;
  totalTokens: number;
  shareOfTotal: number;
  sessionCount: number;
  activeDayCount: number;
}

export interface HourlyActivity {
  hours: HourlyActivityBucket[];
  peakHour: HourlyActivityBucket | null;
  allocatedTokens: number;
  unallocatedTokens: number;
}

interface MutableHourBucket {
  hour: number;
  totalTokens: number;
  sessionKeys: Set<string>;
  activeDays: Set<string>;
}

interface HourContribution {
  hour: number;
  date: string;
  totalTokens: number;
}

const HOURS_PER_DAY = 24;
const PERCENT_SCALE = 100;
const DATE_PART_MINIMUM_DIGITS = 2;

const createMutableBuckets = (): MutableHourBucket[] =>
  Array.from({ length: HOURS_PER_DAY }, (_, hour) => ({
    hour,
    totalTokens: 0,
    sessionKeys: new Set<string>(),
    activeDays: new Set<string>(),
  }));

const toLocalContribution = (timestamp: string, totalTokens: number): HourContribution | null => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime()) || totalTokens <= 0) {
    return null;
  }

  const month = String(date.getMonth() + 1).padStart(DATE_PART_MINIMUM_DIGITS, '0');
  const day = String(date.getDate()).padStart(DATE_PART_MINIMUM_DIGITS, '0');

  return {
    hour: date.getHours(),
    date: `${date.getFullYear()}-${month}-${day}`,
    totalTokens,
  };
};

const getSessionContributions = (session: UsageSession): HourContribution[] => {
  const sliceContributions = session.usageSlices
    .map(({ occurredAt, totalTokens }) => toLocalContribution(occurredAt, totalTokens))
    .filter((contribution): contribution is HourContribution => contribution !== null);

  if (sliceContributions.length > 0) {
    return sliceContributions;
  }

  const fallback = toLocalContribution(session.startedAt, session.totalTokens);
  return fallback ? [fallback] : [];
};

const comparePeakCandidates = (first: HourlyActivityBucket, second: HourlyActivityBucket): number =>
  second.totalTokens - first.totalTokens ||
  second.sessionCount - first.sessionCount ||
  second.activeDayCount - first.activeDayCount ||
  first.hour - second.hour;

export const buildHourlyActivity = (sessions: UsageSession[]): HourlyActivity => {
  const buckets = createMutableBuckets();
  const totalSessionTokens = sessions.reduce(
    (total, session) => total + Math.max(0, session.totalTokens),
    0
  );

  sessions.forEach((session) => {
    const sessionKey = session.sourceFile;

    getSessionContributions(session).forEach((contribution) => {
      const bucket = buckets[contribution.hour];

      if (!bucket) {
        return;
      }

      bucket.totalTokens += contribution.totalTokens;
      bucket.sessionKeys.add(sessionKey);
      bucket.activeDays.add(contribution.date);
    });
  });

  const allocatedTokens = buckets.reduce((total, bucket) => total + bucket.totalTokens, 0);
  const hours = buckets.map<HourlyActivityBucket>((bucket) => ({
    hour: bucket.hour,
    totalTokens: bucket.totalTokens,
    shareOfTotal: allocatedTokens > 0 ? (bucket.totalTokens / allocatedTokens) * PERCENT_SCALE : 0,
    sessionCount: bucket.sessionKeys.size,
    activeDayCount: bucket.activeDays.size,
  }));
  const peakHour = allocatedTokens > 0 ? ([...hours].sort(comparePeakCandidates)[0] ?? null) : null;

  return {
    hours,
    peakHour,
    allocatedTokens,
    unallocatedTokens: Math.max(0, totalSessionTokens - allocatedTokens),
  };
};
