/** @file 应用更新 IPC 授权与固定发布页测试。 */
import { describe, expect, it, vi } from 'vitest';
import { registerAppUpdateIpc } from '../src/main/appUpdateIpc';
import type { AppUpdateService } from '../src/main/appUpdateService';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: ipc }));

describe('app update IPC', () => {
  it('rejects other windows, child frames and all supplied parameters', async () => {
    ipc.handle.mockClear();
    const frame = {};
    const contents = { mainFrame: frame, send: vi.fn() };
    const window = { webContents: contents, isDestroyed: () => false };
    const getSnapshot = vi.fn();
    const openReleasePage = vi.fn();
    const cleanup = registerAppUpdateIpc(
      { getSnapshot, subscribe: () => vi.fn() } as unknown as AppUpdateService,
      () => window as unknown as BrowserWindow,
      openReleasePage
    );
    const event = { sender: contents, senderFrame: frame } as unknown as IpcMainInvokeEvent;
    const get = ipc.handle.mock.calls.find(([name]) => name === 'app-update:get')?.[1] as (
      event: IpcMainInvokeEvent,
      ...args: unknown[]
    ) => Promise<unknown>;
    const open = ipc.handle.mock.calls.find(
      ([name]) => name === 'app-update:open-release'
    )?.[1] as typeof get;
    await expect(get({ ...event, senderFrame: {} } as IpcMainInvokeEvent)).rejects.toThrow();
    await expect(get({ ...event, sender: {} } as IpcMainInvokeEvent)).rejects.toThrow();
    await expect(open(event, 'https://evil.example')).rejects.toThrow();
    expect(openReleasePage).not.toHaveBeenCalled();
    await get(event);
    expect(getSnapshot).toHaveBeenCalledOnce();
    await open(event);
    expect(openReleasePage).toHaveBeenCalledExactlyOnceWith();
    cleanup();
  });
});
