// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '../src/renderer/hooks/useTheme';
import type { ThemeSnapshot } from '../src/shared/theme';

const INITIAL_SNAPSHOT: ThemeSnapshot = {
  preference: 'ocean-dark',
  resolvedTheme: 'ocean-dark',
};

describe('useTheme', () => {
  let updateListener: ((snapshot: ThemeSnapshot) => void) | undefined;
  const unsubscribe = vi.fn();
  const get = vi.fn();
  const set = vi.fn();

  beforeEach(() => {
    updateListener = undefined;
    unsubscribe.mockClear();
    get.mockReset().mockResolvedValue(INITIAL_SNAPSHOT);
    set.mockReset();
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        theme: {
          get,
          set,
          onUpdated: vi.fn((listener: (snapshot: ThemeSnapshot) => void) => {
            updateListener = listener;
            return unsubscribe;
          }),
        },
      },
    });
    document.documentElement.dataset.theme = 'mint-light';
    document.documentElement.style.colorScheme = 'light';
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'codexUsage');
  });

  it('loads the authoritative snapshot, applies updates and releases its subscription', async () => {
    const { result, unmount } = renderHook(() => useTheme());

    await waitFor(() => expect(result.current.snapshot).toEqual(INITIAL_SNAPSHOT));
    expect(document.documentElement.dataset.theme).toBe('ocean-dark');

    act(() => {
      updateListener?.({ preference: 'system', resolvedTheme: 'emerald-dark' });
    });
    expect(result.current.snapshot).toEqual({
      preference: 'system',
      resolvedTheme: 'emerald-dark',
    });
    expect(document.documentElement.dataset.theme).toBe('emerald-dark');

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('saves a selection and exposes a success state', async () => {
    const nextSnapshot: ThemeSnapshot = {
      preference: 'sand-light',
      resolvedTheme: 'sand-light',
    };
    set.mockResolvedValue(nextSnapshot);
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.snapshot).toEqual(INITIAL_SNAPSHOT));

    await act(() => result.current.setPreference('sand-light'));

    expect(set).toHaveBeenCalledWith('sand-light');
    expect(result.current.snapshot).toEqual(nextSnapshot);
    expect(result.current.feedback).toBe('saved');
    expect(result.current.pending).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('sand-light');
  });

  it('keeps the confirmed theme and exposes an error when saving fails', async () => {
    set.mockRejectedValue(new Error('disk full'));
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.snapshot).toEqual(INITIAL_SNAPSHOT));

    await act(() => result.current.setPreference('sand-light'));

    expect(result.current.snapshot).toEqual(INITIAL_SNAPSHOT);
    expect(result.current.feedback).toBe('error');
    expect(result.current.pending).toBe(false);
    expect(document.documentElement.dataset.theme).toBe('ocean-dark');
  });
});
