/**
 * @file Hourly activity aggregation tests
 * @description Verifies immutable local-hour token, session, and active-day aggregation.
 */

import { describe, expect, it } from 'vitest';
import { buildHourlyActivity } from '../src/renderer/utils/hourlyActivity';
import type { UsageSession, UsageSlice } from '../src/shared/usageTypes';

const localTimestamp = (day: number, hour: number, minute = 0): string =>
  new Date(2026, 7, day, hour, minute).toISOString();

const makeSlice = (day: number, hour: number, totalTokens: number): UsageSlice => ({
  occurredAt: localTimestamp(day, hour),
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
});

const makeSession = (
  sessionId: string,
  startedAt: string,
  totalTokens: number,
  usageSlices: UsageSlice[] = []
): UsageSession => ({
  sessionId,
  startedAt,
  endedAt: startedAt,
  projectPath: 'C:\\repo',
  projectName: 'repo',
  turnOutcomes: [],
  usageSlices,
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  eventCount: usageSlices.length,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});

describe('buildHourlyActivity', () => {
  it('builds 24 local-hour buckets from usage slices with exact shares', () => {
    const sessions = [
      makeSession('morning', localTimestamp(1, 8), 100, [makeSlice(1, 8, 100)]),
      makeSession('afternoon', localTimestamp(1, 14), 300, [makeSlice(1, 14, 300)]),
    ];

    const activity = buildHourlyActivity(sessions);

    expect(activity.hours).toHaveLength(24);
    expect(activity.hours[8]).toEqual({
      hour: 8,
      totalTokens: 100,
      shareOfTotal: 25,
      sessionCount: 1,
      activeDayCount: 1,
    });
    expect(activity.hours[14]).toEqual({
      hour: 14,
      totalTokens: 300,
      shareOfTotal: 75,
      sessionCount: 1,
      activeDayCount: 1,
    });
    expect(activity.allocatedTokens).toBe(400);
    expect(activity.unallocatedTokens).toBe(0);
    expect(activity.peakHour?.hour).toBe(14);
  });

  it('splits cross-hour slices and deduplicates sessions and local active days per hour', () => {
    const sessions = [
      makeSession('cross-hour', localTimestamp(1, 22), 180, [
        makeSlice(1, 22, 50),
        makeSlice(1, 23, 60),
        makeSlice(2, 23, 70),
      ]),
      makeSession('second', localTimestamp(2, 23), 20, [makeSlice(2, 23, 20)]),
    ];

    const activity = buildHourlyActivity(sessions);

    expect(activity.hours[22]).toMatchObject({
      totalTokens: 50,
      sessionCount: 1,
      activeDayCount: 1,
    });
    expect(activity.hours[23]).toMatchObject({
      totalTokens: 150,
      sessionCount: 2,
      activeDayCount: 2,
    });
  });

  it('falls back to session start time when no usable slices exist', () => {
    const session = makeSession('fallback', localTimestamp(3, 6), 120);

    const activity = buildHourlyActivity([session]);

    expect(activity.hours[6]).toMatchObject({
      totalTokens: 120,
      sessionCount: 1,
      activeDayCount: 1,
    });
    expect(activity.peakHour?.hour).toBe(6);
  });

  it('reports tokens with invalid timestamps as unallocated instead of assigning midnight', () => {
    const session = makeSession('invalid', 'not-a-date', 90, [
      { ...makeSlice(1, 4, 90), occurredAt: 'also-not-a-date' },
    ]);

    const activity = buildHourlyActivity([session]);

    expect(activity.allocatedTokens).toBe(0);
    expect(activity.unallocatedTokens).toBe(90);
    expect(activity.peakHour).toBeNull();
    expect(activity.hours.every(({ totalTokens }) => totalTokens === 0)).toBe(true);
  });

  it('uses session count, active days, then earliest hour to resolve peak ties', () => {
    const sessions = [
      makeSession('hour-5-a', localTimestamp(1, 5), 50, [makeSlice(1, 5, 50)]),
      makeSession('hour-5-b', localTimestamp(2, 5), 50, [makeSlice(2, 5, 50)]),
      makeSession('hour-6-a', localTimestamp(1, 6), 100, [makeSlice(1, 6, 100)]),
    ];

    expect(buildHourlyActivity(sessions).peakHour?.hour).toBe(5);

    const exactTie = [
      makeSession('hour-3', localTimestamp(1, 3), 100, [makeSlice(1, 3, 100)]),
      makeSession('hour-4', localTimestamp(1, 4), 100, [makeSlice(1, 4, 100)]),
    ];

    expect(buildHourlyActivity(exactTie).peakHour?.hour).toBe(3);
  });

  it('returns no peak for zero-token activity and does not mutate input', () => {
    const sessions = [makeSession('empty', localTimestamp(1, 10), 0)];
    const snapshot = structuredClone(sessions);

    const activity = buildHourlyActivity(sessions);

    expect(activity.peakHour).toBeNull();
    expect(activity.allocatedTokens).toBe(0);
    expect(sessions).toEqual(snapshot);
  });
});
