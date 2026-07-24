/**
 * @file Usage aggregation and project identity
 * @description Aggregates token usage and defines the shared identity rules for projects.
 */

import type {
  RollingUsagePeriod,
  TokenUsage,
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

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAY_COUNTS[period] - 1));
  const startTime = start.getTime();

  return buildUsageSummary(
    summary.sessions.filter((session) => {
      const startedAt = new Date(session.startedAt).getTime();
      return !Number.isNaN(startedAt) && startedAt >= startTime && startedAt <= endTime;
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
