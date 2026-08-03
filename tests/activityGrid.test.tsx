/**
 * @file Overview activity grid tests
 * @description Verifies rolling-period boundaries and intensity levels for activity cells.
 */
import { describe, expect, it } from 'vitest';
import { buildActivityCells } from '../src/renderer/utils/activityGrid';
import type { UsageDay } from '../src/shared/usageTypes';

describe('buildActivityCells', () => {
  it('builds 84 consecutive cells ending at the anchor date', () => {
    const cells = buildActivityCells(
      [makeDay('2026-07-28', 50), makeDay('2026-08-02', 100)],
      'week',
      '2026-08-03'
    );

    expect(cells).toHaveLength(84);
    expect(cells[0].date).toBe('2026-05-12');
    expect(cells.at(-1)?.date).toBe('2026-08-03');
    expect(cells.find(({ date }) => date === '2026-07-27')?.inPeriod).toBe(false);
    expect(cells.find(({ date }) => date === '2026-07-28')?.inPeriod).toBe(true);
    expect(cells.find(({ date }) => date === '2026-08-02')).toMatchObject({
      tokens: 100,
      level: 4,
      inPeriod: true,
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
