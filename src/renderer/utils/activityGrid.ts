/**
 * @file Overview activity calendar model
 * @description Builds complete natural weeks with selected-period, future-day, and intensity metadata.
 */
import type { UsageDay, UsagePeriod } from '../../shared/usageTypes';

export const ACTIVITY_WEEK_COUNT = 53;
const DAYS_PER_WEEK = 7;
export const ACTIVITY_CELL_COUNT = ACTIVITY_WEEK_COUNT * DAYS_PER_WEEK;
const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE_LENGTH = 10;
const FIRST_DAY_OF_MONTH = 1;
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
  isFuture: boolean;
  weekIndex: number;
  weekday: number;
}

export interface ActivityMonthLabel {
  date: string;
  weekIndex: number;
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
  const anchorWeekday = new Date(anchorTimestamp).getUTCDay();
  const anchorWeekStartTimestamp = anchorTimestamp - anchorWeekday * MILLISECONDS_PER_DAY;
  const firstTimestamp =
    anchorWeekStartTimestamp - (ACTIVITY_WEEK_COUNT - 1) * DAYS_PER_WEEK * MILLISECONDS_PER_DAY;
  const periodStartTimestamp =
    anchorTimestamp - (PERIOD_DAY_COUNTS[period] - 1) * MILLISECONDS_PER_DAY;
  const tokensByDate = new Map(days.map((day) => [day.date, day.totalTokens]));
  const dates = Array.from({ length: ACTIVITY_CELL_COUNT }, (_, index) =>
    formatUtcDate(firstTimestamp + index * MILLISECONDS_PER_DAY)
  );
  const maxTokens = Math.max(
    1,
    ...dates
      .filter((date) => {
        const timestamp = parseUtcDate(date);
        return timestamp >= periodStartTimestamp && timestamp <= anchorTimestamp;
      })
      .map((date) => tokensByDate.get(date) ?? 0)
  );

  return dates.map((date, index) => {
    const timestamp = parseUtcDate(date);
    const isFuture = timestamp > anchorTimestamp;
    const tokens = isFuture ? 0 : (tokensByDate.get(date) ?? 0);
    const inPeriod = timestamp >= periodStartTimestamp && !isFuture;

    return {
      date,
      tokens,
      level: inPeriod ? getLevel(tokens, maxTokens) : 0,
      inPeriod,
      isFuture,
      weekIndex: Math.floor(index / DAYS_PER_WEEK),
      weekday: index % DAYS_PER_WEEK,
    };
  });
};

export const buildActivityMonthLabels = (cells: ActivityCell[]): ActivityMonthLabel[] => {
  const firstCell = cells[0];

  if (!firstCell) {
    return [];
  }

  const labelsByWeek = new Map<number, ActivityMonthLabel>([
    [firstCell.weekIndex, { date: firstCell.date, weekIndex: firstCell.weekIndex }],
  ]);

  cells.forEach((cell) => {
    if (new Date(parseUtcDate(cell.date)).getUTCDate() === FIRST_DAY_OF_MONTH) {
      labelsByWeek.set(cell.weekIndex, { date: cell.date, weekIndex: cell.weekIndex });
    }
  });

  return [...labelsByWeek.values()].sort((first, second) => first.weekIndex - second.weekIndex);
};
