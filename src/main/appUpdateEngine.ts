/**
 * @file electron-updater 适配边界
 * @description 固定离线 NSIS 产物契约，下载后包含缓存命中均校验发布者签名，禁止隐式安装。
 */
import type { AppNsisUpdater } from './appNsisUpdater';
import type { AppUpdateEngine } from './appUpdateService';
import type { AppUpdateProgress } from '../shared/appUpdateTypes';
import { verifyAppUpdateSignature } from './appUpdateSignature';

export type UpdateClient = Pick<
  AppNsisUpdater,
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'allowPrerelease'
  | 'allowDowngrade'
  | 'disableWebInstaller'
  | 'checkForUpdates'
  | 'downloadUpdate'
  | 'verifyUpdateCodeSignature'
  | 'quitAndInstall'
  | 'resetInstallAttempt'
  | 'forgetDownloadedUpdate'
  | 'on'
  | 'removeListener'
>;

const SHA512_BASE64_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const RELEASE_NOTES_MAX_LENGTH = 12_000;

export const createAppUpdateEngine = (
  client: UpdateClient,
  publisher: string,
  verifySignature = verifyAppUpdateSignature
): AppUpdateEngine => {
  Object.assign(client, {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    allowPrerelease: false,
    allowDowngrade: false,
    disableWebInstaller: true,
  });

  // 每个应用实例仅有一个适配器；新检查使下载批准失效，销毁后不再向外报告进度或安装错误。
  let eligible = false;
  let verified = false;
  let verifiedFile: string | undefined;
  let expectedSha512 = '';
  let destroyed = false;
  let installing = false;
  let shouldForgetDownloadedUpdate = false;
  let cancellationToken: Parameters<UpdateClient['downloadUpdate']>[0];
  let cancelDownload: (() => void) | undefined;
  const installErrors = new Set<() => void>();
  const onError = (): void => {
    if (!destroyed && installing) {
      installing = false;
      client.resetInstallAttempt();
      installErrors.forEach((listener) => listener());
    }
  };
  client.on('error', onError);

  const assertActive = (): void => {
    if (destroyed || !publisher.trim()) throw new Error('Update publisher is unavailable.');
  };

  const forgetFailedDownload = (): void => {
    if (shouldForgetDownloadedUpdate) {
      client.forgetDownloadedUpdate();
      shouldForgetDownloadedUpdate = false;
    }
  };

  const verifyInstaller = async (filename: string, includeUpstream = false): Promise<void> => {
    try {
      if (includeUpstream) {
        const signatureError = await client.verifyUpdateCodeSignature([publisher], filename);
        assertActive();
        if (signatureError !== null) throw new Error('Update signature verification failed.');
      }
      await verifySignature(publisher, filename, expectedSha512);
    } catch (error) {
      // 只在下一次明确检查或下载时重建缓存状态；临时验证工具故障后的安装重试仍可使用同一包。
      shouldForgetDownloadedUpdate = true;
      throw error;
    }
  };

  return {
    check: async () => {
      assertActive();
      forgetFailedDownload();
      eligible = false;
      verified = false;
      verifiedFile = undefined;
      expectedSha512 = '';
      const result = await client.checkForUpdates();
      assertActive();
      if (!result?.isUpdateAvailable) return undefined;
      const info = result.updateInfo;
      const expectedFilename = `Codex-Token-Usage-Setup-${info.version}-x64.exe`;
      const file = info.files[0];
      if (
        info.files.length !== 1 ||
        !file ||
        file.url !== expectedFilename ||
        !SHA512_BASE64_PATTERN.test(file.sha512) ||
        'packages' in info
      ) {
        throw new Error('Unsupported release artifact.');
      }
      const notes = typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined;
      expectedSha512 = file.sha512;
      cancellationToken = result.cancellationToken;
      cancelDownload = () => cancellationToken?.cancel();
      eligible = true;
      return { version: info.version, releaseNotes: notes?.slice(0, RELEASE_NOTES_MAX_LENGTH) };
    },
    download: async (onProgress) => {
      assertActive();
      if (!eligible) throw new Error('No checked release is available.');
      verified = false;
      forgetFailedDownload();
      const progress = (value: AppUpdateProgress): void => {
        if (!destroyed) onProgress(value);
      };
      client.on('download-progress', progress);
      try {
        const files = await client.downloadUpdate(cancellationToken);
        assertActive();
        if (files.length !== 1 || !files[0]) throw new Error('Unexpected downloaded files.');
        // 上游缓存命中会跳过下载任务，必须再次验证签名，避免将缓存等同于已信任的安装包。
        await verifyInstaller(files[0], true);
        assertActive();
        verifiedFile = files[0];
        verified = true;
      } finally {
        client.removeListener('download-progress', progress);
      }
    },
    install: async () => {
      assertActive();
      if (!verified || !verifiedFile) throw new Error('No verified installer is available.');
      await verifyInstaller(verifiedFile);
      assertActive();
      installing = true;
      try {
        client.quitAndInstall(true, true);
      } catch (error) {
        installing = false;
        client.resetInstallAttempt();
        throw error;
      }
    },
    onInstallError: (listener) => {
      installErrors.add(listener);
      return () => installErrors.delete(listener);
    },
    destroy: () => {
      destroyed = true;
      eligible = false;
      verified = false;
      verifiedFile = undefined;
      cancelDownload?.();
      installErrors.clear();
      client.removeListener('error', onError);
    },
  };
};
