import type {
  RollingUsagePeriod,
  UsageDateRange,
  UsagePeriod,
  UsageScanResult,
  UsageSummary,
} from '../../shared/usageTypes';

export interface OverviewDateFilter {
  range: UsageDateRange;
  today: string;
}

export interface ResolveAppContentModelInput {
  error: string | null;
  loading: boolean;
  result: UsageScanResult | null;
  filteredSummary: UsageSummary | null;
  period: UsagePeriod;
  overviewDateFilter?: OverviewDateFilter;
}

export interface AppFreshness {
  refreshing: boolean;
  staleReason: string | null;
}

export type AppContentModel =
  | { kind: 'error'; message: string }
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'empty'; result: UsageScanResult; freshness: AppFreshness }
  | {
      kind: 'date-range-empty';
      range: UsageDateRange;
      result: UsageScanResult;
      freshness: AppFreshness;
    }
  | {
      kind: 'period-empty';
      period: RollingUsagePeriod;
      result: UsageScanResult;
      freshness: AppFreshness;
    }
  | {
      kind: 'ready';
      result: UsageScanResult;
      summary: UsageSummary;
      freshness: AppFreshness;
      overviewDateFilter?: OverviewDateFilter;
    };

export const resolveAppContentModel = ({
  error,
  loading,
  result,
  filteredSummary,
  period,
  overviewDateFilter,
}: ResolveAppContentModelInput): AppContentModel => {
  if (result && filteredSummary) {
    const freshness: AppFreshness = {
      refreshing: loading,
      staleReason: error,
    };

    if (result.summary.sessions.length === 0) {
      return { kind: 'empty', result, freshness };
    }

    if (filteredSummary.sessions.length === 0) {
      if (overviewDateFilter) {
        return { kind: 'date-range-empty', range: overviewDateFilter.range, result, freshness };
      }
      if (period !== 'total') {
        return { kind: 'period-empty', period, result, freshness };
      }
    }

    return {
      kind: 'ready',
      result,
      summary: filteredSummary,
      freshness,
      ...(overviewDateFilter ? { overviewDateFilter } : {}),
    };
  }

  if (error) {
    return { kind: 'error', message: error };
  }

  if (loading) {
    return { kind: 'loading' };
  }

  return { kind: 'idle' };
};
