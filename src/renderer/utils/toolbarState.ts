/**
 * @file Toolbar state model
 * @description Resolves period-filter capabilities and user-visible scan freshness states.
 */

import type { ViewKey } from '../components/Sidebar';

const PERIOD_FILTER_VIEWS: ReadonlySet<ViewKey> = new Set([
  'overview',
  'sessions',
  'tools',
  'performance',
  'costOptimization',
]);

export interface ToolbarScanStateInput {
  loading: boolean;
  error: string | null;
  scannedAt?: string;
}

export type ToolbarScanState = 'scanning' | 'synced' | 'stale' | 'failed' | 'waiting';

export const hasPeriodFilter = (view: ViewKey): boolean => PERIOD_FILTER_VIEWS.has(view);

export const resolveToolbarScanState = ({
  loading,
  error,
  scannedAt,
}: ToolbarScanStateInput): ToolbarScanState => {
  if (loading) {
    return 'scanning';
  }

  if (error && scannedAt) {
    return 'stale';
  }

  if (error) {
    return 'failed';
  }

  if (scannedAt) {
    return 'synced';
  }

  return 'waiting';
};
