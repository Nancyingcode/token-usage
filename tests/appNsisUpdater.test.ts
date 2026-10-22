/**
 * @file 上游 NSIS 安装与缓存恢复回归
 * @description 保留真实安装标记和缓存验证逻辑，仅以临时文件替代网络下载并阻止安装器启动与退出。
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CancellationToken } from 'builder-util-runtime';
import type { UpdateCheckResult } from 'electron-updater';
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider';
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import { describe, expect, it, vi } from 'vitest';
import { createAppUpdateEngine } from '../src/main/appUpdateEngine';
import { AppNsisUpdater } from '../src/main/appNsisUpdater';

const installer = Buffer.from('isolated installer contents');
const installerName = 'Codex-Token-Usage-Setup-0.1.1-x64.exe';
const installerSha512 = createHash('sha512').update(installer).digest('base64');
const updateInfo = {
  version: '0.1.1',
  releaseDate: '2026-10-22T00:00:00.000Z',
  path: installerName,
  sha512: installerSha512,
  files: [{ url: installerName, sha512: installerSha512 }],
};

class IsolatedNsisUpdater extends AppNsisUpdater {
  launches = 0;
  transfers = 0;

  override async checkForUpdates(): Promise<UpdateCheckResult> {
    return { isUpdateAvailable: true, updateInfo, versionInfo: updateInfo };
  }

  override async downloadUpdate(cancellationToken = new CancellationToken()): Promise<string[]> {
    const provider = new GenericProvider(
      { provider: 'generic', url: 'https://unused.invalid/' },
      this,
      { platform: 'win32', isUseMultipleRangeRequest: false, executor: new ElectronHttpExecutor() }
    );
    return this.executeDownload({
      fileExtension: 'exe',
      fileInfo: {
        url: new URL(installerName, 'https://unused.invalid/'),
        info: updateInfo.files[0]!,
      },
      downloadUpdateOptions: {
        updateInfoAndProvider: { info: updateInfo, provider },
        requestHeaders: {},
        cancellationToken,
      },
      task: async (destination) => {
        this.transfers += 1;
        await writeFile(destination, installer);
      },
    });
  }

  protected override doInstall(): boolean {
    this.launches += 1;
    return true;
  }

  getDownloadHelper(): object | null {
    return this.downloadedUpdateHelper;
  }
}

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'app-nsis-updater-'));
  const appUpdateConfigPath = join(directory, 'app-update.yml');
  await writeFile(appUpdateConfigPath, JSON.stringify({ updaterCacheDirName: 'updates' }));
  const client = new IsolatedNsisUpdater(undefined, {
    version: '0.1.0',
    name: 'isolated-updater',
    isPackaged: true,
    appUpdateConfigPath,
    userDataPath: directory,
    baseCachePath: directory,
    whenReady: async () => undefined,
    relaunch: vi.fn(),
    quit: vi.fn(),
    onQuit: vi.fn(),
  });
  client.logger = null;
  client.verifyUpdateCodeSignature = async () => null;
  const verifySignature = vi.fn(async (_publisher: string, path: string, expected: string) => {
    if (
      createHash('sha512')
        .update(await readFile(path))
        .digest('base64') !== expected
    ) {
      throw new Error('Fixture installer hash changed.');
    }
  });
  const engine = createAppUpdateEngine(client, 'Fixture Publisher', verifySignature);
  return { client, engine, directory, verifySignature };
};

describe('real NSIS updater recovery', () => {
  it('starts a real BaseUpdater installation on the first explicit retry after an async failure', async () => {
    const { client, engine, directory } = await fixture();
    try {
      await engine.check();
      await engine.download(vi.fn());
      // 只拦住上游排定的 Electron 退出；quitAndInstall/install 与其去重标记仍使用真实实现。
      vi.useFakeTimers({ toFake: ['setImmediate'] });
      await engine.install();
      client.emit('error', new Error('Isolated asynchronous spawn failure.'));
      await engine.install();
      expect(client.launches).toBe(2);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      engine.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each(['check', 'download'] as const)(
    'rebuilds the upstream helper on explicit %s after a changed cached installer',
    async (operation) => {
      const { client, engine, directory } = await fixture();
      try {
        await engine.check();
        await engine.download(vi.fn());
        const previousHelper = client.getDownloadHelper();
        const cachedInstaller = join(directory, 'updates', 'pending', installerName);
        await writeFile(cachedInstaller, 'corrupted installer');
        await expect(engine.install()).rejects.toThrow('hash changed');
        expect(client.launches).toBe(0);
        if (operation === 'check') await engine.check();
        await engine.download(vi.fn());
        expect(client.getDownloadHelper()).not.toBe(previousHelper);
        expect(client.transfers).toBe(2);
        expect(await readFile(cachedInstaller)).toEqual(installer);
      } finally {
        engine.destroy();
        await rm(directory, { recursive: true, force: true });
      }
    }
  );

  it('retains the upstream installation path when only the verification tool failed temporarily', async () => {
    const { client, engine, directory, verifySignature } = await fixture();
    try {
      await engine.check();
      await engine.download(vi.fn());
      const helper = client.getDownloadHelper();
      verifySignature.mockRejectedValueOnce(new Error('Temporary verification tool failure.'));
      await expect(engine.install()).rejects.toThrow('Temporary verification tool failure.');
      vi.useFakeTimers({ toFake: ['setImmediate'] });
      await engine.install();
      expect(client.getDownloadHelper()).toBe(helper);
      expect(client.launches).toBe(1);
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
      engine.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
