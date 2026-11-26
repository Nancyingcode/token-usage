/**
 * @file Usage aggregation and project identity
 * @description Aggregates token usage and defines the shared identity rules for projects.
 */
import { formatLocalDateKey, parseCalendarDate } from './calendarDate';
import type {
  RollingUsagePeriod,
  TokenUsage,
  UsageDateRange,
  UsageDay,
  UsagePeriod,
  UsageProject,
  UsageSession,
  UsageSummary,
} from './usageTypes';

const PERIOD_DAY_COUNTS: Record<RollingUsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

type UsageDateRangeIssue = 'required' | 'invalid' | 'reversed' | 'future';

type ParsedUsageDateRange =
  { kind: UsageDateRangeIssue } | { kind: 'valid'; start: Date; end: Date };

export const emptyTokenUsage = (): TokenUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
});

export const addTokenUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  reasoningOutputTokens: a.reasoningOutputTokens + b.reasoningOutputTokens,
  totalTokens: a.totalTokens + b.totalTokens,
});

export const UNKNOWN_PROJECT_KEY = 'Unknown Project';

export const getProjectIdentity = (projectPath: string): string =>
  projectPath || UNKNOWN_PROJECT_KEY;

export const getProjectName = (projectPath: string): string => {
  const projectIdentity = getProjectIdentity(projectPath);
  const normalized = projectIdentity.replace(/\\/g, '/').replace(/\/+$/, '');
  const name = normalized.split('/').filter(Boolean).pop();
  return name || projectIdentity;
};

export const getLocalDateKey = (timestamp: string): string => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown Date';
  }

  return formatLocalDateKey(date);
};

export const buildUsageSummary = (sessions: UsageSession[]): UsageSummary => {
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return {
    totals: buildTotals(sortedSessions),
    byDay: buildDailyTotals(sortedSessions),
    byProject: buildProjectTotals(sortedSessions),
    sessions: sortedSessions,
  };
};

const getRollingPeriodStart = (period: RollingUsagePeriod, now: Date): Date => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAY_COUNTS[period] - 1));
  return start;
};

export const filterUsageSummary = (
  summary: UsageSummary,
  period: UsagePeriod,
  now: Date = new Date()
): UsageSummary => {
  if (period === 'total') {
    return summary;
  }

  const endTime = now.getTime();

  if (Number.isNaN(endTime)) {
    return buildUsageSummary([]);
  }

  const startTime = getRollingPeriodStart(period, now).getTime();

  return buildUsageSummary(
    summary.sessions.filter((session) => {
      const startedAt = new Date(session.startedAt).getTime();
      return !Number.isNaN(startedAt) && startedAt >= startTime && startedAt <= endTime;
    })
  );
};

const parseUsageDateRange = (
  { startDate, endDate }: UsageDateRange,
  today: string
): ParsedUsageDateRange => {
  if (!startDate || !endDate) {
    return { kind: 'required' };
  }

  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) {
    return { kind: 'invalid' };
  }

  if (startDate > endDate) {
    return { kind: 'reversed' };
  }

  if (endDate > today) {
    return { kind: 'future' };
  }

  return { kind: 'valid', start, end };
};

export const getUsageDateRangeIssue = (
  range: UsageDateRange,
  today: string
): UsageDateRangeIssue | null => {
  const { kind } = parseUsageDateRange(range, today);
  return kind === 'valid' ? null : kind;
};

export const getInitialUsageDateRange = (
  period: UsagePeriod,
  days: readonly UsageDay[],
  now: Date = new Date()
): UsageDateRange => {
  const endDate = formatLocalDateKey(now);
  if (period !== 'total') {
    return { startDate: formatLocalDateKey(getRollingPeriodStart(period, now)), endDate };
  }

  const earliestDay = days.find(({ date }) => date <= endDate && parseCalendarDate(date));
  return { startDate: earliestDay?.date ?? endDate, endDate };
};

const getLocalMidnight = (calendarDate: Date, daysAfter: number): number => {
  const midnight = new Date(0);
  midnight.setHours(0, 0, 0, 0);
  return midnight.setFullYear(
    calendarDate.getUTCFullYear(),
    calendarDate.getUTCMonth(),
    calendarDate.getUTCDate() + daysAfter
  );
};

export const filterUsageSummaryByDateRange = (
  summary: UsageSummary,
  range: UsageDateRange,
  now: Date = new Date()
): UsageSummary => {
  const currentTime = now.getTime();
  const dates = parseUsageDateRange(range, formatLocalDateKey(now));
  if (dates.kind !== 'valid' || !Number.isFinite(currentTime)) {
    return buildUsageSummary([]);
  }

  // 分别解析两端的本地零点，避免夏令时切换使某天多计或少计一个小时。
  const startTime = getLocalMidnight(dates.start, 0);
  const endTime = getLocalMidnight(dates.end, 1);
  return buildUsageSummary(
    summary.sessions.filter((session) => {
      const startedAt = new Date(session.startedAt).getTime();
      return startedAt >= startTime && startedAt < endTime && startedAt <= currentTime;
    })
  );
};

const buildTotals = (sessions: UsageSession[]): TokenUsage =>
  sessions.reduce<TokenUsage>((total, session) => addTokenUsage(total, session), emptyTokenUsage());

const buildDailyTotals = (sessions: UsageSession[]): UsageDay[] => {
  const days = sessions.reduce<Map<string, UsageDay>>((dailyTotals, session) => {
    const date = getLocalDateKey(session.startedAt);
    const current = dailyTotals.get(date) ?? {
      date,
      sessionCount: 0,
      ...emptyTokenUsage(),
    };

    dailyTotals.set(date, {
      ...addTokenUsage(current, session),
      date,
      sessionCount: current.sessionCount + 1,
    });

    return dailyTotals;
  }, new Map());

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const buildProjectTotals = (sessions: UsageSession[]): UsageProject[] => {
  const grandTotal = buildTotals(sessions).totalTokens;

  const projects = sessions.reduce<Map<string, UsageProject>>((projectTotals, session) => {
    const projectPath = getProjectIdentity(session.projectPath);
    const current = projectTotals.get(projectPath) ?? {
      projectPath,
      projectName: session.projectName || getProjectName(projectPath),
      sessionCount: 0,
      lastActivityAt: session.endedAt,
      shareOfTotal: 0,
      ...emptyTokenUsage(),
    };

    const lastActivityAt =
      new Date(session.endedAt).getTime() > new Date(current.lastActivityAt).getTime()
        ? session.endedAt
        : current.lastActivityAt;

    projectTotals.set(projectPath, {
      ...addTokenUsage(current, session),
      projectPath,
      projectName: current.projectName,
      sessionCount: current.sessionCount + 1,
      lastActivityAt,
      shareOfTotal: 0,
    });

    return projectTotals;
  }, new Map());

  return [...projects.values()]
    .map((project) => ({
      ...project,
      shareOfTotal: grandTotal > 0 ? project.totalTokens / grandTotal : 0,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
};
