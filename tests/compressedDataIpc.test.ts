import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import type { CompressedDataStatus } from '../src/shared/compressedDataTypes';
import {
  COMPRESSED_DATA_GET_STATUS_CHANNEL,
  COMPRESSED_DATA_REFRESH_CHANNEL,
  COMPRESSED_DATA_UPDATED_CHANNEL,
} from '../src/shared/ipcChannels';

type IpcHandler = (...args: unknown[]) => unknown;

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  removeHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => electronMocks.handlers.set(channel, handler),
    removeHandler: electronMocks.removeHandler,
  },
}));

import { registerCompressedDataIpc } from '../src/main/compressedDataIpc';

const status: CompressedDataStatus = {
  sessionsDir: 'C:\\sessions',
  phase: 'idle',
  discoveredCount: 1,
  unimportedCount: 1,
  importedCount: 0,
  processedCount: 0,
  totalCount: 0,
};

describe('compressed data IPC', () => {
  beforeEach(() => {
    electronMocks.handlers.clear();
    electronMocks.removeHandler.mockClear();
  });

  it('reads status without importing and only forwards explicit refresh without renderer paths', async () => {
    const getStatus = vi.fn(() => status);
    const refresh = vi.fn(async () => ({ ...status, phase: 'ready' as const }));
    const dispose = registerCompressedDataIpc({
      getStatus,
      refresh,
      subscribe: () => () => undefined,
      getWindow: () => null,
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(electronMocks.handlers.get(COMPRESSED_DATA_GET_STATUS_CHANNEL)?.({}, 'C:\\other')).toBe(
      status
    );
    expect(getStatus).toHaveBeenCalledWith();
    expect(refresh).not.toHaveBeenCalled();
    await expect(
      electronMocks.handlers.get(COMPRESSED_DATA_REFRESH_CHANNEL)?.({}, 'C:\\other')
    ).resolves.toMatchObject({ phase: 'ready' });
    expect(refresh).toHaveBeenCalledExactlyOnceWith();
    dispose();
  });

  it('broadcasts status only to the current live window and releases subscriptions and handlers', () => {
    let updateListener: ((next: CompressedDataStatus) => void) | undefined;
    const unsubscribe = vi.fn(() => {
      updateListener = undefined;
    });
    const send = vi.fn();
    let window: BrowserWindow | null = null;
    const dispose = registerCompressedDataIpc({
      getStatus: () => status,
      refresh: async () => status,
      subscribe: (listener) => {
        updateListener = listener;
        return unsubscribe;
      },
      getWindow: () => window,
    });

    updateListener?.(status);
    window = { isDestroyed: () => true, webContents: { send } } as unknown as BrowserWindow;
    updateListener?.(status);
    expect(send).not.toHaveBeenCalled();
    window = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow;
    const progress = { ...status, phase: 'importing' as const, processedCount: 1, totalCount: 2 };
    updateListener?.(progress);
    expect(send).toHaveBeenCalledExactlyOnceWith(COMPRESSED_DATA_UPDATED_CHANNEL, progress);

    dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(electronMocks.removeHandler).toHaveBeenCalledTimes(2);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(COMPRESSED_DATA_GET_STATUS_CHANNEL);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(COMPRESSED_DATA_REFRESH_CHANNEL);
    expect(updateListener).toBeUndefined();
  });
});
