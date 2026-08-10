/**
 * @file Overview activity calendar tests
 * @description Verifies natural-week alignment, rolling-period boundaries, and activity intensity.
 */
import { describe, expect, it } from 'vitest';
import { buildActivityCells, buildActivityMonthLabels } from '../src/renderer/utils/activityGrid';
import type { UsageDay } from '../src/shared/usageTypes';

describe('buildActivityCells', () => {
  it('builds 53 complete Sunday-to-Saturday weeks around the anchor date', () => {
    const cells = buildActivityCells(
      [makeDay('2026-07-28', 50), makeDay('2026-08-02', 100)],
      'week',
      '2026-08-03'
    );

    expect(cells).toHaveLength(371);
    expect(cells[0]).toMatchObject({ date: '2025-08-03', weekIndex: 0, weekday: 0 });
    expect(cells[6]).toMatchObject({ date: '2025-08-09', weekIndex: 0, weekday: 6 });
    expect(cells[7]).toMatchObject({ date: '2025-08-10', weekIndex: 1, weekday: 0 });
    expect(cells.at(-1)).toMatchObject({
      date: '2026-08-08',
      weekIndex: 52,
      weekday: 6,
      isFuture: true,
      inPeriod: false,
    });
    expect(cells.find(({ date }) => date === '2026-07-27')?.inPeriod).toBe(false);
    expect(cells.find(({ date }) => date === '2026-07-28')?.inPeriod).toBe(true);
    expect(cells.find(({ date }) => date === '2026-08-02')).toMatchObject({
      tokens: 100,
      level: 4,
      inPeriod: true,
      isFuture: false,
    });
    expect(cells.find(({ date }) => date === '2026-08-04')).toMatchObject({
      tokens: 0,
      level: 0,
      inPeriod: false,
      isFuture: true,
    });
  });

  it('keeps zero-usage days at level zero and scales active days', () => {
    const cells = buildActivityCells(
      [makeDay('2026-08-01', 25), makeDay('2026-08-02', 100)],
      'month',
      '2026-08-03'
    );

    expect(cells.find(({ date }) => date === '2026-08-01')?.level).toBe(1);
    expect(cells.find(({ date }) => date === '2026-08-02')?.level).toBe(4);
    expect(cells.find(({ date }) => date === '2026-08-03')?.level).toBe(0);
  });

  it('keeps future and outside-period values out of the activity scale', () => {
    const cells = buildActivityCells(
      [
        makeDay('2026-07-27', 10_000),
        makeDay('2026-08-01', 25),
        makeDay('2026-08-02', 100),
        makeDay('2026-08-04', 20_000),
      ],
      'week',
      '2026-08-03'
    );

    expect(cells.find(({ date }) => date === '2026-07-27')).toMatchObject({
      level: 0,
      inPeriod: false,
      isFuture: false,
    });
    expect(cells.find(({ date }) => date === '2026-08-01')?.level).toBe(1);
    expect(cells.find(({ date }) => date === '2026-08-02')?.level).toBe(4);
    expect(cells.find(({ date }) => date === '2026-08-04')).toMatchObject({
      level: 0,
      inPeriod: false,
      isFuture: true,
    });
  });

  it('places month labels across the full GitHub-style year window', () => {
    const cells = buildActivityCells([], 'total', '2026-08-03');
    const labels = buildActivityMonthLabels(cells);

    expect(labels).toHaveLength(13);
    expect(labels[0]).toEqual({ date: '2025-08-03', weekIndex: 0 });
    expect(labels.at(-1)).toEqual({ date: '2026-08-01', weekIndex: 51 });
  });
});

const makeDay = (date: string, totalTokens: number): UsageDay => ({
  date,
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  sessionCount: 1,
});
