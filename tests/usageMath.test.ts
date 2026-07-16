import { describe, expect, it } from 'vitest';
import { addTokenUsage, buildUsageSummary } from '../src/shared/usageMath';
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
});

function makeSession(
  sessionId: string,
  startedAt: string,
  projectPath: string,
  totalTokens: number
): UsageSession {
  return {
    sessionId,
    startedAt,
    endedAt: startedAt,
    projectPath,
    projectName: projectPath.split('\\').pop() ?? projectPath,
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
    eventCount: 1,
    sourceFile: `${sessionId}.jsonl`,
    warnings: [],
  };
}
