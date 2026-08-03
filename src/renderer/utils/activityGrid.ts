/**
 * @file Overview activity grid model
 * @description Builds a fixed rolling calendar grid with selected-period and intensity metadata.
 */
import type { UsageDay, UsagePeriod } from '../../shared/usageTypes';

export const ACTIVITY_CELL_COUNT = 84;
const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;
enum ActivityLevel {
  None,
  Low,
  Medium,
  High,
  Maximum,
}
const ACTIVITY_LEVEL_COUNT = ActivityLevel.Maximum;
const PERIOD_DAY_COUNTS: Record<UsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
  total: ACTIVITY_CELL_COUNT,
};

export interface ActivityCell {
  date: string;
  tokens: number;
  level: ActivityLevel;
  inPeriod: boolean;
}

const parseUtcDate = (date: string): number => Date.parse(`${date}T00:00:00.000Z`);

const formatUtcDate = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, ISO_DATE_LENGTH);

const getLevel = (tokens: number, maxTokens: number): ActivityCell['level'] => {
  if (tokens <= 0) {
    return ActivityLevel.None;
  }

  return Math.ceil((tokens / maxTokens) * ACTIVITY_LEVEL_COUNT) as ActivityCell['level'];
};

export const buildActivityCells = (
  days: UsageDay[],
  period: UsagePeriod,
  anchorDate: string
): ActivityCell[] => {
  const anchorTimestamp = parseUtcDate(anchorDate);
  const firstTimestamp = anchorTimestamp - (ACTIVITY_CELL_COUNT - 1) * MILLISECONDS_PER_DAY;
  const periodStartTimestamp =
    anchorTimestamp - (PERIOD_DAY_COUNTS[period] - 1) * MILLISECONDS_PER_DAY;
  const tokensByDate = new Map(days.map((day) => [day.date, day.totalTokens]));
  const dates = Array.from({ length: ACTIVITY_CELL_COUNT }, (_, index) =>
    formatUtcDate(firstTimestamp + index * MILLISECONDS_PER_DAY)
  );
  const maxTokens = Math.max(
    1,
    ...dates
      .filter((date) => parseUtcDate(date) >= periodStartTimestamp)
      .map((date) => tokensByDate.get(date) ?? 0)
  );

  return dates.map((date) => {
    const tokens = tokensByDate.get(date) ?? 0;
    const inPeriod = parseUtcDate(date) >= periodStartTimestamp;

    return {
      date,
      tokens,
      level: inPeriod ? getLevel(tokens, maxTokens) : 0,
      inPeriod,
    };
  });
};
