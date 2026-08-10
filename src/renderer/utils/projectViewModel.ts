/**
 * @file Project analytics view model
 * @description Builds immutable project chart, search, sorting, and row metrics for the renderer.
 */

import { addTokenUsage, emptyTokenUsage } from '../../shared/usageMath';
import type { TokenUsage, UsageProject } from '../../shared/usageTypes';

export type ProjectSortKey = 'tokens' | 'sessions' | 'activity' | 'name';

export interface ProjectChartEntry extends TokenUsage {
  kind: 'project' | 'other';
  projectPath?: string;
  projectName: string;
  projectCount: number;
  sessionCount: number;
  lastActivityAt: string;
}

export interface ProjectRow extends UsageProject {
  averageTokensPerSession: number;
  cacheInputRatio: number;
}

const PROJECT_CHART_VISIBLE_LIMIT = 7;
const OTHER_PROJECT_NAME = 'other';

const getTimestamp = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const getLatestActivity = (projects: readonly UsageProject[]): string =>
  projects.reduce(
    (latest, project) =>
      getTimestamp(project.lastActivityAt) > getTimestamp(latest) ? project.lastActivityAt : latest,
    ''
  );

export const buildProjectChartEntries = (
  projects: readonly UsageProject[]
): ProjectChartEntry[] => {
  const sortedProjects = [...projects].sort((a, b) => b.totalTokens - a.totalTokens);
  const visibleProjects = sortedProjects.slice(0, PROJECT_CHART_VISIBLE_LIMIT);
  const remainingProjects = sortedProjects.slice(PROJECT_CHART_VISIBLE_LIMIT);
  const entries: ProjectChartEntry[] = visibleProjects.map((project) => ({
    ...project,
    kind: 'project',
    projectCount: 1,
  }));

  if (remainingProjects.length === 0) {
    return entries;
  }

  const usage = remainingProjects.reduce<TokenUsage>(
    (total, project) => addTokenUsage(total, project),
    emptyTokenUsage()
  );

  return [
    ...entries,
    {
      ...usage,
      kind: 'other',
      projectName: OTHER_PROJECT_NAME,
      projectCount: remainingProjects.length,
      sessionCount: remainingProjects.reduce((total, project) => total + project.sessionCount, 0),
      lastActivityAt: getLatestActivity(remainingProjects),
    },
  ];
};

const compareProjects = (a: UsageProject, b: UsageProject, sortKey: ProjectSortKey): number => {
  switch (sortKey) {
    case 'sessions':
      return b.sessionCount - a.sessionCount || b.totalTokens - a.totalTokens;
    case 'activity':
      return getTimestamp(b.lastActivityAt) - getTimestamp(a.lastActivityAt);
    case 'name':
      return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: 'base' });
    case 'tokens':
      return b.totalTokens - a.totalTokens;
  }
};

export const filterAndSortProjects = (
  projects: readonly UsageProject[],
  query: string,
  sortKey: ProjectSortKey
): UsageProject[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = projects.filter((project) => {
    if (normalizedQuery.length === 0) {
      return true;
    }

    return `${project.projectName}\n${project.projectPath}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });

  return matches.sort((a, b) => compareProjects(a, b, sortKey));
};

export const buildProjectRow = (project: UsageProject): ProjectRow => ({
  ...project,
  averageTokensPerSession:
    project.sessionCount > 0 ? project.totalTokens / project.sessionCount : 0,
  cacheInputRatio: project.inputTokens > 0 ? project.cachedInputTokens / project.inputTokens : 0,
});
