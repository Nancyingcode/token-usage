import { describe, expect, it } from 'vitest';
import { estimateTokenCost, getCachePercentage } from '../src/shared/usageMetrics';

describe('usageMetrics', () => {
  it('estimates cost from total tokens', () => {
    expect(estimateTokenCost(1_000_000)).toBe(1.35);
  });

  it('calculates cache percentage and handles empty input', () => {
    expect(getCachePercentage(200, 50)).toBe(25);
    expect(getCachePercentage(0, 50)).toBe(0);
  });
});
