/**
 * @file 会话列表筛选与分页
 * @description 以无副作用方式组合会话、项目和主要诊断条件，并计算客户端分页边界。
 */

import type {
  SessionDiagnosisCause,
  SessionDiagnosisSeverity,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { getProjectIdentity } from '../../shared/usageMath';
import type { UsageSession } from '../../shared/usageTypes';
import type { SessionPageSize } from './sessionPageSizePreference';
import { selectProjectSessions } from './projectSessions';

export type SessionDiagnosisCauseFilter = SessionDiagnosisCause | 'all' | 'none';

export interface SessionListFilters {
  query: string;
  projectPath: string | null;
  cause: SessionDiagnosisCauseFilter;
  severity: SessionDiagnosisSeverity | 'all';
}

export interface FilterSessionListInput {
  sessions: UsageSession[];
  diagnostics: SessionDiagnosisSummary[];
  filters: SessionListFilters;
}

export interface SessionProjectOption {
  projectPath: string;
  projectName: string;
}

export interface PaginatedSessionList {
  items: UsageSession[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  rangeStart: number;
  rangeEnd: number;
}

const normalizeSearchValue = (value: string): string => value.trim().toLocaleLowerCase('en-US');

const matchesQuery = (session: UsageSession, query: string): boolean => {
  if (!query) {
    return true;
  }

  return [session.threadName ?? '', session.sessionId, session.projectPath].some((value) =>
    normalizeSearchValue(value).includes(query)
  );
};

const matchesCause = (
  diagnosis: SessionDiagnosisSummary | undefined,
  cause: SessionDiagnosisCauseFilter
): boolean => {
  if (cause === 'all') {
    return true;
  }

  if (cause === 'none') {
    return diagnosis?.primaryFinding === undefined;
  }

  return diagnosis?.primaryFinding?.cause === cause;
};

export const filterSessionList = ({
  sessions,
  diagnostics,
  filters,
}: FilterSessionListInput): UsageSession[] => {
  const normalizedQuery = normalizeSearchValue(filters.query);
  const diagnosisBySource = new Map(
    diagnostics.map((diagnosis) => [diagnosis.sourceFile, diagnosis])
  );

  return selectProjectSessions(sessions, filters.projectPath).filter((session) => {
    const diagnosis = diagnosisBySource.get(session.sourceFile);

    return (
      matchesQuery(session, normalizedQuery) &&
      matchesCause(diagnosis, filters.cause) &&
      (filters.severity === 'all' || diagnosis?.primaryFinding?.severity === filters.severity)
    );
  });
};

export const getSessionProjectOptions = (sessions: UsageSession[]): SessionProjectOption[] => {
  const options = sessions.reduce<Map<string, SessionProjectOption>>((result, session) => {
    const projectPath = getProjectIdentity(session.projectPath);

    if (!result.has(projectPath)) {
      result.set(projectPath, {
        projectPath,
        projectName: session.projectName || projectPath,
      });
    }

    return result;
  }, new Map());

  return [...options.values()].sort(
    (first, second) =>
      first.projectName.localeCompare(second.projectName) ||
      first.projectPath.localeCompare(second.projectPath)
  );
};

export const paginateSessionList = (
  sessions: UsageSession[],
  requestedPage: number,
  pageSize: SessionPageSize
): PaginatedSessionList => {
  const totalItems = sessions.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const normalizedRequestedPage = Number.isFinite(requestedPage)
    ? Math.max(1, Math.floor(requestedPage))
    : 1;
  const currentPage = Math.min(normalizedRequestedPage, totalPages);
  const firstItemIndex = (currentPage - 1) * pageSize;
  const items = sessions.slice(firstItemIndex, firstItemIndex + pageSize);

  return {
    items,
    currentPage,
    totalPages,
    totalItems,
    rangeStart: totalItems === 0 ? 0 : firstItemIndex + 1,
    rangeEnd: totalItems === 0 ? 0 : firstItemIndex + items.length,
  };
};
