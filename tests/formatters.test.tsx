import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  formatNumber,
  formatShortDateTime,
} from '../src/renderer/utils/formatters';

describe('renderer formatters', () => {
  it('formats regular and compact token values', () => {
    expect(formatNumber(1_234)).toBe('1,234');
    expect(formatCompactNumber(1_200)).toBe('1.2K');
  });

  it('returns a stable fallback for invalid dates', () => {
    expect(formatShortDateTime('not-a-date')).toBe('Unknown date');
  });
});
