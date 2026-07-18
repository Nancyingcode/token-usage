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
    expect(session.warnings.length).toBe(1);
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
    expect(session.warnings).toHaveLength(1);
  });
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
