/**
 * @file Toolbar state tests
 * @description Verifies period-filter capabilities and scan-state precedence.
 */

import { describe, expect, it } from 'vitest';

import { hasPeriodFilter, resolveToolbarScanState } from '../src/renderer/utils/toolbarState';

describe('toolbar state', () => {
  it('shows period filters only on views that consume UsagePeriod', () => {
    expect(hasPeriodFilter('overview')).toBe(true);
    expect(hasPeriodFilter('sessions')).toBe(true);
    expect(hasPeriodFilter('tools')).toBe(true);
    expect(hasPeriodFilter('performance')).toBe(true);
    expect(hasPeriodFilter('costOptimization')).toBe(true);
    expect(hasPeriodFilter('budgets')).toBe(false);
    expect(hasPeriodFilter('wrapped')).toBe(false);
  });

  it('reports stale when a previous scan exists and refresh fails', () => {
    expect(
      resolveToolbarScanState({
        loading: false,
        error: 'Disk unavailable',
        scannedAt: '2026-08-03',
      })
    ).toBe('stale');
  });

  it('reports failed when the initial scan fails without previous data', () => {
    expect(resolveToolbarScanState({ loading: false, error: 'Disk unavailable' })).toBe('failed');
  });

  it('distinguishes scanning, synced, and waiting states', () => {
    expect(resolveToolbarScanState({ loading: true, error: null })).toBe('scanning');
    expect(resolveToolbarScanState({ loading: false, error: null, scannedAt: '2026-08-03' })).toBe(
      'synced'
    );
    expect(resolveToolbarScanState({ loading: false, error: null })).toBe('waiting');
  });
});
