/**
 * @file 更新前业务操作门禁
 * @description 暂停时拒绝新 IPC 业务，保留在途操作和失败直到等待完成；恢复函数由安装尝试拥有。
 */
export const createAppOperationGate = () => {
  // 门禁由应用入口创建；每次暂停周期独立记录失败，最后一次恢复时清空。
  const pending = new Set<Promise<unknown>>();
  let pauses = 0;
  let failure: { error: unknown } | undefined;

  const run = <T>(operation: () => T | Promise<T>): Promise<T> => {
    if (pauses > 0) {
      return Promise.reject(new Error('Application is preparing to install an update.'));
    }
    let result: Promise<T>;
    try {
      result = Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error);
    }
    pending.add(result);
    void result.then(
      () => pending.delete(result),
      (error: unknown) => {
        pending.delete(result);
        if (pauses > 0) failure = { error };
      }
    );
    return result;
  };

  const pause = (): (() => void) => {
    if (pauses === 0) failure = undefined;
    pauses += 1;
    let resumed = false;
    return () => {
      if (resumed) return;
      resumed = true;
      pauses -= 1;
      if (pauses === 0) failure = undefined;
    };
  };

  const drain = async (): Promise<void> => {
    await Promise.allSettled([...pending]);
    if (failure) throw failure.error;
  };
  return { run, pause, drain };
};

export type AppOperationGate = ReturnType<typeof createAppOperationGate>;
