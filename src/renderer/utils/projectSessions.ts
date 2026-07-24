/**
 * @file Project session selection
 * @description Filters sessions by the shared project identity and applies drilldown ordering.
 */

import { getProjectIdentity } from '../../shared/usageMath';
import type { UsageSession } from '../../shared/usageTypes';

const compareStartTimeDescending = (left: UsageSession, right: UsageSession): number => {
  const leftTime = new Date(left.startedAt).getTime();
  const rightTime = new Date(right.startedAt).getTime();
  const hasInvalidTime = Number.isNaN(leftTime) || Number.isNaN(rightTime);

  return hasInvalidTime ? 0 : rightTime - leftTime;
};

const compareFilteredSessions = (left: UsageSession, right: UsageSession): number => {
  const tokenDifference = right.totalTokens - left.totalTokens;

  return tokenDifference === 0 ? compareStartTimeDescending(left, right) : tokenDifference;
};

export const selectProjectSessions = (
  sessions: UsageSession[],
  selectedProjectPath: string | null
): UsageSession[] => {
  if (selectedProjectPath === null) {
    return [...sessions];
  }

  return sessions
    .filter((session) => getProjectIdentity(session.projectPath) === selectedProjectPath)
    .sort(compareFilteredSessions);
};
