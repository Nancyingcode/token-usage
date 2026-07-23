import { describe, expect, it } from 'vitest';
import parseSessionJsonl from '../src/main/sessionParser';

describe('sessionParser', () => {
  it('sums last_token_usage events', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-11T01:00:00.000Z',
        type: 'session_meta',
        payload: { session_id: 's1', cwd: 'C:\\repo\\alpha' },
      }),
      JSON.stringify({
        timestamp: '2026-07-11T01:01:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: usage(10, 2, 3, 1, 13),
            total_token_usage: usage(10, 2, 3, 1, 13),
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-11T01:02:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: usage(7, 1, 5, 2, 12),
            total_token_usage: usage(17, 3, 8, 3, 25),
          },
        },
      }),
    ].join('\n');

    const session = parseSessionJsonl('s1.jsonl', content, 'Alpha thread');

    expect(session.sessionId).toBe('s1');
    expect(session.threadName).toBe('Alpha thread');
    expect(session.projectName).toBe('alpha');
    expect(session.inputTokens).toBe(17);
    expect(session.totalTokens).toBe(25);
    expect(session.eventCount).toBe(2);
  });

  it('falls back to largest total_token_usage when increments are missing', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-11T01:00:00.000Z',
        type: 'session_meta',
        payload: { session_id: 's2', cwd: 'C:\\repo\\beta' },
      }),
      JSON.stringify({
        timestamp: '2026-07-11T01:01:00.000Z',
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: usage(5, 0, 1, 0, 6) } },
      }),
      JSON.stringify({
        timestamp: '2026-07-11T01:02:00.000Z',
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: usage(20, 4, 6, 1, 26) } },
      }),
    ].join('\n');

    const session = parseSessionJsonl('s2.jsonl', content);

    expect(session.totalTokens).toBe(26);
    expect(session.cachedInputTokens).toBe(4);
  });

  it('keeps partial data when a line is malformed', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-11T01:00:00.000Z',
        type: 'session_meta',
        payload: { session_id: 's3', cwd: 'C:\\repo\\gamma' },
      }),
      '{bad json',
      JSON.stringify({
        timestamp: '2026-07-11T01:01:00.000Z',
        type: 'event_msg',
        payload: { type: 'token_count', info: { last_token_usage: usage(1, 0, 1, 0, 2) } },
      }),
    ].join('\n');

    const session = parseSessionJsonl('s3.jsonl', content);

    expect(session.totalTokens).toBe(2);
    expect(session.warnings).toEqual([
      expect.objectContaining({ code: 'malformed-jsonl', line: 2 }),
    ]);
  });

  it('skips non-object JSON records without losing valid usage', () => {
    const content = [
      'null',
      '[]',
      JSON.stringify({
        timestamp: '2026-07-11T01:01:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: usage(4, 1, 2, 0, 6) },
        },
      }),
    ].join('\n');

    const session = parseSessionJsonl('invalid-records.jsonl', content);

    expect(session.totalTokens).toBe(6);
    expect(session.warnings).toHaveLength(2);
    expect(session.warnings.map(({ line }) => line)).toEqual([1, 2]);
    expect(session.warnings.map(({ code }) => code)).toEqual([
      'invalid-jsonl-record',
      'invalid-jsonl-record',
    ]);
  });

  it('rejects invalid token fields without contaminating totals', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-11T01:00:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            last_token_usage: {
              input_tokens: '10',
              total_tokens: -1,
            },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-07-11T01:01:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { last_token_usage: usage(3, 0, 2, 0, 5) },
        },
      }),
    ].join('\n');

    const session = parseSessionJsonl('invalid-token.jsonl', content);

    expect(session.totalTokens).toBe(5);
    expect(session.eventCount).toBe(1);
    expect(session.warnings).toEqual([expect.objectContaining({ code: 'invalid-token-usage' })]);
  });

  it('attributes incremental token slices to the active model', () => {
    const content = [
      JSON.stringify({
        timestamp: '2026-07-20T00:00:00.000Z',
        type: 'turn_context',
        payload: { model: 'gpt-5.2-codex' },
      }),
      tokenLine('2026-07-20T00:01:00.000Z', usage(10, 2, 3, 1, 13)),
      JSON.stringify({
        timestamp: '2026-07-20T00:02:00.000Z',
        type: 'turn_context',
        payload: { model: 'gpt-5.3-codex' },
      }),
      tokenLine('2026-07-20T00:03:00.000Z', usage(20, 5, 4, 2, 24)),
    ].join('\n');

    const session = parseSessionJsonl('models.jsonl', content);

    expect(
      session.usageSlices.map(({ occurredAt, modelId, totalTokens }) => ({
        occurredAt,
        modelId,
        totalTokens,
      }))
    ).toEqual([
      {
        occurredAt: '2026-07-20T00:01:00.000Z',
        modelId: 'gpt-5.2-codex',
        totalTokens: 13,
      },
      {
        occurredAt: '2026-07-20T00:03:00.000Z',
        modelId: 'gpt-5.3-codex',
        totalTokens: 24,
      },
    ]);
  });

  it('leaves an ambiguous total-only slice unpriced', () => {
    const session = parseSessionJsonl(
      'unknown-model.jsonl',
      tokenTotalLine(usage(10, 0, 2, 1, 12))
    );

    expect(session.usageSlices).toEqual([
      expect.objectContaining({ modelId: undefined, totalTokens: 12 }),
    ]);
  });
});

const tokenLine = (timestamp: string, lastUsage: ReturnType<typeof usage>): string =>
  JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: { type: 'token_count', info: { last_token_usage: lastUsage } },
  });

const tokenTotalLine = (totalUsage: ReturnType<typeof usage>): string =>
  JSON.stringify({
    timestamp: '2026-07-20T00:00:00.000Z',
    type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: totalUsage } },
  });

const usage = (
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningOutputTokens: number,
  totalTokens: number
): {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
} => {
  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: totalTokens,
  };
};
