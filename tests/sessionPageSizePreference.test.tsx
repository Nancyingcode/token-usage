import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SESSION_PAGE_SIZE,
  loadSessionPageSizePreference,
  saveSessionPageSizePreference,
  type SessionPageSizeStorage,
} from '../src/renderer/utils/sessionPageSizePreference';

describe('session page-size preference', () => {
  it.each(['10', '20', '50', '100'])('loads the allowed value %s', (storedValue) => {
    const storage: SessionPageSizeStorage = {
      getItem: vi.fn().mockReturnValue(storedValue),
      setItem: vi.fn(),
    };

    expect(loadSessionPageSizePreference(storage)).toBe(Number(storedValue));
  });

  it.each([null, '', '0', '11', '20.5', 'not-a-number'])(
    'uses the default for invalid stored value %s',
    (storedValue) => {
      const storage: SessionPageSizeStorage = {
        getItem: vi.fn().mockReturnValue(storedValue),
        setItem: vi.fn(),
      };

      expect(loadSessionPageSizePreference(storage)).toBe(DEFAULT_SESSION_PAGE_SIZE);
    }
  );

  it('uses the default when storage cannot be read', () => {
    const storage: SessionPageSizeStorage = {
      getItem: vi.fn().mockImplementation(() => {
        throw new Error('storage unavailable');
      }),
      setItem: vi.fn(),
    };

    expect(loadSessionPageSizePreference(storage)).toBe(DEFAULT_SESSION_PAGE_SIZE);
  });

  it('saves the selection under the session-list key', () => {
    const setItem = vi.fn<SessionPageSizeStorage['setItem']>();

    saveSessionPageSizePreference(50, { getItem: vi.fn(), setItem });

    expect(setItem).toHaveBeenCalledWith('codex-token-usage.sessions-page-size', '50');
  });

  it('keeps the in-memory selection usable when storage cannot be written', () => {
    const storage: SessionPageSizeStorage = {
      getItem: vi.fn(),
      setItem: vi.fn().mockImplementation(() => {
        throw new Error('storage unavailable');
      }),
    };

    expect(() => saveSessionPageSizePreference(100, storage)).not.toThrow();
  });
});
