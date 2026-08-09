/**
 * @file 回合错误率视图模型
 * @description 从当前筛选后的会话构建不可变的回合终态、错误趋势、分类与最近错误数据。
 */
import { getLocalDateKey } from '../../shared/usageMath';
import type { UsageSession, UsageSummary, UsageTurnOutcome } from '../../shared/usageTypes';

export type ErrorCategory =
  | 'context-limit'
  | 'usage-limit'
  | 'authentication'
  | 'network'
  | 'service'
  | 'sandbox'
  | 'request-policy'
  | 'other';

export interface ErrorRateDay {
  date: string;
  completedCount: number;
  failedCount: number;
  interruptedCount: number;
  errorRate: number | null;
}

export interface ErrorCategorySummary {
  category: ErrorCategory;
  count: number;
  percentage: number;
}

export interface RecentTurnError {
  occurredAt: string;
  sessionId: string;
  sessionLabel: string;
  projectName: string;
  category: ErrorCategory;
  rawCode?: string;
  message: string;
}

export interface ErrorRateDetail {
  completedCount: number;
  failedCount: number;
  interruptedCount: number;
  assessedCount: number;
  errorRate: number | null;
  coveredSessionCount: number;
  totalSessionCount: number;
  days: ErrorRateDay[];
  categories: ErrorCategorySummary[];
  recentErrors: RecentTurnError[];
}

interface MutableDayCounts {
  completedCount: number;
  failedCount: number;
  interruptedCount: number;
}

const PERCENT_SCALE = 100;
const ERROR_HISTORY_DAY_COUNT = 30;
const RECENT_ERROR_COUNT = 5;
const ERROR_CATEGORY_ORDER: ErrorCategory[] = [
  'context-limit',
  'usage-limit',
  'authentication',
  'network',
  'service',
  'sandbox',
  'request-policy',
  'other',
];

const ERROR_CATEGORY_BY_CODE: Record<string, ErrorCategory> = {
  context_window_exceeded: 'context-limit',
  session_budget_exceeded: 'usage-limit',
  usage_limit_exceeded: 'usage-limit',
  unauthorized: 'authentication',
  http_connection_failed: 'network',
  response_stream_connection_failed: 'network',
  response_stream_disconnected: 'network',
  response_too_many_failed_attempts: 'network',
  server_overloaded: 'service',
  internal_server_error: 'service',
  sandbox_error: 'sandbox',
  bad_request: 'request-policy',
  cyber_policy: 'request-policy',
  other: 'other',
};

const toErrorRate = (failedCount: number, completedCount: number): number | null => {
  const assessedCount = failedCount + completedCount;
  return assessedCount > 0 ? (failedCount / assessedCount) * PERCENT_SCALE : null;
};

export const getErrorCategory = (code: string | undefined): ErrorCategory =>
  code ? (ERROR_CATEGORY_BY_CODE[code] ?? 'other') : 'other';

const getSessionLabel = (session: UsageSession): string =>
  session.threadName?.trim() || session.projectName.trim() || session.sessionId;

const getTimestamp = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
};

const countOutcomes = (outcomes: UsageTurnOutcome[]): MutableDayCounts =>
  outcomes.reduce<MutableDayCounts>(
    (counts, outcome) => ({
      completedCount: counts.completedCount + (outcome.status === 'completed' ? 1 : 0),
      failedCount: counts.failedCount + (outcome.status === 'failed' ? 1 : 0),
      interruptedCount: counts.interruptedCount + (outcome.status === 'interrupted' ? 1 : 0),
    }),
    { completedCount: 0, failedCount: 0, interruptedCount: 0 }
  );

const buildDays = (outcomes: UsageTurnOutcome[]): ErrorRateDay[] => {
  const dayCounts = outcomes.reduce<Map<string, MutableDayCounts>>((days, outcome) => {
    const date = getLocalDateKey(outcome.occurredAt);
    const current = days.get(date) ?? {
      completedCount: 0,
      failedCount: 0,
      interruptedCount: 0,
    };

    days.set(date, {
      completedCount: current.completedCount + (outcome.status === 'completed' ? 1 : 0),
      failedCount: current.failedCount + (outcome.status === 'failed' ? 1 : 0),
      interruptedCount: current.interruptedCount + (outcome.status === 'interrupted' ? 1 : 0),
    });
    return days;
  }, new Map());

  return [...dayCounts.entries()]
    .map(([date, counts]) => ({
      date,
      ...counts,
      errorRate: toErrorRate(counts.failedCount, counts.completedCount),
    }))
    .sort((first, second) => first.date.localeCompare(second.date))
    .slice(-ERROR_HISTORY_DAY_COUNT);
};

const buildCategories = (failedOutcomes: UsageTurnOutcome[]): ErrorCategorySummary[] => {
  const counts = failedOutcomes.reduce<Map<ErrorCategory, number>>((categories, outcome) => {
    const category = getErrorCategory(outcome.error?.code);
    categories.set(category, (categories.get(category) ?? 0) + 1);
    return categories;
  }, new Map());

  return [...counts.entries()]
    .map(([category, count]) => ({
      category,
      count,
      percentage: (count / failedOutcomes.length) * PERCENT_SCALE,
    }))
    .sort(
      (first, second) =>
        second.count - first.count ||
        ERROR_CATEGORY_ORDER.indexOf(first.category) - ERROR_CATEGORY_ORDER.indexOf(second.category)
    );
};

const buildRecentErrors = (sessions: UsageSession[]): RecentTurnError[] =>
  sessions
    .flatMap((session) =>
      session.turnOutcomes
        .filter(({ status }) => status === 'failed')
        .map((outcome) => ({
          occurredAt: outcome.occurredAt,
          sessionId: session.sessionId,
          sessionLabel: getSessionLabel(session),
          projectName: session.projectName,
          category: getErrorCategory(outcome.error?.code),
          ...(outcome.error?.code ? { rawCode: outcome.error.code } : {}),
          message: outcome.error?.message ?? '',
        }))
    )
    .sort((first, second) => getTimestamp(second.occurredAt) - getTimestamp(first.occurredAt))
    .slice(0, RECENT_ERROR_COUNT);

export const buildErrorRateDetail = (summary: UsageSummary): ErrorRateDetail => {
  const outcomes = summary.sessions.flatMap(({ turnOutcomes }) => turnOutcomes);
  const counts = countOutcomes(outcomes);
  const assessedCount = counts.completedCount + counts.failedCount;
  const failedOutcomes = outcomes.filter(({ status }) => status === 'failed');

  return {
    ...counts,
    assessedCount,
    errorRate: toErrorRate(counts.failedCount, counts.completedCount),
    coveredSessionCount: summary.sessions.filter(({ turnOutcomes }) => turnOutcomes.length > 0)
      .length,
    totalSessionCount: summary.sessions.length,
    days: buildDays(outcomes),
    categories: buildCategories(failedOutcomes),
    recentErrors: buildRecentErrors(summary.sessions),
  };
};
