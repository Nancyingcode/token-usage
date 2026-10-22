// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompressedDataApi, CompressedDataStatus } from '../src/shared/compressedDataTypes';
import type { AppUpdateApi, AppUpdateSnapshot } from '../src/shared/appUpdateTypes';
import {
  APP_UPDATE_CHECK_CHANNEL,
  APP_UPDATE_DOWNLOAD_CHANNEL,
  APP_UPDATE_GET_CHANNEL,
  APP_UPDATE_INSTALL_CHANNEL,
  APP_UPDATE_OPEN_RELEASE_CHANNEL,
  APP_UPDATE_UPDATED_CHANNEL,
  COMPRESSED_DATA_GET_STATUS_CHANNEL,
  COMPRESSED_DATA_REFRESH_CHANNEL,
  COMPRESSED_DATA_UPDATED_CHANNEL,
  USAGE_SCAN_CHANNEL,
} from '../src/shared/ipcChannels';

interface ExposedApi {
  appUpdate: AppUpdateApi;
  compressedData: CompressedDataApi;
  scan: () => Promise<unknown>;
}

type IpcListener = (event: unknown, payload: CompressedDataStatus) => void;

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}));

const status: CompressedDataStatus = {
  sessionsDir: 'C:\\sessions',
  phase: 'ready',
  discoveredCount: 2,
  unimportedCount: 0,
  importedCount: 2,
  processedCount: 2,
  totalCount: 2,
};

const loadPreload = async (): Promise<ExposedApi> => {
  vi.resetModules();
  await import('../src/preload/preload');
  const call = electronMocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'codexUsage');
  if (!call) {
    throw new Error('Preload API was not exposed.');
  }
  return call[1] as ExposedApi;
};

describe('compressed data preload bridge', () => {
  beforeEach(() => {
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.invoke.mockReset();
    electronMocks.on.mockClear();
    electronMocks.removeListener.mockClear();
  });

  it('keeps compressed import separate from startup, status reads and ordinary scans', async () => {
    const api = await loadPreload();
    expect(electronMocks.invoke).not.toHaveBeenCalled();
    expect(Object.keys(api.compressedData)).toEqual(['getStatus', 'refresh', 'onUpdated']);
    electronMocks.invoke.mockResolvedValue(status);

    await expect(api.compressedData.getStatus()).resolves.toBe(status);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(COMPRESSED_DATA_GET_STATUS_CHANNEL);
    await api.scan();
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(USAGE_SCAN_CHANNEL);
    expect(electronMocks.invoke).not.toHaveBeenCalledWith(COMPRESSED_DATA_REFRESH_CHANNEL);

    await expect(api.compressedData.refresh()).resolves.toBe(status);
    expect(electronMocks.invoke).toHaveBeenLastCalledWith(COMPRESSED_DATA_REFRESH_CHANNEL);
    expect(electronMocks.invoke).toHaveBeenCalledTimes(3);
  });

  it('only passes the status payload and removes the exact listener on unsubscribe', async () => {
    const api = await loadPreload();
    const listener = vi.fn();
    const unsubscribe = api.compressedData.onUpdated(listener);
    const subscription = electronMocks.on.mock.calls.find(
      ([channel]) => channel === COMPRESSED_DATA_UPDATED_CHANNEL
    );
    const handler = subscription?.[1] as IpcListener | undefined;

    expect(handler).toBeTypeOf('function');
    handler?.({ sender: 'privileged-electron-event' }, status);
    expect(listener).toHaveBeenCalledExactlyOnceWith(status);
    expect(electronMocks.invoke).not.toHaveBeenCalled();

    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledExactlyOnceWith(
      COMPRESSED_DATA_UPDATED_CHANNEL,
      handler
    );
  });

  it('only exposes parameterless update operations and payload-only subscriptions', async () => {
    const api = await loadPreload();
    const update: AppUpdateSnapshot = { phase: 'idle', revision: 0, currentVersion: '0.1.0' };
    electronMocks.invoke.mockResolvedValue(update);
    expect(electronMocks.invoke).not.toHaveBeenCalled();
    await api.appUpdate.get();
    await api.appUpdate.check();
    await api.appUpdate.download();
    await api.appUpdate.install();
    await api.appUpdate.openReleasePage();
    expect(electronMocks.invoke.mock.calls).toEqual([
      [APP_UPDATE_GET_CHANNEL],
      [APP_UPDATE_CHECK_CHANNEL],
      [APP_UPDATE_DOWNLOAD_CHANNEL],
      [APP_UPDATE_INSTALL_CHANNEL],
      [APP_UPDATE_OPEN_RELEASE_CHANNEL],
    ]);
    const listener = vi.fn();
    const unsubscribe = api.appUpdate.onUpdated(listener);
    const subscription = electronMocks.on.mock.calls.find(
      ([channel]) => channel === APP_UPDATE_UPDATED_CHANNEL
    );
    const handler = subscription?.[1] as (event: unknown, value: AppUpdateSnapshot) => void;
    handler({ sender: 'privileged-electron-event' }, update);
    expect(listener).toHaveBeenCalledExactlyOnceWith(update);
    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledExactlyOnceWith(
      APP_UPDATE_UPDATED_CHANNEL,
      handler
    );
  });
});
