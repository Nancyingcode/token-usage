/**
 * @file Overview activity calendar model
 * @description Builds complete natural weeks with selected-period, future-day, and intensity metadata.
 */
import { formatCalendarDateKey, MILLISECONDS_PER_DAY } from '../../shared/calendarDate';
import type { UsageDateRange, UsageDay, UsagePeriod } from '../../shared/usageTypes';

export const ACTIVITY_WEEK_COUNT = 53;
const DAYS_PER_WEEK = 7;
const ACTIVITY_CELL_COUNT = ACTIVITY_WEEK_COUNT * DAYS_PER_WEEK;
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

const getActivityWeekStart = (timestamp: number): number =>
  timestamp - new Date(timestamp).getUTCDay() * MILLISECONDS_PER_DAY;

const getActivityWindowStart = (anchorTimestamp: number): number =>
  getActivityWeekStart(anchorTimestamp) -
  (ACTIVITY_WEEK_COUNT - 1) * DAYS_PER_WEEK * MILLISECONDS_PER_DAY;

export const getClippedActivityRange = (range: UsageDateRange): UsageDateRange | undefined => {
  const startTime = getActivityWindowStart(parseUtcDate(range.endDate));
  const startDate = formatCalendarDateKey(new Date(startTime));
  return range.startDate < startDate ? { startDate, endDate: range.endDate } : undefined;
};

const getLevel = (tokens: number, maxTokens: number): ActivityCell['level'] => {
  if (tokens <= 0) {
    return ActivityLevel.None;
  }

  return Math.ceil((tokens / maxTokens) * ACTIVITY_LEVEL_COUNT) as ActivityCell['level'];
};

export const buildActivityCells = (
  days: readonly UsageDay[],
  period: UsagePeriod | UsageDateRange,
  referenceDate: string,
  showFullWindow = false
): ActivityCell[] => {
  const todayTimestamp = parseUtcDate(referenceDate);
  const anchorTimestamp =
    typeof period === 'string' ? todayTimestamp : parseUtcDate(period.endDate);
  const periodStartTimestamp =
    typeof period === 'string'
      ? anchorTimestamp - (PERIOD_DAY_COUNTS[period] - 1) * MILLISECONDS_PER_DAY
      : parseUtcDate(period.startDate);
  const periodEndTimestamp = Math.min(anchorTimestamp, todayTimestamp);
  const fullWindowStart = getActivityWindowStart(anchorTimestamp);
  const firstTimestamp = showFullWindow
    ? fullWindowStart
    : Math.max(fullWindowStart, getActivityWeekStart(periodStartTimestamp));
  const lastWeekStart = getActivityWeekStart(anchorTimestamp);
  const dayCount = (lastWeekStart - firstTimestamp) / MILLISECONDS_PER_DAY + DAYS_PER_WEEK;
  const tokensByDate = new Map(days.map((day) => [day.date, day.totalTokens]));
  const cells = Array.from({ length: dayCount }, (_, index) => {
    const timestamp = firstTimestamp + index * MILLISECONDS_PER_DAY;
    const date = formatCalendarDateKey(new Date(timestamp));
    const isFuture = timestamp > todayTimestamp;
    const tokens = isFuture ? 0 : (tokensByDate.get(date) ?? 0);
    const inPeriod = timestamp >= periodStartTimestamp && timestamp <= periodEndTimestamp;

    return {
      date,
      tokens,
      inPeriod,
      isFuture,
      weekIndex: Math.floor(index / DAYS_PER_WEEK),
      weekday: index % DAYS_PER_WEEK,
    };
  });
  const maxTokens = Math.max(1, ...cells.map(({ inPeriod, tokens }) => (inPeriod ? tokens : 0)));
  return cells.map((cell) => ({
    ...cell,
    level: cell.inPeriod ? getLevel(cell.tokens, maxTokens) : ActivityLevel.None,
  }));
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
