import type {
  RollingUsagePeriod,
  UsagePeriod,
  UsageScanResult,
  UsageSummary,
} from '../../shared/usageTypes';

export interface ResolveAppContentModelInput {
  error: string | null;
  loading: boolean;
  result: UsageScanResult | null;
  filteredSummary: UsageSummary | null;
  period: UsagePeriod;
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
    };

export const resolveAppContentModel = ({
  error,
  loading,
  result,
  filteredSummary,
  period,
}: ResolveAppContentModelInput): AppContentModel => {
  if (result && filteredSummary) {
    const freshness: AppFreshness = {
      refreshing: loading,
      staleReason: error,
    };

    if (result.summary.sessions.length === 0) {
      return { kind: 'empty', result, freshness };
    }

    if (filteredSummary.sessions.length === 0 && period !== 'total') {
      return { kind: 'period-empty', period, result, freshness };
    }

    return { kind: 'ready', result, summary: filteredSummary, freshness };
  }

  if (error) {
    return { kind: 'error', message: error };
  }

  if (loading) {
    return { kind: 'loading' };
  }

  return { kind: 'idle' };
};
