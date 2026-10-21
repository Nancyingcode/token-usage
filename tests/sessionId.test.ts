import { describe, expect, it } from 'vitest';
import getSessionId from '../src/shared/sessionId';

describe('getSessionId', () => {
  it('preserves rollout and custom IDs for compressed sources', () => {
    expect(getSessionId('C:/sessions/rollout-2026-07-16T12-30-45-abc.jsonl.zst')).toBe('abc');
    expect(getSessionId('C:/sessions/custom.jsonl.zst')).toBe('custom');
  });

  it('extracts an id from a rollout filename', () => {
    expect(getSessionId('rollout-2026-07-16T12-30-45-session-id.jsonl')).toBe('session-id');
  });

  it('extracts an id from a full Windows path', () => {
    expect(
      getSessionId(
        'C:\\Users\\me\\.codex\\sessions\\2026\\07\\16\\rollout-2026-07-16T12-30-45-abc.jsonl'
      )
    ).toBe('abc');
  });

  it('falls back to a non-rollout filename without its extension', () => {
    expect(getSessionId('C:/sessions/custom.jsonl')).toBe('custom');
  });
});
