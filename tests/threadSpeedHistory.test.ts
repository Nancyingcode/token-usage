import { describe, expect, it } from 'vitest';
import { parseSessionJsonl } from '../src/main/sessionParser';
import { calculateEstimatedCost } from '../src/shared/pricing';
import { astraPricing } from './helpers/conditionalPricingFixture';

const threadId = '00000000-0000-4000-8000-000000000001';
const parentId = '00000000-0000-4000-8000-000000000002';
const rollout = `fixtures/rollout-2026-11-28T09-00-00-${threadId}.jsonl`;
const firstTime = '2026-11-28T09:00:00Z';
const secondTime = '2026-11-28T09:01:00Z';
const thirdTime = '2026-11-28T09:02:00Z';
const meta = (id: string) => ({ type: 'session_meta', payload: { id } });
const snapshot = (id: string, tier: unknown, timestamp?: string) => ({
  type: 'event_msg',
  timestamp,
  payload: {
    type: 'thread_settings_applied',
    thread_id: id,
    thread_settings: { service_tier: tier },
  },
});
const parse = (records: unknown[], sourceFile = rollout) =>
  parseSessionJsonl(sourceFile, records.map((record) => JSON.stringify(record)).join('\n'));

describe('thread speed settings in rollout history', () => {
  it.each([rollout, `${rollout}.zst`])(
    'retains only changes for the owning rollout even after inherited metadata in %s',
    (sourceFile) => {
      const session = parse(
        [
          meta(threadId),
          snapshot(threadId, 'default', firstTime),
          meta(parentId),
          snapshot(parentId, 'priority', firstTime),
          snapshot(threadId, 'default', secondTime),
          snapshot(threadId, 'priority', secondTime),
          snapshot(parentId, 'ultrafast'),
          snapshot(threadId, 'default', firstTime),
        ],
        sourceFile
      );
      expect(session.speedHistory).toEqual([
        { serviceTier: 'default', occurredAt: firstTime },
        { serviceTier: 'priority', occurredAt: secondTime },
        { serviceTier: 'default', occurredAt: firstTime },
      ]);
    }
  );

  it('uses the sole metadata identity of renamed files and excludes foreign or unowned events', () => {
    const records = [
      snapshot(parentId, 'default'),
      snapshot(threadId, 'priority', secondTime),
      snapshot('', 'ultrafast'),
    ];
    expect(
      parse([...records, meta(threadId), meta(threadId)], 'renamed.jsonl').speedHistory
    ).toEqual([{ serviceTier: 'priority', occurredAt: secondTime }]);
    expect(parse(records, 'renamed.jsonl').speedHistory).toEqual([]);
    expect(
      parse([...records, meta(threadId), meta(parentId)], 'renamed.jsonl').speedHistory
    ).toEqual([]);
  });

  it('keeps future tiers, marks unrecorded values and times, and ignores unrelated event shapes', () => {
    const session = parse([
      { type: 'turn_context', payload: { service_tier: 'priority' } },
      { type: 'response_item', payload: snapshot(threadId, 'priority').payload },
      snapshot(threadId, 'ultrafast'),
      snapshot(threadId, 'future-tier', 'invalid-date'),
      snapshot(threadId, null, secondTime),
      snapshot(threadId, '', firstTime),
      snapshot(threadId, 'priority'),
      snapshot(threadId, undefined),
    ]);
    expect(session.speedHistory).toEqual([
      { serviceTier: 'ultrafast', occurredAt: null },
      { serviceTier: 'future-tier', occurredAt: null },
      { serviceTier: null, occurredAt: secondTime },
      { serviceTier: 'priority', occurredAt: null },
      { serviceTier: null, occurredAt: null },
    ]);
  });

  it('keeps the first observed spelling and time for consecutive aliases of Fast', () => {
    const session = parse([
      snapshot(threadId, 'priority', firstTime),
      snapshot(threadId, 'fast', secondTime),
      snapshot(threadId, 'ultrafast', secondTime),
      snapshot(threadId, 'future-tier', secondTime),
      snapshot(threadId, 'fast', secondTime),
      snapshot(threadId, 'priority', thirdTime),
    ]);
    expect(session.speedHistory).toEqual([
      { serviceTier: 'priority', occurredAt: firstTime },
      { serviceTier: 'ultrafast', occurredAt: secondTime },
      { serviceTier: 'future-tier', occurredAt: secondTime },
      { serviceTier: 'fast', occurredAt: secondTime },
    ]);
  });

  it('keeps the same reference estimate before and after a late Fast setting', () => {
    const usage = {
      type: 'event_msg',
      timestamp: firstTime,
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 } },
      },
    };
    const context = {
      type: 'turn_context',
      payload: { model: astraPricing.modelId, effort: 'low' },
    };
    const nextUsage = { ...usage, timestamp: thirdTime };
    const nextContext = { ...context, payload: { ...context.payload, effort: 'ultra' } };
    const fastSession = parse([
      context,
      usage,
      snapshot(threadId, 'priority', secondTime),
      nextContext,
      nextUsage,
    ]);
    const baseline = parse([context, usage, context, nextUsage]);
    expect(fastSession.speedHistory).toEqual([{ serviceTier: 'priority', occurredAt: secondTime }]);
    expect(baseline.speedHistory).toEqual([]);
    expect(fastSession.usageSlices.map((slice) => slice.pricingContext)).toEqual(
      Array.from({ length: 2 }, () => ({
        granularity: 'request',
        mode: 'unknown',
        modeSource: 'missing',
      }))
    );
    const estimate = calculateEstimatedCost(fastSession.usageSlices, [astraPricing]);
    expect(estimate).toEqual(calculateEstimatedCost(baseline.usageSlices, [astraPricing]));
    expect(estimate.pricedCostUsd).toBeCloseTo(0.03, 8);
    expect(estimate.pricingIssues).toContain('mode-unknown');
  });
});
