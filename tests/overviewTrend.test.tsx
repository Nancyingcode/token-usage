import { describe, expect, it } from 'vitest';
import { buildTrendPoints } from '../src/renderer/components/Overview';
import type { UsageDay } from '../src/shared/usageTypes';

describe('buildTrendPoints', () => {
  it('maps boundaries, cost, and placement for chart points', () => {
    const points = buildTrendPoints(
      [makeDay('2026-07-14', 100), makeDay('2026-07-15', 50), makeDay('2026-07-16', 25)],
      100
    );

    expect(points.map(({ x }) => x)).toEqual([24, 292, 560]);
    expect(points.map(({ placement }) => placement)).toEqual(['left', 'center', 'right']);
    expect(points[0].y).toBe(42);
    expect(points[0].cost).toBeCloseTo(0.000135);
    expect(points[0].day.inputTokens).toBe(60);
    expect(points[0].day.outputTokens).toBe(25);
    expect(points[0].day.cachedInputTokens).toBe(15);
  });

  it('returns no points for an empty period', () => {
    expect(buildTrendPoints([], 1)).toEqual([]);
  });
});

function makeDay(date: string, totalTokens: number): UsageDay {
  return {
    date,
    inputTokens: 60,
    cachedInputTokens: 15,
    outputTokens: 25,
    reasoningOutputTokens: 10,
    totalTokens,
    sessionCount: 1,
  };
}
