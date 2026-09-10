/**
 * @file 价格同步 IPC
 * @description 只暴露目录状态、刷新和布尔偏好；Renderer 无法指定下载地址或存储路径。
 */
import { ipcMain, type BrowserWindow } from 'electron';
import {
  PRICING_GET_CHANNEL,
  PRICING_REFRESH_CHANNEL,
  PRICING_SET_AUTO_CHANNEL,
  PRICING_UPDATED_CHANNEL,
} from '../shared/ipcChannels';
import type { PricingSyncService } from './pricingSyncService';

export const registerPricingIpc = (
  service: PricingSyncService,
  getWindow: () => BrowserWindow | null
): (() => void) => {
  ipcMain.handle(PRICING_GET_CHANNEL, () => service.getSnapshot());
  ipcMain.handle(PRICING_REFRESH_CHANNEL, () => service.refresh());
  ipcMain.handle(PRICING_SET_AUTO_CHANNEL, (_event, enabled: unknown) =>
    service.setAutoUpdate(enabled)
  );
  const unsubscribe = service.subscribe((snapshot) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(PRICING_UPDATED_CHANNEL, snapshot);
    }
  });
  return () => {
    unsubscribe();
    [PRICING_GET_CHANNEL, PRICING_REFRESH_CHANNEL, PRICING_SET_AUTO_CHANNEL].forEach((channel) =>
      ipcMain.removeHandler(channel)
    );
  };
};
