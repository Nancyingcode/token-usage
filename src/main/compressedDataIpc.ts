/**
 * @file 压缩数据手动导入 IPC
 * @description 只使用主进程已验证的数据目录，Renderer 无法指定来源路径或本地存储位置。
 */
import { ipcMain, type BrowserWindow } from 'electron';
import { createOperationHandler } from './ipcOperationHandler';
import type { AppOperationGate } from './appOperationGate';
import {
  COMPRESSED_DATA_GET_STATUS_CHANNEL,
  COMPRESSED_DATA_REFRESH_CHANNEL,
  COMPRESSED_DATA_UPDATED_CHANNEL,
} from '../shared/ipcChannels';
import type { CompressedUsageService } from './compressedUsageService';

export interface CompressedDataIpcDependencies extends Pick<
  CompressedUsageService,
  'getStatus' | 'refresh' | 'subscribe'
> {
  operationGate?: AppOperationGate;
  getWindow: () => BrowserWindow | null;
}

export const registerCompressedDataIpc = (
  dependencies: CompressedDataIpcDependencies
): (() => void) => {
  const registerHandler = createOperationHandler(dependencies.operationGate);
  registerHandler(COMPRESSED_DATA_GET_STATUS_CHANNEL, () => dependencies.getStatus());
  registerHandler(COMPRESSED_DATA_REFRESH_CHANNEL, () => dependencies.refresh());
  const unsubscribe = dependencies.subscribe((status) => {
    const window = dependencies.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(COMPRESSED_DATA_UPDATED_CHANNEL, status);
    }
  });

  return () => {
    unsubscribe();
    ipcMain.removeHandler(COMPRESSED_DATA_GET_STATUS_CHANNEL);
    ipcMain.removeHandler(COMPRESSED_DATA_REFRESH_CHANNEL);
  };
};
