/**
 * @file 应用更新状态 Hook
 * @description 订阅主进程快照，按修订号拒绝过期响应；仅由用户操作发起更新命令。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppUpdateApi, AppUpdateSnapshot } from '../../shared/appUpdateTypes';

type UpdateAction = 'check' | 'download' | 'install' | 'openReleasePage';
type UpdateFeedback = 'connection' | 'release-page' | null;

const getUpdateApi = (): AppUpdateApi | undefined =>
  typeof window === 'undefined' ? undefined : window.codexUsage?.appUpdate;

export const useAppUpdate = () => {
  const [snapshot, setSnapshot] = useState<AppUpdateSnapshot | null>(null);
  const [pending, setPending] = useState<UpdateAction | null>(null);
  const [feedback, setFeedback] = useState<UpdateFeedback>(null);
  const [unavailable, setUnavailable] = useState(() => !getUpdateApi());
  // 组件实例拥有订阅代次、最新修订和指令锁；卸载使旧异步回调失效，重挂载建立新代次。
  const lifecycleRef = useRef(0);
  const latestSnapshotRef = useRef<AppUpdateSnapshot | null>(null);
  const actionInFlightRef = useRef<UpdateAction | null>(null);

  const acceptSnapshot = useCallback((next: AppUpdateSnapshot): void => {
    const current = latestSnapshotRef.current;
    if (current && next.revision < current.revision) {
      return;
    }
    latestSnapshotRef.current = next;
    setSnapshot(next);
    setFeedback(null);
    setUnavailable(false);
  }, []);

  useEffect(() => {
    const api = getUpdateApi();
    const generation = ++lifecycleRef.current;
    if (!api) {
      setUnavailable(true);
      return;
    }
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = api.onUpdated((next) => {
        if (generation === lifecycleRef.current) {
          acceptSnapshot(next);
        }
      });
      void api
        .get()
        .then((next) => {
          if (generation === lifecycleRef.current) {
            acceptSnapshot(next);
          }
        })
        .catch(() => {
          if (generation === lifecycleRef.current && !latestSnapshotRef.current) {
            setFeedback('connection');
          }
        });
    } catch {
      setFeedback('connection');
    }
    return () => {
      lifecycleRef.current += 1;
      unsubscribe?.();
    };
  }, [acceptSnapshot]);

  const run = useCallback(
    async (action: UpdateAction): Promise<void> => {
      const api = getUpdateApi();
      if (!api || actionInFlightRef.current) {
        return;
      }
      const generation = lifecycleRef.current;
      const revisionAtStart = latestSnapshotRef.current?.revision ?? -1;
      actionInFlightRef.current = action;
      setPending(action);
      setFeedback(null);
      try {
        const next = await api[action]();
        if (generation === lifecycleRef.current && next) {
          acceptSnapshot(next);
        }
      } catch {
        const hasNewerSnapshot = (latestSnapshotRef.current?.revision ?? -1) > revisionAtStart;
        const showFailure = action === 'openReleasePage' || !hasNewerSnapshot;
        if (generation === lifecycleRef.current && showFailure) {
          setFeedback(action === 'openReleasePage' ? 'release-page' : 'connection');
        }
      } finally {
        if (generation === lifecycleRef.current) {
          actionInFlightRef.current = null;
          setPending(null);
        }
      }
    },
    [acceptSnapshot]
  );

  return {
    snapshot,
    pending,
    feedback,
    unavailable,
    check: () => run('check'),
    download: () => run('download'),
    install: () => run('install'),
    openReleasePage: () => run('openReleasePage'),
  };
};
