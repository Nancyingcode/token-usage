import { describe, expect, it } from 'vitest';
import {
  buildProjectChartEntries,
  buildProjectRow,
  filterAndSortProjects,
} from '../src/renderer/utils/projectViewModel';
import type { UsageProject } from '../src/shared/usageTypes';

const makeProject = (
  projectName: string,
  totalTokens: number,
  overrides: Partial<UsageProject> = {}
): UsageProject => ({
  projectPath: `C:\\work\\${projectName}`,
  projectName,
  sessionCount: 2,
  lastActivityAt: '2026-08-10T08:00:00.000Z',
  inputTokens: totalTokens,
  cachedInputTokens: totalTokens / 2,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  shareOfTotal: 0,
  ...overrides,
});

describe('project view model', () => {
  it('keeps the top seven projects and combines the remainder without mutating input', () => {
    const projects = Array.from({ length: 10 }, (_, index) =>
      makeProject(`project-${index + 1}`, 1_000 - index * 50)
    );
    const snapshot = structuredClone(projects);

    const entries = buildProjectChartEntries(projects);

    expect(entries).toHaveLength(8);
    expect(entries.slice(0, 7).map(({ projectName }) => projectName)).toEqual([
      'project-1',
      'project-2',
      'project-3',
      'project-4',
      'project-5',
      'project-6',
      'project-7',
    ]);
    expect(entries[7]).toMatchObject({
      kind: 'other',
      projectName: 'other',
      projectCount: 3,
      totalTokens: 1_800,
      sessionCount: 6,
    });
    expect(projects).toEqual(snapshot);
  });

  it('searches project names and paths without case sensitivity', () => {
    const projects = [
      makeProject('Alpha', 300, { projectPath: 'C:\\clients\\Alpha' }),
      makeProject('beta', 200, { projectPath: 'D:\\ARCHIVE\\beta' }),
    ];

    expect(
      filterAndSortProjects(projects, ' alpha ', 'tokens').map(({ projectName }) => projectName)
    ).toEqual(['Alpha']);
    expect(
      filterAndSortProjects(projects, 'archive', 'tokens').map(({ projectName }) => projectName)
    ).toEqual(['beta']);
  });

  it('sorts by tokens, sessions, activity, and name using stable defaults', () => {
    const projects = [
      makeProject('charlie', 200, {
        sessionCount: 5,
        lastActivityAt: '2026-08-08T08:00:00.000Z',
      }),
      makeProject('Alpha', 300, {
        sessionCount: 1,
        lastActivityAt: '2026-08-09T08:00:00.000Z',
      }),
      makeProject('beta', 100, {
        sessionCount: 3,
        lastActivityAt: '2026-08-10T08:00:00.000Z',
      }),
    ];

    expect(
      filterAndSortProjects(projects, '', 'tokens').map(({ projectName }) => projectName)
    ).toEqual(['Alpha', 'charlie', 'beta']);
    expect(
      filterAndSortProjects(projects, '', 'sessions').map(({ projectName }) => projectName)
    ).toEqual(['charlie', 'beta', 'Alpha']);
    expect(
      filterAndSortProjects(projects, '', 'activity').map(({ projectName }) => projectName)
    ).toEqual(['beta', 'Alpha', 'charlie']);
    expect(
      filterAndSortProjects(projects, '', 'name').map(({ projectName }) => projectName)
    ).toEqual(['Alpha', 'beta', 'charlie']);
  });

  it('derives averages and cache share with zero-safe denominators', () => {
    expect(buildProjectRow(makeProject('normal', 1_000))).toMatchObject({
      averageTokensPerSession: 500,
      cacheInputRatio: 0.5,
    });
    expect(
      buildProjectRow(
        makeProject('empty', 0, {
          sessionCount: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
        })
      )
    ).toMatchObject({ averageTokensPerSession: 0, cacheInputRatio: 0 });
  });
});
