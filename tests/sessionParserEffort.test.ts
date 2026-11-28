import { describe, expect, it } from 'vitest';
import { parseSessionJsonl } from '../src/main/sessionParser';

const context = (turnId?: string, effort?: unknown, model?: unknown) => ({
  type: 'turn_context',
  payload: { turn_id: turnId, effort, model },
});
const event = (type: string, turnId?: string, info?: unknown) => ({
  type: 'event_msg',
  payload: { type, turn_id: turnId, info },
});
const increment = (total?: number, reasoning?: number, turnId?: string) =>
  event('token_count', turnId, {
    last_token_usage: { total_tokens: total, reasoning_output_tokens: reasoning },
  });
const aggregate = (total: number, reasoning?: number) =>
  event('token_count', undefined, {
    total_token_usage: { total_tokens: total, reasoning_output_tokens: reasoning },
  });
const parse = (...records: unknown[]) =>
  parseSessionJsonl('synthetic.jsonl', records.map((record) => JSON.stringify(record)).join('\n'));
const row = (
  effort: string | null,
  turnCount: number,
  totalTokens: number | null,
  reasoningOutputTokens: number | null,
  modelId: string | null = null
) => ({ modelId, effort, turnCount, totalTokens, reasoningOutputTokens });

describe('session reasoning effort attribution', () => {
  it('groups by model and effort and includes configured turns without usage', () => {
    const session = parse(
      context('a', 'max', 'model-a'),
      increment(20, 2),
      context('b', 'max', 'model-b'),
      increment(30, 3),
      context('c', 'ultra', 'model-a'),
      increment(50, 5),
      context('d', 'max', 'model-a'),
      context('e', 'low', 'model-c')
    );
    expect(session.reasoningEfforts).toEqual([
      row('max', 2, 20, 2, 'model-a'),
      row('ultra', 1, 50, 5, 'model-a'),
      row('max', 1, 30, 3, 'model-b'),
      row('low', 1, null, null, 'model-c'),
    ]);
    expect(session.totalTokens).toBe(100);
    expect(session.reasoningOutputTokens).toBe(10);
  });

  it('preserves the other field when a model or an effort is missing or conflicts', () => {
    const session = parse(
      context('a', 'max', 'model-a'),
      increment(7, 1),
      context('a', 'max', 'model-b'),
      increment(4, 1),
      context('a', 'max', 'model-a'),
      context('b', 'low', 'model-b'),
      increment(5, 2),
      context('b', 'ultra', 'model-b'),
      increment(6, 3),
      context('c', undefined, ' model-c '),
      increment(13, 4),
      context('d', 'high'),
      increment(19, 6)
    );
    expect(session.reasoningEfforts).toEqual([
      row(null, 1, 11, 5, 'model-b'),
      row(null, 1, 13, 4, 'model-c'),
      row('max', 1, 11, 2),
      row('high', 1, 19, 6),
    ]);
    expect(session.totalTokens).toBe(54);
  });

  it('keeps the active turn when a completed turn sends a duplicate terminal event', () => {
    const session = parse(
      event('task_started', 'a'),
      context('a', 'low'),
      event('task_complete', 'a'),
      event('task_started', 'b'),
      context('b', 'high'),
      event('task_complete', 'a'),
      increment(5, 1, 'b'),
      increment(2, 0),
      event('task_complete', 'b')
    );
    expect(session.reasoningEfforts).toEqual([row('low', 1, null, null), row('high', 1, 7, 1)]);
  });

  it('binds an anonymous started turn when its first identified event is incremental usage', () => {
    const session = parse(
      event('task_started'),
      context(undefined, 'high'),
      increment(5, 1, 'b'),
      event('task_complete', 'b'),
      event('task_complete', 'b')
    );
    expect(session.reasoningEfforts).toEqual([row('high', 1, 5, 1)]);
  });

  it('accepts explicitly identified late usage only across its own terminal boundary', () => {
    const session = parse(
      context('a', 'low'),
      event('task_complete', 'a'),
      increment(5, 1, 'a'),
      increment(10, 2),
      event('task_started', 'b'),
      context('b', 'high'),
      increment(20, 3, 'a'),
      event('turn_aborted', 'b'),
      increment(3, 1, 'b'),
      { type: 'session_meta', payload: { id: 'other' } },
      increment(40, 4, 'b')
    );
    expect(session.reasoningEfforts).toEqual([
      row('low', 1, 5, 1),
      row('high', 1, 3, 1),
      row(null, 0, 70, 9),
    ]);
  });

  it('counts distinct configured turns and sums all incremental requests, including unfamiliar efforts', () => {
    const session = parse(
      event('task_started', 'a'),
      context('a', 'low'),
      increment(15, 2),
      context('a', 'low'),
      increment(24, 3),
      event('task_complete', 'a'),
      context('b', 'ultra'),
      increment(11, 7),
      context('b', 'ultra'),
      context('c', 'low'),
      increment(0, 0),
      context('d', 'new-effort')
    );
    expect(session.reasoningEfforts).toEqual([
      row('low', 2, 39, 5),
      row('ultra', 1, 11, 7),
      row('new-effort', 1, null, null),
    ]);
    expect(session.totalTokens).toBe(50);
  });

  it('keeps unbounded requests, late contexts and mismatched IDs out of known effort totals', () => {
    const session = parse(
      increment(1, 1),
      event('turn_started', 'a'),
      increment(2, 1),
      context('a', 'high'),
      increment(4, 1),
      increment(8, 2, 'unrelated'),
      event('turn_complete', 'a'),
      increment(16, 3),
      context(undefined, 'low'),
      increment(32, 4)
    );
    expect(session.reasoningEfforts).toEqual([row('high', 1, 4, 1), row(null, 0, 59, 11)]);
  });

  it('moves conflicting effort evidence to unknown without double-counting the turn', () => {
    const session = parse(
      context('a', 'low'),
      increment(5, 1),
      context('a', 'high'),
      increment(6, 2),
      context('a', 'low'),
      event('turn_aborted', 'a'),
      event('task_started', 'b'),
      context('b'),
      increment(7, 3),
      event('task_complete', 'b')
    );
    expect(session.reasoningEfforts).toEqual([row(null, 2, 18, 6)]);
  });

  it('leaves a request unknown when its context conflicts with a still-active explicit start', () => {
    const session = parse(
      event('task_started', 'a'),
      context('a', 'low'),
      increment(6, 2),
      context('b', 'high'),
      increment(9, 3)
    );
    expect(session.reasoningEfforts).toEqual([
      row('low', 1, 6, 2),
      row('high', 1, null, null),
      row(null, 0, 9, 3),
    ]);
  });

  it('uses a sole started turn to resolve a context without an id and deduplicates the later id', () => {
    const session = parse(
      event('turn_started'),
      context(undefined, 'max'),
      increment(5, 2),
      event('turn_complete', 'a'),
      event('turn_complete', 'a'),
      event('turn_started', 'b'),
      context(undefined, 'max'),
      increment(1, 0)
    );
    expect(session.reasoningEfforts).toEqual([row('max', 2, 6, 2)]);
  });

  it('keeps missing metrics distinct from measured zero, including partial reasoning coverage', () => {
    const session = parse(
      context('a', 'low'),
      increment(4, 1),
      increment(3),
      context('b', 'high'),
      increment(0, 0),
      context('c', 'medium'),
      increment(undefined, 0),
      context('d', 'none'),
      increment(0, 0),
      aggregate(100, 10)
    );
    expect(session.reasoningEfforts).toEqual([
      row('low', 1, 7, null),
      row('high', 1, 0, 0),
      row('medium', 1, null, 0),
      row('none', 1, 0, 0),
    ]);
  });

  it('leaves cumulative-only usage in unknown and still counts individually identified turns', () => {
    const session = parse(
      event('turn_started', 'a'),
      context('a', 'low', 'model-a'),
      aggregate(4, 1),
      event('turn_complete', 'a'),
      event('turn_started', 'b'),
      context('b', 'max', 'model-b'),
      aggregate(11),
      aggregate(3, 1)
    );
    expect(session.reasoningEfforts).toEqual([
      row('low', 1, null, null, 'model-a'),
      row('max', 1, null, null, 'model-b'),
      row(null, 0, 11, null),
    ]);
    expect(session.totalTokens).toBe(11);
    expect(parse().reasoningEfforts).toEqual([]);
  });
});
