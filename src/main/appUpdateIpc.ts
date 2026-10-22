/**
 * @file 应用更新 IPC
 * @description 仅接受主窗口主 frame 的无参数指令；发布页由主进程固定，Renderer 无法提供地址。
 */
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  APP_UPDATE_GET_CHANNEL,
  APP_UPDATE_CHECK_CHANNEL,
  APP_UPDATE_DOWNLOAD_CHANNEL,
  APP_UPDATE_INSTALL_CHANNEL,
  APP_UPDATE_OPEN_RELEASE_CHANNEL,
  APP_UPDATE_UPDATED_CHANNEL,
} from '../shared/ipcChannels';
import type { AppUpdateService } from './appUpdateService';

export const registerAppUpdateIpc = (
  service: AppUpdateService,
  getWindow: () => BrowserWindow | null,
  openReleasePage: () => Promise<void>
): (() => void) => {
  const operations = new Map<string, () => unknown>([
    [APP_UPDATE_GET_CHANNEL, () => service.getSnapshot()],
    [APP_UPDATE_CHECK_CHANNEL, () => service.check()],
    [APP_UPDATE_DOWNLOAD_CHANNEL, () => service.download()],
    [APP_UPDATE_INSTALL_CHANNEL, () => service.install()],
    [APP_UPDATE_OPEN_RELEASE_CHANNEL, openReleasePage],
  ]);
  const assertCaller = (event: IpcMainInvokeEvent, args: unknown[]): void => {
    const window = getWindow();
    if (
      !window ||
      window.isDestroyed() ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      args.length > 0
    )
      throw new Error('Application update request is not allowed.');
  };
  operations.forEach((operation, channel) => {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      assertCaller(event, args);
      return operation();
    });
  });
  const unsubscribe = service.subscribe((snapshot) => {
    const window = getWindow();
    if (window && !window.isDestroyed())
      window.webContents.send(APP_UPDATE_UPDATED_CHANNEL, snapshot);
  });
  return () => {
    unsubscribe();
    operations.forEach((_, channel) => ipcMain.removeHandler(channel));
  };
};
