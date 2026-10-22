/**
 * @file 应用更新契约
 * @description 主进程拥有更新状态；跨进程只传递展示数据，不传递下载地址或可执行路径。
 */
export type AppUpdatePhase =
  | 'unavailable'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'preparing'
  | 'installing'
  | 'error';

export type AppUpdateError =
  'check-failed' | 'invalid-release' | 'download-failed' | 'install-failed' | 'save-failed';

export type AppUpdateUnavailableReason = 'development' | 'platform' | 'publisher-missing';

export interface AppUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface AppUpdateSnapshot {
  revision: number;
  phase: AppUpdatePhase;
  currentVersion: string;
  targetVersion?: string;
  releaseNotes?: string;
  progress?: AppUpdateProgress;
  error?: AppUpdateError;
  unavailableReason?: AppUpdateUnavailableReason;
}

export interface AppUpdateApi {
  get: () => Promise<AppUpdateSnapshot>;
  check: () => Promise<AppUpdateSnapshot>;
  download: () => Promise<AppUpdateSnapshot>;
  install: () => Promise<AppUpdateSnapshot>;
  openReleasePage: () => Promise<void>;
  onUpdated: (listener: (snapshot: AppUpdateSnapshot) => void) => () => void;
}
