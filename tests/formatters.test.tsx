import { describe, expect, it, vi } from 'vitest';
import type { SupportedLocale } from '../src/shared/i18n/locale';
import {
  createCalendarDateRangeFormatter,
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  formatUsd,
} from '../src/renderer/utils/formatters';

describe('renderer formatters', () => {
  it('reuses overview number formats for new values and when switching languages', () => {
    const formatOverviewValues = (locale: SupportedLocale, value: number): string[] => [
      formatNumber(value, locale),
      formatCompactNumber(value / 100, locale),
      formatCompactNumber(value, locale),
      formatUsd(value / 1_000, locale),
    ];
    expect(formatOverviewValues('en', 12_345)).toEqual(['12,345', '123', '12.3K', '$12.345']);
    expect(formatOverviewValues('zh-CN', 12_345)).toEqual(['12,345', '123', '1.2万', 'US$12.345']);

    const NumberFormatter = Intl.NumberFormat;
    const formats = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (locales, options) {
      return new NumberFormatter(locales, options);
    });
    try {
      expect(formatOverviewValues('en', 23_456)).toEqual(['23,456', '235', '23.5K', '$23.456']);
      expect(formatOverviewValues('zh-CN', 23_456)).toEqual([
        '23,456',
        '235',
        '2.3万',
        'US$23.456',
      ]);
      expect(formats).not.toHaveBeenCalled();
    } finally {
      formats.mockRestore();
    }
  });

  it('formats regular and compact token values', () => {
    expect(formatNumber(1_234, 'en')).toBe('1,234');
    expect(formatCompactNumber(1_200, 'en')).toBe('1.2K');
    expect(formatCompactNumber(12_000, 'zh-CN')).toBe('1.2万');
  });

  it('returns a stable fallback for invalid dates', () => {
    expect(formatShortDateTime('not-a-date', 'en', 'Unknown date')).toBe('Unknown date');
    expect(formatShortDateTime('not-a-date', 'zh-CN', '未知日期')).toBe('未知日期');
  });

  it('formats the complete endpoints of calendar ranges and labels a single day once', () => {
    const range = { startDate: '2025-12-31', endDate: '2026-01-02' };
    expect(createCalendarDateRangeFormatter('en')(range)).toBe(
      'December 31, 2025 – January 2, 2026'
    );
    expect(createCalendarDateRangeFormatter('zh-CN')(range)).toBe('2025年12月31日 – 2026年1月2日');
    expect(
      createCalendarDateRangeFormatter('zh-CN')({
        startDate: '2024-02-29',
        endDate: '2024-02-29',
      })
    ).toBe('2024年2月29日');
  });

  it('formats budget costs and actual percentages', () => {
    expect(formatUsd(12.3456, 'en')).toBe('$12.3456');
    expect(formatUsd(12.3456, 'zh-CN')).toBe('US$12.3456');
    expect(formatPercent(111.6, 'en')).toBe('112%');
  });
});
