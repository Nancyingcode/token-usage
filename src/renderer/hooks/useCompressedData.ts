/**
 * @file 压缩数据导入状态
 * @description 订阅主进程导入状态，只在用户操作时发起刷新，并忽略过期请求结果。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompressedDataStatus } from '../../shared/compressedDataTypes';
import { getErrorMessage } from '../utils/errorMessage';

export interface CompressedDataState {
  status: CompressedDataStatus | null;
  pending: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useCompressedData = (): CompressedDataState => {
  const [status, setStatus] = useState<CompressedDataStatus | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 订阅属于本次挂载；更新序号避免旧目录的请求响应覆盖较新的权威状态。
  const mountedRef = useRef(false);
  const updateSequenceRef = useRef(0);
  const activeRefreshRef = useRef<Promise<void> | null>(null);
  const currentDirectoryRef = useRef<string | undefined>(undefined);
  const directorySequenceRef = useRef(0);

  const acceptStatus = useCallback((nextStatus: CompressedDataStatus): void => {
    if (currentDirectoryRef.current !== nextStatus.sessionsDir) {
      directorySequenceRef.current += 1;
      currentDirectoryRef.current = nextStatus.sessionsDir;
    }
    setStatus(nextStatus);
    setError(null);
  }, []);

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    const initialSequence = updateSequenceRef.current;
    const unsubscribe = window.codexUsage.compressedData.onUpdated((nextStatus) => {
      if (active) {
        updateSequenceRef.current += 1;
        acceptStatus(nextStatus);
      }
    });
    void window.codexUsage.compressedData
      .getStatus()
      .then((nextStatus) => {
        if (active && initialSequence === updateSequenceRef.current) {
          acceptStatus(nextStatus);
        }
      })
      .catch((readError: unknown) => {
        if (active && initialSequence === updateSequenceRef.current) {
          setError(getErrorMessage(readError));
        }
      });

    return () => {
      active = false;
      mountedRef.current = false;
      updateSequenceRef.current += 1;
      directorySequenceRef.current += 1;
      unsubscribe();
    };
  }, [acceptStatus]);

  const refresh = useCallback((): Promise<void> => {
    if (activeRefreshRef.current) {
      return activeRefreshRef.current;
    }

    const requestSequence = updateSequenceRef.current;
    const requestDirectorySequence = directorySequenceRef.current;
    setPending(true);
    setError(null);
    const operation = window.codexUsage.compressedData
      .refresh()
      .then((nextStatus) => {
        if (mountedRef.current && requestSequence === updateSequenceRef.current) {
          acceptStatus(nextStatus);
        }
      })
      .catch((refreshError: unknown) => {
        if (mountedRef.current && requestDirectorySequence === directorySequenceRef.current) {
          setError(getErrorMessage(refreshError));
        }
      })
      .finally(() => {
        activeRefreshRef.current = null;
        if (mountedRef.current) {
          setPending(false);
        }
      });
    activeRefreshRef.current = operation;
    return operation;
  }, [acceptStatus]);

  return { status, pending, error, refresh };
};
