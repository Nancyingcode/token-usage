import { describe, expect, it } from 'vitest';
import { selectProjectSessions } from '../src/renderer/utils/projectSessions';
import { UNKNOWN_PROJECT_KEY } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';

describe('selectProjectSessions', () => {
  it('preserves incoming order and returns a copy without a project filter', () => {
    const sessions = [
      makeSession('newer', '2026-07-24T11:00:00.000Z', 'C:\\work\\alpha', 10),
      makeSession('older', '2026-07-24T10:00:00.000Z', 'C:\\work\\beta', 20),
    ];

    const selected = selectProjectSessions(sessions, null);

    expect(selected.map(({ sessionId }) => sessionId)).toEqual(['newer', 'older']);
    expect(selected).not.toBe(sessions);
  });

  it('matches the exact project identity and keeps same-named paths separate', () => {
    const sessions = [
      makeSession('first-repo', '2026-07-24T09:00:00.000Z', 'C:\\one\\repo', 10),
      makeSession('second-repo', '2026-07-24T10:00:00.000Z', 'D:\\two\\repo', 20),
    ];

    expect(
      selectProjectSessions(sessions, 'C:\\one\\repo').map(({ sessionId }) => sessionId)
    ).toEqual(['first-repo']);
  });

  it('orders filtered sessions by tokens and then start time', () => {
    const sessions = [
      makeSession('low', '2026-07-24T12:00:00.000Z', 'C:\\work\\repo', 50),
      makeSession('high-old', '2026-07-24T09:00:00.000Z', 'C:\\work\\repo', 100),
      makeSession('high-new', '2026-07-24T11:00:00.000Z', 'C:\\work\\repo', 100),
    ];

    expect(
      selectProjectSessions(sessions, 'C:\\work\\repo').map(({ sessionId }) => sessionId)
    ).toEqual(['high-new', 'high-old', 'low']);
  });

  it('uses the shared Unknown Project identity', () => {
    const sessions = [
      makeSession('unknown', '2026-07-24T10:00:00.000Z', '', 100),
      makeSession('known', '2026-07-24T11:00:00.000Z', 'C:\\work\\repo', 200),
    ];

    expect(
      selectProjectSessions(sessions, UNKNOWN_PROJECT_KEY).map(({ sessionId }) => sessionId)
    ).toEqual(['unknown']);
  });

  it('keeps incoming order for equal tokens when either start time is invalid', () => {
    const sessions = [
      makeSession('invalid', 'not-a-date', 'C:\\work\\repo', 100),
      makeSession('valid', '2026-07-24T11:00:00.000Z', 'C:\\work\\repo', 100),
    ];

    expect(
      selectProjectSessions(sessions, 'C:\\work\\repo').map(({ sessionId }) => sessionId)
    ).toEqual(['invalid', 'valid']);
  });

  it('recomputes a retained project identity for new period or scan inputs', () => {
    const projectPath = 'C:\\work\\repo';
    const currentPeriodSessions = [
      makeSession('current', '2026-07-24T11:00:00.000Z', projectPath, 100),
    ];
    const refreshedSessions = [
      makeSession('other', '2026-07-24T12:00:00.000Z', 'C:\\work\\other', 200),
    ];

    expect(
      selectProjectSessions(currentPeriodSessions, projectPath).map(({ sessionId }) => sessionId)
    ).toEqual(['current']);
    expect(selectProjectSessions(refreshedSessions, projectPath)).toEqual([]);
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
  projectName: projectPath.split('\\').pop() || UNKNOWN_PROJECT_KEY,
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
