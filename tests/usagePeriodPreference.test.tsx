import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USAGE_PERIOD,
  loadUsagePeriodPreference,
  saveUsagePeriodPreference,
  type UsagePeriodStorage,
} from '../src/renderer/utils/usagePeriodPreference';

describe('usage period preference', () => {
  it('restores every valid saved period', () => {
    const getItem = vi.fn<UsagePeriodStorage['getItem']>();
    const storage: UsagePeriodStorage = {
      getItem,
      setItem: vi.fn<UsagePeriodStorage['setItem']>(),
    };

    for (const period of ['today', 'week', 'month', 'total'] as const) {
      getItem.mockReturnValueOnce(period);
      expect(loadUsagePeriodPreference(storage)).toBe(period);
    }
  });

  it.each([null, '', 'day', 'all'])(
    'falls back to Month for missing or invalid value %s',
    (storedValue) => {
      const storage: UsagePeriodStorage = {
        getItem: vi.fn<UsagePeriodStorage['getItem']>().mockReturnValue(storedValue),
        setItem: vi.fn<UsagePeriodStorage['setItem']>(),
      };

      expect(loadUsagePeriodPreference(storage)).toBe(DEFAULT_USAGE_PERIOD);
    }
  );

  it('falls back to Month when storage cannot be read', () => {
    const storage: UsagePeriodStorage = {
      getItem: vi.fn<UsagePeriodStorage['getItem']>().mockImplementation(() => {
        throw new Error('storage unavailable');
      }),
      setItem: vi.fn<UsagePeriodStorage['setItem']>(),
    };

    expect(loadUsagePeriodPreference(storage)).toBe('month');
  });

  it('saves a selection and tolerates write failures', () => {
    const setItem = vi.fn<UsagePeriodStorage['setItem']>();
    const storage: UsagePeriodStorage = {
      getItem: vi.fn<UsagePeriodStorage['getItem']>(),
      setItem,
    };

    expect(() => saveUsagePeriodPreference('total', storage)).not.toThrow();
    expect(setItem).toHaveBeenCalledWith('codex-token-usage.usage-period', 'total');

    setItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    expect(() => saveUsagePeriodPreference('week', storage)).not.toThrow();
  });
});
