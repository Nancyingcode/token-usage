import { describe, expect, it } from 'vitest';
import { addTokenUsage, buildUsageSummary, filterUsageSummary } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';

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
      makeSession('a', '2026-07-11T01:00:00.000Z', 'C:\\Users\\me\\alpha', 100),
      makeSession('b', '2026-07-11T10:00:00.000Z', 'C:\\Users\\me\\beta', 50),
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
