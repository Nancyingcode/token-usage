import { describe, expect, it } from 'vitest';
import {
  addTokenUsage,
  buildUsageSummary,
  filterUsageSummary,
  filterUsageSummaryByDateRange,
  getInitialUsageDateRange,
  getLocalDateKey,
  getUsageDateRangeIssue,
  UNKNOWN_PROJECT_KEY,
} from '../src/shared/usageMath';
import type { UsagePeriod, UsageSession } from '../src/shared/usageTypes';

describe('usageMath', () => {
  it('adds all token fields', () => {
    expect(
      addTokenUsage(
        {
          inputTokens: 10,
          cachedInputTokens: 2,
          outputTokens: 3,
          reasoningOutputTokens: 1,
          totalTokens: 13,
        },
        {
          inputTokens: 5,
          cachedInputTokens: 1,
          outputTokens: 7,
          reasoningOutputTokens: 2,
          totalTokens: 12,
        }
      )
    ).toEqual({
      inputTokens: 15,
      cachedInputTokens: 3,
      outputTokens: 10,
      reasoningOutputTokens: 3,
      totalTokens: 25,
    });
  });

  it('groups sessions by local day and project', () => {
    const sessions: UsageSession[] = [
      makeSession('a', new Date(2026, 6, 11, 1).toISOString(), 'C:\\Users\\me\\alpha', 100),
      makeSession('b', new Date(2026, 6, 11, 10).toISOString(), 'C:\\Users\\me\\beta', 50),
    ];

    const summary = buildUsageSummary(sessions);

    expect(summary.totals.totalTokens).toBe(150);
    expect(summary.byDay.length).toBe(1);
    expect(summary.byProject.map((project) => project.projectName)).toEqual(['alpha', 'beta']);
  });

  it('filters today, week, and month as rolling local calendar days', () => {
    const now = new Date(2026, 6, 16, 15, 30, 0, 0);
    const sessions = [
      makeSession('today', localDaysAgo(now, 0, 10), 'C:\\repo\\today', 10),
      makeSession('six-days', localDaysAgo(now, 6, 0), 'C:\\repo\\week', 20),
      makeSession('seven-days', localDaysAgo(now, 7, 12), 'C:\\repo\\month', 30),
      makeSession('twenty-nine-days', localDaysAgo(now, 29, 0), 'C:\\repo\\month', 40),
      makeSession('thirty-days', localDaysAgo(now, 30, 12), 'C:\\repo\\old', 50),
    ];
    const summary = buildUsageSummary(sessions);

    expect(
      filterUsageSummary(summary, 'today', now).sessions.map(({ sessionId }) => sessionId)
    ).toEqual(['today']);
    expect(
      filterUsageSummary(summary, 'week', now).sessions.map(({ sessionId }) => sessionId)
    ).toEqual(['today', 'six-days']);
    expect(
      filterUsageSummary(summary, 'month', now).sessions.map(({ sessionId }) => sessionId)
    ).toEqual(['today', 'six-days', 'seven-days', 'twenty-nine-days']);
  });

  it('excludes future and invalid sessions and rebuilds every summary group', () => {
    const now = new Date(2026, 6, 16, 15, 30, 0, 0);
    const sessions = [
      makeSession('valid-a', localDaysAgo(now, 1, 9), 'C:\\repo\\alpha', 25),
      makeSession('valid-b', localDaysAgo(now, 2, 9), 'C:\\repo\\beta', 75),
      makeSession('future', new Date(now.getTime() + 1).toISOString(), 'C:\\repo\\future', 200),
      makeSession('invalid', 'not-a-date', 'C:\\repo\\invalid', 300),
    ];

    const filtered = filterUsageSummary(buildUsageSummary(sessions), 'week', now);

    expect(filtered.totals.totalTokens).toBe(100);
    expect(filtered.sessions.map(({ sessionId }) => sessionId)).toEqual(['valid-a', 'valid-b']);
    expect(filtered.byDay).toHaveLength(2);
    expect(filtered.byProject.map(({ projectName }) => projectName)).toEqual(['beta', 'alpha']);
  });

  it('returns the complete summary for total without applying time validation', () => {
    const now = new Date(2026, 6, 16, 15, 30, 0, 0);
    const sessions = [
      makeSession('old', localDaysAgo(now, 365, 9), 'C:\\repo\\old', 10),
      makeSession(
        'future',
        new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
        'C:\\repo\\future',
        20
      ),
      makeSession('invalid', 'not-a-date', 'C:\\repo\\invalid', 30),
    ];
    const summary = buildUsageSummary(sessions);

    const filtered = filterUsageSummary(summary, 'total' as UsagePeriod, now);

    expect(filtered).toBe(summary);
    expect(filtered.sessions).toHaveLength(3);
    expect(filtered.totals.totalTokens).toBe(60);
  });

  it.each([
    ['', '2026-11-15', 'required'],
    ['2026-02-29', '2026-03-01', 'invalid'],
    ['2026-11-1', '2026-11-15', 'invalid'],
    ['0000-11-01', '2026-11-15', 'invalid'],
    ['2026-11-16', '2026-11-15', 'reversed'],
    ['2026-11-15', '2026-11-27', 'future'],
    ['2024-02-29', '2024-02-29', null],
  ] as const)('validates the calendar dates %s to %s', (startDate, endDate, issue) => {
    expect(getUsageDateRangeIssue({ startDate, endDate }, '2026-11-26')).toBe(issue);
  });

  it('prefills the shared preset or the earliest valid history date for Total', () => {
    const now = new Date(2026, 0, 3, 12);
    const history = buildUsageSummary([
      makeSession('invalid', 'invalid', '', 1),
      makeSession('new', localDaysAgo(now, 2, 8), '', 1),
      makeSession('oldest', localDaysAgo(now, 90, 8), '', 1),
      makeSession('future', localDaysAgo(now, -2, 8), '', 1),
    ]);

    expect(getInitialUsageDateRange('today', history.byDay, now)).toEqual({
      startDate: '2026-01-03',
      endDate: '2026-01-03',
    });
    expect(getInitialUsageDateRange('week', history.byDay, now)).toEqual({
      startDate: '2025-12-28',
      endDate: '2026-01-03',
    });
    expect(getInitialUsageDateRange('month', history.byDay, now)).toEqual({
      startDate: '2025-12-05',
      endDate: '2026-01-03',
    });
    expect(getInitialUsageDateRange('total', history.byDay, now)).toEqual({
      startDate: getLocalDateKey(localDaysAgo(now, 90, 8)),
      endDate: '2026-01-03',
    });
    expect(getInitialUsageDateRange('total', [], now)).toEqual({
      startDate: '2026-01-03',
      endDate: '2026-01-03',
    });
  });

  it('includes both edges of a single leap day and rebuilds days, projects and totals', () => {
    const midnight = new Date(2024, 1, 29);
    const nextMidnight = new Date(2024, 2, 1);
    const summary = buildUsageSummary([
      makeSession('previous', new Date(midnight.getTime() - 1).toISOString(), 'other', 10),
      makeSession('first', midnight.toISOString(), 'alpha', 20),
      makeSession('last', new Date(nextMidnight.getTime() - 1).toISOString(), 'alpha', 30),
      makeSession('next', nextMidnight.toISOString(), 'other', 40),
      makeSession('invalid', 'invalid', 'other', 50),
    ]);
    const range = { startDate: '2024-02-29', endDate: '2024-02-29' };
    const filtered = filterUsageSummaryByDateRange(summary, range, nextMidnight);

    expect(filtered.sessions.map(({ sessionId }) => sessionId)).toEqual(['last', 'first']);
    expect(filtered.totals.totalTokens).toBe(50);
    expect(filtered.byDay).toMatchObject([{ date: '2024-02-29', totalTokens: 50 }]);
    expect(filtered.byProject).toMatchObject([{ projectName: 'alpha', sessionCount: 2 }]);
    expect(summary.sessions).toHaveLength(5);
  });

  it('includes the current time and excludes later sessions on the final day across years', () => {
    const now = new Date(2026, 0, 1, 12);
    const summary = buildUsageSummary([
      makeSession('outside', localDaysAgo(now, 2, 23), 'test', 1),
      makeSession('start', localDaysAgo(now, 1, 0), 'test', 2),
      makeSession('now', now.toISOString(), 'test', 3),
      makeSession('future', new Date(now.getTime() + 1).toISOString(), 'test', 4),
    ]);
    const filtered = filterUsageSummaryByDateRange(
      summary,
      { startDate: '2025-12-31', endDate: '2026-01-01' },
      now
    );

    expect(filtered.sessions.map(({ sessionId }) => sessionId)).toEqual(['now', 'start']);
    expect(filtered.byDay.map(({ date }) => date)).toEqual(['2025-12-31', '2026-01-01']);
  });

  it.each([
    ['2026-03-08', new Date(2026, 2, 8), new Date(2026, 2, 9)],
    ['2026-11-01', new Date(2026, 10, 1), new Date(2026, 10, 2)],
  ] as const)(
    'uses adjacent local midnights on %s even when the offset changes',
    (date, start, end) => {
      const summary = buildUsageSummary([
        makeSession('start', start.toISOString(), 'test', 1),
        makeSession('last', new Date(end.getTime() - 1).toISOString(), 'test', 2),
        makeSession('next', end.toISOString(), 'test', 4),
      ]);
      const filtered = filterUsageSummaryByDateRange(
        summary,
        { startDate: date, endDate: date },
        end
      );

      expect(filtered.sessions.map(({ sessionId }) => sessionId)).toEqual(['last', 'start']);
      expect(filtered.byDay).toMatchObject([{ date, totalTokens: 3 }]);
    }
  );

  it('uses the shared identity for an empty project path', () => {
    const summary = buildUsageSummary([
      makeSession('unknown', '2026-07-24T10:00:00.000Z', '', 100),
    ]);

    expect(summary.byProject).toHaveLength(1);
    expect(summary.byProject[0].projectPath).toBe(UNKNOWN_PROJECT_KEY);
    expect(summary.byProject[0].projectName).toBe(UNKNOWN_PROJECT_KEY);
  });
});

const makeSession = (
  sessionId: string,
  startedAt: string,
  projectPath: string,
  totalTokens: number
): UsageSession => ({
  sessionId,
  startedAt,
  endedAt: startedAt,
  projectPath,
  projectName: projectPath.split('\\').pop() ?? projectPath,
  turnOutcomes: [],
  usageSlices: [],
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  eventCount: 1,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});

const localDaysAgo = (now: Date, days: number, hour: number): string => {
  const timestamp = new Date(now);
  timestamp.setDate(timestamp.getDate() - days);
  timestamp.setHours(hour, 0, 0, 0);
  return timestamp.toISOString();
};
