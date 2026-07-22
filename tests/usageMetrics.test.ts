import { describe, expect, it } from 'vitest';
import { getCachePercentage } from '../src/shared/usageMetrics';

describe('usageMetrics', () => {
  it('calculates cache percentage and handles empty input', () => {
    expect(getCachePercentage(200, 50)).toBe(25);
    expect(getCachePercentage(0, 50)).toBe(0);
  });
});
