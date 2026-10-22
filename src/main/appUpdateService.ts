/**
 * @file 应用在线更新服务
 * @description 主进程持有授权和更新状态，下载与重启安装分别由显式操作触发；普通退出只释放资源。
 */
import { compareStableAppVersions, isStableAppVersion } from '../shared/appUpdatePolicy';
import type {
  AppUpdateError,
  AppUpdateProgress,
  AppUpdateSnapshot,
  AppUpdateUnavailableReason,
} from '../shared/appUpdateTypes';

const MAX_PROGRESS_PERCENT = 100;
// 发布说明仅作预览，限制快照体积，完整说明由固定发布页提供。
const MAX_RELEASE_NOTES_CHARACTERS = 16_000;

export interface AppUpdateRelease {
  version: string;
  releaseNotes?: string;
}

export interface AppUpdateEngine {
  check: () => Promise<AppUpdateRelease | undefined>;
  download: (onProgress: (progress: AppUpdateProgress) => void) => Promise<void>;
  install: () => void | Promise<void>;
  destroy: () => void;
  onInstallError?: (listener: () => void) => () => void;
}

export interface AppUpdateServiceDependencies {
  currentVersion: string;
  engine: AppUpdateEngine;
  unavailableReason?: AppUpdateUnavailableReason;
  confirmInstall: () => Promise<boolean>;
  prepareForInstall: () => Promise<() => void>;
}

export interface AppUpdateService {
  getSnapshot: () => AppUpdateSnapshot;
  check: () => Promise<AppUpdateSnapshot>;
  download: () => Promise<AppUpdateSnapshot>;
  install: () => Promise<AppUpdateSnapshot>;
  subscribe: (listener: (snapshot: AppUpdateSnapshot) => void) => () => void;
  destroy: () => void;
}

type OperationName = 'check' | 'download' | 'install';

const copySnapshot = (snapshot: AppUpdateSnapshot): AppUpdateSnapshot => ({
  ...snapshot,
  progress: snapshot.progress ? { ...snapshot.progress } : undefined,
});

const normalizeProgress = (value: AppUpdateProgress): AppUpdateProgress | undefined => {
  if (
    !Number.isFinite(value.percent) ||
    !Number.isFinite(value.transferred) ||
    !Number.isFinite(value.total)
  ) {
    return undefined;
  }
  const total = Math.max(0, value.total);
  return {
    percent: Math.min(MAX_PROGRESS_PERCENT, Math.max(0, value.percent)),
    transferred: Math.min(total, Math.max(0, value.transferred)),
    total,
  };
};

export const createAppUpdateService = ({
  currentVersion,
  engine,
  unavailableReason,
  confirmInstall,
  prepareForInstall,
}: AppUpdateServiceDependencies): AppUpdateService => {
  // 本实例拥有快照、已验证下载和操作序号；新检查清空旧授权，destroy 使在途回调失效。
  let snapshot: AppUpdateSnapshot = {
    revision: 0,
    phase: unavailableReason ? 'unavailable' : 'idle',
    currentVersion,
    unavailableReason,
  };
  let activeOperation: { name: OperationName; promise: Promise<AppUpdateSnapshot> } | undefined;
  let operationGeneration = 0;
  let destroyed = false;
  let downloadedVersion: string | undefined;
  let resumeApplication: (() => void) | undefined;
  const listeners = new Set<(snapshot: AppUpdateSnapshot) => void>();

  const getSnapshot = (): AppUpdateSnapshot => copySnapshot(snapshot);
  const publish = (change: Partial<AppUpdateSnapshot>): AppUpdateSnapshot => {
    if (destroyed) {
      return getSnapshot();
    }
    snapshot = { ...snapshot, ...change, revision: snapshot.revision + 1 };
    for (const listener of listeners) {
      try {
        listener(getSnapshot());
      } catch {
        // 展示订阅失效不能使一个已成功的下载变成失败，或阻断安装状态机。
      }
    }
    return getSnapshot();
  };

  const fail = (error: AppUpdateError): AppUpdateSnapshot => publish({ phase: 'error', error });

  const restoreAfterInstallFailure = (): void => {
    const resume = resumeApplication;
    resumeApplication = undefined;
    try {
      resume?.();
    } catch {
      // 恢复失败仍保持错误状态，不能报告安装成功或自动重试退出。
    }
    fail('install-failed');
  };

  const unsubscribeInstallError = engine.onInstallError?.(() => {
    // updater 的同一 error 事件也用于检查与下载，只有启动安装期间才恢复暂停的业务。
    if (!destroyed && snapshot.phase === 'installing') {
      restoreAfterInstallFailure();
    }
  });

  const isCurrent = (generation: number): boolean =>
    !destroyed && generation === operationGeneration;

  const run = (
    name: OperationName,
    action: (generation: number) => Promise<AppUpdateSnapshot>
  ): Promise<AppUpdateSnapshot> => {
    const generation = ++operationGeneration;
    const promise = Promise.resolve()
      .then(() => (isCurrent(generation) ? action(generation) : getSnapshot()))
      .finally(() => {
        if (activeOperation?.promise === promise) {
          activeOperation = undefined;
        }
      });
    activeOperation = { name, promise };
    return promise;
  };

  const alreadyRunning = (name: OperationName): Promise<AppUpdateSnapshot> | undefined => {
    if (activeOperation?.name === name) {
      return activeOperation.promise;
    }
    if (destroyed || unavailableReason || activeOperation || snapshot.phase === 'installing') {
      return Promise.resolve(getSnapshot());
    }
    return undefined;
  };

  const check = (): Promise<AppUpdateSnapshot> => {
    const running = alreadyRunning('check');
    if (running) {
      return running;
    }
    if (snapshot.phase === 'downloaded') {
      return Promise.resolve(getSnapshot());
    }
    return run('check', async (generation) => {
      downloadedVersion = undefined;
      publish({
        phase: 'checking',
        targetVersion: undefined,
        releaseNotes: undefined,
        progress: undefined,
        error: undefined,
      });
      if (!isCurrent(generation)) {
        return getSnapshot();
      }
      if (!isStableAppVersion(currentVersion)) {
        return fail('invalid-release');
      }
      try {
        const release = await engine.check();
        if (!isCurrent(generation)) {
          return getSnapshot();
        }
        if (release === undefined) {
          return publish({ phase: 'up-to-date' });
        }
        const relation = compareStableAppVersions(currentVersion, release.version);
        if (relation === 'invalid') {
          return fail('invalid-release');
        }
        if (relation !== 'newer') {
          return publish({ phase: 'up-to-date' });
        }
        return publish({
          phase: 'available',
          targetVersion: release.version,
          releaseNotes: release.releaseNotes?.slice(0, MAX_RELEASE_NOTES_CHARACTERS),
        });
      } catch {
        return isCurrent(generation) ? fail('check-failed') : getSnapshot();
      }
    });
  };

  const download = (): Promise<AppUpdateSnapshot> => {
    const running = alreadyRunning('download');
    if (running) {
      return running;
    }
    const canRetry = snapshot.phase === 'error' && snapshot.error === 'download-failed';
    const targetVersion = snapshot.targetVersion;
    const canDownload = snapshot.phase === 'available' || canRetry;
    if (!canDownload || !targetVersion) {
      return Promise.resolve(getSnapshot());
    }
    return run('download', async (generation) => {
      downloadedVersion = undefined;
      publish({ phase: 'downloading', error: undefined, progress: undefined });
      if (!isCurrent(generation)) {
        return getSnapshot();
      }
      try {
        await engine.download((value) => {
          const progress = normalizeProgress(value);
          if (isCurrent(generation) && snapshot.phase === 'downloading' && progress) {
            publish({ progress });
          }
        });
        if (!isCurrent(generation)) {
          return getSnapshot();
        }
        downloadedVersion = targetVersion;
        return publish({ phase: 'downloaded', progress: undefined });
      } catch {
        return isCurrent(generation) ? fail('download-failed') : getSnapshot();
      }
    });
  };

  const install = (): Promise<AppUpdateSnapshot> => {
    const running = alreadyRunning('install');
    if (running) {
      return running;
    }
    const canRetry =
      snapshot.phase === 'error' &&
      (snapshot.error === 'save-failed' || snapshot.error === 'install-failed');
    const canInstall = snapshot.phase === 'downloaded' || canRetry;
    const hasMatchingDownload = downloadedVersion && downloadedVersion === snapshot.targetVersion;
    if (!canInstall || !hasMatchingDownload) {
      return Promise.resolve(getSnapshot());
    }
    return run('install', async (generation) => {
      try {
        const confirmed = await confirmInstall();
        if (!isCurrent(generation)) {
          return getSnapshot();
        }
        if (!confirmed) {
          return publish({ phase: 'downloaded', error: undefined });
        }
      } catch {
        return isCurrent(generation) ? fail('install-failed') : getSnapshot();
      }
      publish({ phase: 'preparing', error: undefined });
      if (!isCurrent(generation)) {
        return getSnapshot();
      }
      try {
        const resume = await prepareForInstall();
        if (!isCurrent(generation)) {
          return getSnapshot();
        }
        resumeApplication = resume;
      } catch {
        return isCurrent(generation) ? fail('save-failed') : getSnapshot();
      }
      publish({ phase: 'installing' });
      if (!isCurrent(generation)) {
        return getSnapshot();
      }
      try {
        await engine.install();
      } catch {
        if (isCurrent(generation)) {
          restoreAfterInstallFailure();
        }
      }
      return getSnapshot();
    });
  };

  return {
    getSnapshot,
    check,
    download,
    install,
    subscribe: (listener) => {
      if (!destroyed) {
        listeners.add(listener);
      }
      return () => listeners.delete(listener);
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      operationGeneration += 1;
      listeners.clear();
      unsubscribeInstallError?.();
      resumeApplication = undefined;
      engine.destroy();
    },
  };
};
