/**
 * @file Cache efficiency aggregation tests
 * @description Verifies cache composition, daily trends, empty input, and inconsistent data.
 */

import { describe, expect, it } from 'vitest';
import { buildCacheEfficiency } from '../src/renderer/utils/cacheEfficiency';
import type { UsageDay, UsageSummary } from '../src/shared/usageTypes';

const makeDay = (date: string, inputTokens: number, cachedInputTokens: number): UsageDay => ({
  date,
  sessionCount: 1,
  inputTokens,
  cachedInputTokens,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: inputTokens,
});

const makeSummary = (
  inputTokens: number,
  cachedInputTokens: number,
  byDay: UsageDay[]
): UsageSummary => ({
  totals: {
    inputTokens,
    cachedInputTokens,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: inputTokens,
  },
  byDay,
  byProject: [],
  sessions: [],
});

describe('buildCacheEfficiency', () => {
  it('builds the overall composition and real daily cache percentages', () => {
    const efficiency = buildCacheEfficiency(
      makeSummary(1_000, 600, [makeDay('2026-08-03', 200, 0), makeDay('2026-08-04', 800, 600)])
    );

    expect(efficiency).toMatchObject({
      inputTokens: 1_000,
      cachedInputTokens: 600,
      uncachedInputTokens: 400,
      percentage: 60,
      hasInconsistentData: false,
    });
    expect(efficiency.days).toEqual([
      {
        date: '2026-08-03',
        inputTokens: 200,
        cachedInputTokens: 0,
        uncachedInputTokens: 200,
        percentage: 0,
        hasInconsistentData: false,
      },
      {
        date: '2026-08-04',
        inputTokens: 800,
        cachedInputTokens: 600,
        uncachedInputTokens: 200,
        percentage: 75,
        hasInconsistentData: false,
      },
    ]);
  });

  it('distinguishes zero cache use from an uncomputable empty input', () => {
    const noCache = buildCacheEfficiency(makeSummary(100, 0, [makeDay('2026-08-03', 100, 0)]));
    const noInput = buildCacheEfficiency(makeSummary(0, 0, [makeDay('2026-08-04', 0, 0)]));

    expect(noCache.percentage).toBe(0);
    expect(noCache.days[0]?.percentage).toBe(0);
    expect(noInput.percentage).toBeNull();
    expect(noInput.days[0]?.percentage).toBeNull();
  });

  it('keeps only the latest thirty dates without mutating the summary', () => {
    const days = Array.from({ length: 32 }, (_, index) =>
      makeDay(`2026-07-${String(index + 1).padStart(2, '0')}`, 100, index)
    );
    const summary = makeSummary(3_200, 496, days);
    Object.freeze(summary.totals);
    Object.freeze(summary.byDay);
    Object.freeze(summary.byProject);
    Object.freeze(summary.sessions);
    Object.freeze(summary);

    const efficiency = buildCacheEfficiency(summary);

    expect(efficiency.days).toHaveLength(30);
    expect(efficiency.days[0]?.date).toBe('2026-07-03');
    expect(efficiency.days.at(-1)?.date).toBe('2026-07-32');
    expect(summary.byDay).toBe(days);
  });

  it('flags inconsistent cache data while preserving recorded token counts', () => {
    const efficiency = buildCacheEfficiency(
      makeSummary(100, 120, [makeDay('2026-08-04', 100, 120)])
    );

    expect(efficiency).toMatchObject({
      inputTokens: 100,
      cachedInputTokens: 120,
      uncachedInputTokens: 0,
      percentage: 100,
      hasInconsistentData: true,
    });
    expect(efficiency.days[0]).toMatchObject({
      cachedInputTokens: 120,
      uncachedInputTokens: 0,
      percentage: 100,
      hasInconsistentData: true,
    });
  });

  it('surfaces a daily inconsistency even when aggregate totals remain valid', () => {
    const days = [
      makeDay('2026-06-01', 100, 120),
      ...Array.from({ length: 30 }, (_, index) =>
        makeDay(`2026-07-${String(index + 1).padStart(2, '0')}`, 100, 0)
      ),
    ];
    const efficiency = buildCacheEfficiency(makeSummary(3_100, 100, days));

    expect(efficiency.hasInconsistentData).toBe(true);
    expect(efficiency.days[0]?.date).toBe('2026-07-01');
  });
});
