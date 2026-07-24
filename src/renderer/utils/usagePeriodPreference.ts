/**
 * @file Usage period preference
 * @description Validates and persists the renderer-only usage period selection.
 */

import type { UsagePeriod } from '../../shared/usageTypes';

const USAGE_PERIOD_STORAGE_KEY = 'codex-token-usage.usage-period';

export const DEFAULT_USAGE_PERIOD: UsagePeriod = 'month';

export interface UsagePeriodStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const isUsagePeriod = (value: string | null): value is UsagePeriod =>
  value === 'today' || value === 'week' || value === 'month' || value === 'total';

export const loadUsagePeriodPreference = (storage: UsagePeriodStorage): UsagePeriod => {
  try {
    const storedPeriod = storage.getItem(USAGE_PERIOD_STORAGE_KEY);
    return isUsagePeriod(storedPeriod) ? storedPeriod : DEFAULT_USAGE_PERIOD;
  } catch {
    return DEFAULT_USAGE_PERIOD;
  }
};

export const saveUsagePeriodPreference = (
  period: UsagePeriod,
  storage: UsagePeriodStorage
): void => {
  try {
    storage.setItem(USAGE_PERIOD_STORAGE_KEY, period);
  } catch {
    // The current in-memory selection remains usable when persistence is unavailable.
  }
};
