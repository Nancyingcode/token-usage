import { describe, expect, it } from 'vitest';
import {
  filterSessionList,
  getSessionProjectOptions,
  paginateSessionList,
  type SessionListFilters,
} from '../src/renderer/utils/sessionListFilters';
import type { UsageSession } from '../src/shared/usageTypes';
import { makeDiagnosisSummary, makeFindingSummary } from './helpers/sessionDiagnosisFixtures';

const makeSession = (
  sessionId: string,
  projectPath: string,
  overrides: Partial<UsageSession> = {}
): UsageSession => ({
  sessionId,
  threadName: overrides.threadName ?? `${sessionId} thread`,
  startedAt: overrides.startedAt ?? '2026-08-11T10:00:00.000Z',
  endedAt: overrides.endedAt ?? '2026-08-11T10:10:00.000Z',
  projectPath,
  projectName: overrides.projectName ?? projectPath.split('\\').pop() ?? projectPath,
  turnOutcomes: [],
  usageSlices: [],
  inputTokens: overrides.inputTokens ?? 100,
  cachedInputTokens: overrides.cachedInputTokens ?? 20,
  outputTokens: overrides.outputTokens ?? 30,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 5,
  totalTokens: overrides.totalTokens ?? 130,
  eventCount: overrides.eventCount ?? 1,
  sourceFile: overrides.sourceFile ?? `${sessionId}.jsonl`,
  warnings: overrides.warnings ?? [],
});

const DEFAULT_FILTERS: SessionListFilters = {
  query: '',
  projectPath: null,
  cause: 'all',
  severity: 'all',
};

describe('session list filters', () => {
  const inputGrowth = makeSession('input-session', 'C:\\Alpha', {
    threadName: 'Growing Context',
    sourceFile: 'input.jsonl',
  });
  const cache = makeSession('cache-session', 'C:\\Beta', {
    threadName: 'Cache investigation',
    sourceFile: 'cache.jsonl',
  });
  const unresolved = makeSession('plain-session', 'C:\\Beta', {
    sourceFile: 'plain.jsonl',
  });
  const sessions = [inputGrowth, cache, unresolved];
  const diagnostics = [
    makeDiagnosisSummary('input-session', {
      sourceFile: 'input.jsonl',
      primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
    }),
    makeDiagnosisSummary('cache-session', {
      sourceFile: 'cache.jsonl',
      primaryFinding: makeFindingSummary('cache-degradation', 'warning', 'medium'),
    }),
  ];

  it.each([
    ['thread name', 'growing', ['input-session']],
    ['complete session id', 'CACHE-SESSION', ['cache-session']],
    ['project path', 'c:\\beta', ['cache-session', 'plain-session']],
  ])('matches a normalized query against %s', (_label, query, expectedIds) => {
    expect(
      filterSessionList({
        sessions,
        diagnostics,
        filters: { ...DEFAULT_FILTERS, query },
      }).map(({ sessionId }) => sessionId)
    ).toEqual(expectedIds);
  });

  it('combines project, primary cause and severity filters', () => {
    expect(
      filterSessionList({
        sessions,
        diagnostics,
        filters: {
          ...DEFAULT_FILTERS,
          projectPath: 'C:\\Beta',
          cause: 'cache-degradation',
          severity: 'warning',
        },
      }).map(({ sessionId }) => sessionId)
    ).toEqual(['cache-session']);
  });

  it('treats missing summaries and summaries without a primary finding as unresolved', () => {
    expect(
      filterSessionList({
        sessions,
        diagnostics: [
          ...diagnostics,
          makeDiagnosisSummary('plain-session', {
            sourceFile: 'plain.jsonl',
            primaryFinding: undefined,
          }),
        ],
        filters: { ...DEFAULT_FILTERS, cause: 'none' },
      }).map(({ sessionId }) => sessionId)
    ).toEqual(['plain-session']);
  });

  it('does not match unresolved sessions to a concrete severity', () => {
    expect(
      filterSessionList({
        sessions: [unresolved],
        diagnostics: [],
        filters: { ...DEFAULT_FILTERS, severity: 'critical' },
      })
    ).toEqual([]);
  });

  it('keeps the existing project drilldown ordering without mutating inputs', () => {
    const lower = makeSession('lower', 'C:\\Alpha', { totalTokens: 10 });
    const higher = makeSession('higher', 'C:\\Alpha', { totalTokens: 20 });
    const input = [lower, higher];
    const snapshot = [...input];

    expect(
      filterSessionList({
        sessions: input,
        diagnostics: [],
        filters: { ...DEFAULT_FILTERS, projectPath: 'C:\\Alpha' },
      }).map(({ sessionId }) => sessionId)
    ).toEqual(['higher', 'lower']);
    expect(input).toEqual(snapshot);
  });

  it('derives unique, stably sorted project options', () => {
    expect(
      getSessionProjectOptions([
        makeSession('beta', 'C:\\Beta'),
        makeSession('alpha-z', 'D:\\Alpha', { projectName: 'Alpha' }),
        makeSession('alpha-c', 'C:\\Alpha', { projectName: 'Alpha' }),
        makeSession('duplicate', 'C:\\Beta'),
      ])
    ).toEqual([
      { projectPath: 'C:\\Alpha', projectName: 'Alpha' },
      { projectPath: 'D:\\Alpha', projectName: 'Alpha' },
      { projectPath: 'C:\\Beta', projectName: 'Beta' },
    ]);
  });
});

describe('session list pagination', () => {
  const sessions = Array.from({ length: 23 }, (_, index) =>
    makeSession(`session-${index + 1}`, 'C:\\repo')
  );

  it('returns the requested page and one-based visible result range', () => {
    const result = paginateSessionList(sessions, 2, 10);

    expect(result.items.map(({ sessionId }) => sessionId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `session-${index + 11}`)
    );
    expect(result).toMatchObject({
      currentPage: 2,
      totalPages: 3,
      totalItems: 23,
      rangeStart: 11,
      rangeEnd: 20,
    });
  });

  it('clamps a page beyond the final page', () => {
    expect(paginateSessionList(sessions, 99, 10)).toMatchObject({
      currentPage: 3,
      totalPages: 3,
      rangeStart: 21,
      rangeEnd: 23,
    });
  });

  it('uses page one and a zero range for an empty result', () => {
    expect(paginateSessionList([], 4, 10)).toEqual({
      items: [],
      currentPage: 1,
      totalPages: 1,
      totalItems: 0,
      rangeStart: 0,
      rangeEnd: 0,
    });
  });
});
