import { describe, expect, it } from 'vitest';
import { getCachePercentage, getCachePercentageOrNull } from '../src/shared/usageMetrics';

describe('usageMetrics', () => {
  it('calculates cache percentage and handles empty input', () => {
    expect(getCachePercentage(200, 50)).toBe(25);
    expect(getCachePercentage(0, 50)).toBe(0);
  });

  it('preserves an uncomputable state and clamps inconsistent percentages', () => {
    expect(getCachePercentageOrNull(0, 0)).toBeNull();
    expect(getCachePercentageOrNull(100, 120)).toBe(100);
  });
});
