// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompressedData } from '../src/renderer/hooks/useCompressedData';
import type { CompressedDataStatus } from '../src/shared/compressedDataTypes';

const INITIAL: CompressedDataStatus = {
  sessionsDir: 'C:\\sessions',
  phase: 'idle',
  discoveredCount: 1,
  unimportedCount: 1,
  importedCount: 0,
  processedCount: 0,
  totalCount: 0,
};

describe('useCompressedData', () => {
  let listener: ((status: CompressedDataStatus) => void) | undefined;
  const getStatus = vi.fn();
  const refresh = vi.fn();
  const unsubscribe = vi.fn();

  beforeEach(() => {
    listener = undefined;
    unsubscribe.mockReset();
    getStatus.mockReset().mockResolvedValue(INITIAL);
    refresh.mockReset().mockResolvedValue({ ...INITIAL, phase: 'ready' });
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        compressedData: {
          getStatus,
          refresh,
          onUpdated: (callback: (status: CompressedDataStatus) => void) => {
            listener = callback;
            return unsubscribe;
          },
        },
      },
    });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, 'codexUsage');
  });

  it('reads status and subscribes without automatically starting an import', async () => {
    const { result, unmount } = renderHook(() => useCompressedData());
    await waitFor(() => expect(result.current.status).toEqual(INITIAL));
    expect(refresh).not.toHaveBeenCalled();
    act(() => listener?.({ ...INITIAL, phase: 'importing', processedCount: 1, totalCount: 2 }));
    expect(result.current.status?.processedCount).toBe(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('ignores an initial response that arrives after a newer subscription update', async () => {
    const initial = deferred<CompressedDataStatus>();
    getStatus.mockReturnValue(initial.promise);
    const { result } = renderHook(() => useCompressedData());
    const next = { ...INITIAL, sessionsDir: 'D:\\different', phase: 'ready' as const };
    act(() => listener?.(next));
    await act(async () => {
      initial.resolve(INITIAL);
      await initial.promise;
    });
    expect(result.current.status).toEqual(next);
  });

  it('only imports on request and keeps one active request for repeated clicks', async () => {
    const imported = deferred<CompressedDataStatus>();
    refresh.mockReturnValue(imported.promise);
    const { result } = renderHook(() => useCompressedData());
    await waitFor(() => expect(result.current.status).toEqual(INITIAL));
    let first: Promise<void>;
    let second: Promise<void>;
    act(() => {
      first = result.current.refresh();
      second = result.current.refresh();
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);
    await act(async () => {
      imported.resolve({ ...INITIAL, phase: 'ready', importedCount: 1, unimportedCount: 0 });
      await Promise.all([first, second]);
    });
    expect(result.current.pending).toBe(false);
    expect(result.current.status?.importedCount).toBe(1);
  });

  it('retains the last status and exposes a failed manual request', async () => {
    refresh.mockRejectedValue(new Error('Disk full'));
    const { result } = renderHook(() => useCompressedData());
    await waitFor(() => expect(result.current.status).toEqual(INITIAL));
    await act(() => result.current.refresh());
    expect(result.current.status).toEqual(INITIAL);
    expect(result.current.error).toBe('Disk full');
    expect(result.current.pending).toBe(false);
  });

  it('does not replace a new-directory status with an old import response', async () => {
    const imported = deferred<CompressedDataStatus>();
    refresh.mockReturnValue(imported.promise);
    const { result } = renderHook(() => useCompressedData());
    await waitFor(() => expect(result.current.status).toEqual(INITIAL));
    let operation: Promise<void>;
    act(() => {
      operation = result.current.refresh();
    });
    const next = { ...INITIAL, sessionsDir: 'D:\\different' };
    act(() => listener?.(next));
    await act(async () => {
      imported.resolve({ ...INITIAL, phase: 'ready' });
      await operation;
    });
    expect(result.current.status).toEqual(next);
  });

  it('reports a transport failure after progress updates for the same directory', async () => {
    let rejectImport!: (error: Error) => void;
    refresh.mockReturnValue(
      new Promise<CompressedDataStatus>((_resolve, reject) => {
        rejectImport = reject;
      })
    );
    const { result } = renderHook(() => useCompressedData());
    await waitFor(() => expect(result.current.status).toEqual(INITIAL));
    let operation: Promise<void>;
    act(() => {
      operation = result.current.refresh();
    });
    act(() => listener?.({ ...INITIAL, phase: 'importing' }));
    await act(async () => {
      rejectImport(new Error('IPC unavailable'));
      await operation;
    });
    expect(result.current.error).toBe('IPC unavailable');
  });
});

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
