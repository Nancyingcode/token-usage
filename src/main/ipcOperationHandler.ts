/** @file 业务 IPC 的更新暂停包装；保留原处理器的结果和错误，仅跟踪其完整生命周期。 */
import { ipcMain } from 'electron';
import type { AppOperationGate } from './appOperationGate';
import { isRecord } from '../shared/runtimeTypes';

class FailedOperationResponse extends Error {
  constructor(readonly response: unknown) {
    super('Application operation did not complete.');
  }
}

export const createOperationHandler =
  (gate?: AppOperationGate): typeof ipcMain.handle =>
  (channel, listener) => {
    if (!gate) {
      ipcMain.handle(channel, listener);
      return;
    }
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      try {
        return await gate.run(async () => {
          const response: unknown = await listener(event, ...args);
          // 类型化 IPC 使用结果对象传递业务失败；门禁必须保留失败，界面仍接收原有协议。
          if (isRecord(response) && response.ok === false && isRecord(response.error)) {
            throw new FailedOperationResponse(response);
          }
          return response;
        });
      } catch (error) {
        if (error instanceof FailedOperationResponse) return error.response;
        throw error;
      }
    });
  };
