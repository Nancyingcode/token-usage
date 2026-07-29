import { describe, expect, it } from 'vitest';
import { getRobustScore, median, medianAbsoluteDeviation } from '../src/shared/robustStatistics';

describe('robust statistics', () => {
  it('calculates median and MAD without mutating input', () => {
    const values = [9, 1, 5, 3];

    expect(median(values)).toBe(4);
    expect(medianAbsoluteDeviation(values, 4)).toBe(2);
    expect(values).toEqual([9, 1, 5, 3]);
  });

  it('uses the configured zero-MAD scale', () => {
    expect(
      getRobustScore(20, [10, 10, 10], {
        zeroMadRelativeScale: 0.25,
        zeroMadAbsoluteScale: 1,
      })
    ).toEqual({
      median: 10,
      mad: 0,
      scale: 2.5,
      score: 4,
      ratio: 2,
    });
  });
});
