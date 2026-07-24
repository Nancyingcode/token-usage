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

export type AppContentModel =
  | { kind: 'error'; message: string }
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'empty'; result: UsageScanResult }
  | { kind: 'period-empty'; period: RollingUsagePeriod }
  | {
      kind: 'ready';
      result: UsageScanResult;
      summary: UsageSummary;
    };

export const resolveAppContentModel = ({
  error,
  loading,
  result,
  filteredSummary,
  period,
}: ResolveAppContentModelInput): AppContentModel => {
  if (error) {
    return { kind: 'error', message: error };
  }

  if (loading) {
    return { kind: 'loading' };
  }

  if (!result || !filteredSummary) {
    return { kind: 'idle' };
  }

  if (result.summary.sessions.length === 0) {
    return { kind: 'empty', result };
  }

  if (filteredSummary.sessions.length === 0 && period !== 'total') {
    return { kind: 'period-empty', period };
  }

  return { kind: 'ready', result, summary: filteredSummary };
};
