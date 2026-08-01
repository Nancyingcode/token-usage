/**
 * @file 渲染进程错误文案
 * @description 从 Error 或 Electron IPC 序列化后的普通对象中安全提取可见消息。
 */

export const getErrorMessage = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
};
