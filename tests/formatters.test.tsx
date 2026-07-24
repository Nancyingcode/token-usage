import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  formatUsd,
} from '../src/renderer/utils/formatters';

describe('renderer formatters', () => {
  it('formats regular and compact token values', () => {
    expect(formatNumber(1_234, 'en')).toBe('1,234');
    expect(formatCompactNumber(1_200, 'en')).toBe('1.2K');
    expect(formatCompactNumber(12_000, 'zh-CN')).toBe('1.2万');
  });

  it('returns a stable fallback for invalid dates', () => {
    expect(formatShortDateTime('not-a-date', 'en', 'Unknown date')).toBe('Unknown date');
    expect(formatShortDateTime('not-a-date', 'zh-CN', '未知日期')).toBe('未知日期');
  });

  it('formats budget costs and actual percentages', () => {
    expect(formatUsd(12.3456, 'en')).toBe('$12.3456');
    expect(formatUsd(12.3456, 'zh-CN')).toBe('US$12.3456');
    expect(formatPercent(111.6, 'en')).toBe('112%');
  });
});
