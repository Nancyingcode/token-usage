/**
 * @file Overview activity calendar tests
 * @description Verifies natural-week alignment, rolling-period boundaries, and activity intensity.
 */
import { describe, expect, it } from 'vitest';
import {
  buildActivityCells,
  buildActivityMonthLabels,
  getClippedActivityRange,
} from '../src/renderer/utils/activityGrid';
import type { UsageDay } from '../src/shared/usageTypes';

describe('buildActivityCells', () => {
  it('can expand to 53 complete Sunday-to-Saturday weeks around the anchor date', () => {
    const cells = buildActivityCells(
      [makeDay('2026-07-28', 50), makeDay('2026-08-02', 100)],
      'week',
      '2026-08-03',
      true
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

  it.each([
    { period: 'today', firstDate: '2026-08-02', weeks: 1 },
    { period: 'week', firstDate: '2026-07-26', weeks: 2 },
    { period: 'month', firstDate: '2026-07-05', weeks: 5 },
    { period: 'total', firstDate: '2025-08-03', weeks: 53 },
  ] as const)('shows $weeks natural weeks for $period', ({ period, firstDate, weeks }) => {
    const cells = buildActivityCells([], period, '2026-08-03');

    expect(cells).toHaveLength(weeks * 7);
    expect(cells[0]).toMatchObject({ date: firstDate, weekIndex: 0, weekday: 0 });
    expect(cells.at(-1)).toMatchObject({
      date: '2026-08-08',
      weekIndex: weeks - 1,
      weekday: 6,
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

  it('anchors to the selected historical end week and keeps its later days outside the range', () => {
    const range = { startDate: '2026-11-01', endDate: '2026-11-15' };
    const cells = buildActivityCells(
      [makeDay('2026-11-01', 25), makeDay('2026-11-15', 100), makeDay('2026-11-16', 10_000)],
      range,
      '2026-11-26'
    );

    expect(cells).toHaveLength(21);
    expect(cells.filter(({ inPeriod }) => inPeriod)).toHaveLength(15);
    expect(cells.at(-1)).toMatchObject({ date: '2026-11-21', inPeriod: false, isFuture: false });
    expect(cells.find(({ date }) => date === '2026-11-01')?.level).toBe(1);
    expect(cells.find(({ date }) => date === '2026-11-03')).toMatchObject({
      inPeriod: true,
      tokens: 0,
      level: 0,
    });
    expect(cells.find(({ date }) => date === '2026-11-15')?.level).toBe(4);
    expect(cells.find(({ date }) => date === '2026-11-16')?.level).toBe(0);
  });

  it('keeps month boundaries, zero and outside days when switching between the same range', () => {
    const days = [
      makeDay('2026-10-30', 10_000),
      makeDay('2026-10-31', 25),
      makeDay('2026-11-03', 100),
    ];
    const range = { startDate: '2026-10-31', endDate: '2026-11-03' };
    const short = buildActivityCells(days, range, '2026-11-06');
    const full = buildActivityCells(days, range, '2026-11-06', true);

    expect(short).toHaveLength(14);
    expect(short[0]).toMatchObject({ date: '2026-10-25', weekIndex: 0 });
    expect(buildActivityMonthLabels(short)).toEqual([
      { date: '2026-10-25', weekIndex: 0 },
      { date: '2026-11-01', weekIndex: 1 },
    ]);
    expect(short.find(({ date }) => date === '2026-10-30')).toMatchObject({
      inPeriod: false,
      level: 0,
    });
    expect(short.find(({ date }) => date === '2026-11-01')).toMatchObject({
      inPeriod: true,
      level: 0,
    });
    expect(short.find(({ date }) => date === '2026-10-31')?.level).toBe(1);
    expect(short.at(-1)).toMatchObject({ date: '2026-11-07', isFuture: true });
    expect(full).toHaveLength(371);
    expect(
      full.filter(({ inPeriod }) => inPeriod).map(({ date, level }) => ({ date, level }))
    ).toEqual(short.filter(({ inPeriod }) => inPeriod).map(({ date, level }) => ({ date, level })));
  });

  it('caps the selected natural weeks at 53 and clips only dates before the visible window', () => {
    const endDate = '2026-11-27';
    const ranges = [
      { startDate: '2025-11-30', endDate },
      { startDate: '2025-11-29', endDate },
      { startDate: '2025-11-22', endDate },
    ];

    expect(ranges.map((range) => buildActivityCells([], range, endDate).length)).toEqual([
      364, 371, 371,
    ]);
    expect(getClippedActivityRange(ranges[1])).toBeUndefined();
    expect(getClippedActivityRange(ranges[2])).toEqual({ startDate: '2025-11-23', endDate });
  });

  it('marks only days after local today as future when a custom range ends today', () => {
    const today = '2026-11-26';
    const cells = buildActivityCells([], { startDate: today, endDate: today }, today);

    expect(cells.find(({ date }) => date === '2026-11-25')).toMatchObject({
      inPeriod: false,
      isFuture: false,
    });
    expect(cells.find(({ date }) => date === today)).toMatchObject({
      inPeriod: true,
      isFuture: false,
    });
    expect(cells.at(-1)).toMatchObject({
      date: '2026-11-28',
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
