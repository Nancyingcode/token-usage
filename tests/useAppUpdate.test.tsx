// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppUpdate } from '../src/renderer/hooks/useAppUpdate';
import type { AppUpdateApi, AppUpdateSnapshot } from '../src/shared/appUpdateTypes';

const IDLE: AppUpdateSnapshot = { revision: 0, phase: 'idle', currentVersion: '0.1.0' };

const deferred = <Value,>() => {
  let resolve: (value: Value) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<Value>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

describe('useAppUpdate', () => {
  let listener: (snapshot: AppUpdateSnapshot) => void;
  const unsubscribe = vi.fn();
  const get = vi.fn<AppUpdateApi['get']>();
  const check = vi.fn<AppUpdateApi['check']>();
  const download = vi.fn<AppUpdateApi['download']>();
  const install = vi.fn<AppUpdateApi['install']>();
  const openReleasePage = vi.fn<AppUpdateApi['openReleasePage']>();

  beforeEach(() => {
    listener = () => undefined;
    unsubscribe.mockReset();
    get.mockReset().mockResolvedValue(IDLE);
    check.mockReset().mockResolvedValue({ ...IDLE, revision: 1, phase: 'up-to-date' });
    download.mockReset().mockResolvedValue({ ...IDLE, revision: 2, phase: 'downloaded' });
    install.mockReset().mockResolvedValue({ ...IDLE, revision: 3, phase: 'installing' });
    openReleasePage.mockReset().mockResolvedValue(undefined);
    const appUpdate: AppUpdateApi = {
      get,
      check,
      download,
      install,
      openReleasePage,
      onUpdated: (callback) => {
        listener = callback;
        return unsubscribe;
      },
    };
    Object.defineProperty(window, 'codexUsage', { configurable: true, value: { appUpdate } });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'codexUsage');
  });

  it('reads state without checking or downloading and unsubscribes when closed', async () => {
    const view = renderHook(() => useAppUpdate());
    await waitFor(() => expect(view.result.current.snapshot).toEqual(IDLE));
    expect(check).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps a newer subscription when initial reading or an operation arrives late', async () => {
    const initial = deferred<AppUpdateSnapshot>();
    const checked = deferred<AppUpdateSnapshot>();
    get.mockReturnValue(initial.promise);
    check.mockReturnValue(checked.promise);
    const { result } = renderHook(() => useAppUpdate());
    const available: AppUpdateSnapshot = {
      ...IDLE,
      revision: 5,
      phase: 'available',
      targetVersion: '0.2.0',
    };
    await act(async () => {
      listener(available);
      initial.resolve(IDLE);
    });
    expect(result.current.snapshot).toEqual(available);

    let operation = Promise.resolve();
    act(() => {
      operation = result.current.check();
    });
    await act(async () => {
      listener({ ...available, revision: 7, phase: 'downloaded' });
      checked.resolve({ ...IDLE, revision: 6, phase: 'up-to-date' });
      await operation;
    });
    expect(result.current.snapshot?.phase).toBe('downloaded');
    expect(result.current.snapshot?.revision).toBe(7);
  });

  it('prevents duplicate renderer operations and reports bridge failures without exposing details', async () => {
    const checked = deferred<AppUpdateSnapshot>();
    check.mockReturnValue(checked.promise);
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.snapshot).toEqual(IDLE));
    let operation = Promise.resolve();
    act(() => {
      operation = result.current.check();
      void result.current.check();
    });
    expect(check).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe('check');
    await act(async () => {
      checked.reject(new Error('private local path'));
      await operation;
    });
    expect(result.current.feedback).toBe('connection');
    expect(result.current.snapshot).toEqual(IDLE);
    expect(result.current.pending).toBeNull();
  });

  it('does not show an outdated request error after a newer state event', async () => {
    const checked = deferred<AppUpdateSnapshot>();
    check.mockReturnValue(checked.promise);
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.snapshot).toEqual(IDLE));
    let operation = Promise.resolve();
    act(() => {
      operation = result.current.check();
    });
    await act(async () => {
      listener({ ...IDLE, revision: 2, phase: 'available', targetVersion: '0.2.0' });
      checked.reject(new Error('late rejected invocation'));
      await operation;
    });
    expect(result.current.feedback).toBeNull();
    expect(result.current.snapshot?.phase).toBe('available');
  });

  it('reports unavailable without a desktop bridge and keeps commands safe', async () => {
    Reflect.deleteProperty(window, 'codexUsage');
    const { result } = renderHook(() => useAppUpdate());
    expect(result.current.unavailable).toBe(true);
    await act(async () => {
      await result.current.check();
      await result.current.download();
      await result.current.install();
      await result.current.openReleasePage();
    });
    expect(check).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });

  it('opens only the fixed main-process release command and handles opening errors', async () => {
    openReleasePage.mockRejectedValue(new Error('private browser path'));
    const { result } = renderHook(() => useAppUpdate());
    await waitFor(() => expect(result.current.snapshot).toEqual(IDLE));
    await act(() => result.current.openReleasePage());
    expect(openReleasePage).toHaveBeenCalledWith();
    expect(result.current.feedback).toBe('release-page');
  });
});
