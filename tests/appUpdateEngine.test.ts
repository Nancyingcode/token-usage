/** @file 更新适配器边界回归，使用假客户端，不联网、不执行安装器。 */
import { describe, expect, it, vi } from 'vitest';
import { createAppUpdateEngine, type UpdateClient } from '../src/main/appUpdateEngine';

const release = () => ({
  isUpdateAvailable: true,
  updateInfo: {
    version: '0.1.1',
    files: [
      { url: 'Codex-Token-Usage-Setup-0.1.1-x64.exe', sha512: Buffer.alloc(64).toString('base64') },
    ],
    releaseNotes: '修复问题',
  },
});

const fixture = () => {
  const listeners = new Map<string, (value: never) => void>();
  const client = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: true,
    allowDowngrade: true,
    disableWebInstaller: false,
    checkForUpdates: vi.fn().mockResolvedValue(release()),
    downloadUpdate: vi.fn().mockResolvedValue(['C:\\isolated\\update.exe']),
    verifyUpdateCodeSignature: vi.fn().mockResolvedValue(null),
    quitAndInstall: vi.fn(),
    resetInstallAttempt: vi.fn(),
    forgetDownloadedUpdate: vi.fn(),
    on: vi.fn((event: string, listener: (value: never) => void) => listeners.set(event, listener)),
    removeListener: vi.fn((event: string) => listeners.delete(event)),
  };
  const verifySignature = vi.fn().mockResolvedValue(undefined);
  const engine = createAppUpdateEngine(
    client as unknown as UpdateClient,
    'Example Publisher',
    verifySignature
  );
  return { client, engine, listeners, verifySignature };
};

describe('electron updater boundary', () => {
  it('disables all implicit download/install paths and checks before explicit download', async () => {
    const { client, engine } = fixture();
    expect(client.autoDownload).toBe(false);
    expect(client.autoInstallOnAppQuit).toBe(false);
    expect(client.allowPrerelease).toBe(false);
    expect(client.allowDowngrade).toBe(false);
    expect(client.disableWebInstaller).toBe(true);
    await expect(engine.download(vi.fn())).rejects.toThrow();
    expect(client.downloadUpdate).not.toHaveBeenCalled();
    await expect(engine.check()).resolves.toEqual({ version: '0.1.1', releaseNotes: '修复问题' });
    expect(client.downloadUpdate).not.toHaveBeenCalled();
    await engine.download(vi.fn());
    expect(client.verifyUpdateCodeSignature).toHaveBeenCalledExactlyOnceWith(
      ['Example Publisher'],
      'C:\\isolated\\update.exe'
    );
    await engine.install();
    expect(client.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it.each([
    'https://evil.example/update.exe',
    '../other.exe',
    'Codex-Token-Usage-Setup-0.1.0-x64.exe',
  ])('rejects unexpected metadata file %s', async (url) => {
    const { client, engine } = fixture();
    const info = release();
    info.updateInfo.files[0]!.url = url;
    client.checkForUpdates.mockResolvedValue(info);
    await expect(engine.check()).rejects.toThrow();
    await expect(engine.download(vi.fn())).rejects.toThrow();
    expect(client.downloadUpdate).not.toHaveBeenCalled();
  });

  it('refuses cached or fresh unsigned downloads and never installs after failure', async () => {
    const { client, engine } = fixture();
    await engine.check();
    client.verifyUpdateCodeSignature.mockResolvedValue('invalid signature');
    await expect(engine.download(vi.fn())).rejects.toThrow();
    await expect(engine.install()).rejects.toThrow();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
    client.verifyUpdateCodeSignature.mockResolvedValue(null);
    await engine.download(vi.fn());
    expect(client.forgetDownloadedUpdate).toHaveBeenCalledOnce();
  });

  it('does not misrepresent a release excluded by updater platform policy as downloadable', async () => {
    const { client, engine } = fixture();
    client.checkForUpdates.mockResolvedValue({ ...release(), isUpdateAvailable: false });
    await expect(engine.check()).resolves.toBeUndefined();
    await expect(engine.download(vi.fn())).rejects.toThrow();
  });

  it('invalidates downloaded approval on a new check and on destruction', async () => {
    const { engine, client } = fixture();
    await engine.check();
    await engine.download(vi.fn());
    await engine.check();
    await expect(engine.install()).rejects.toThrow();
    engine.destroy();
    await expect(engine.check()).rejects.toThrow();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });

  it('reports installer startup errors and permits another explicit attempt', async () => {
    const { engine, client, listeners } = fixture();
    const failed = vi.fn();
    engine.onInstallError?.(failed);
    await engine.check();
    await engine.download(vi.fn());
    await engine.install();
    listeners.get('error')?.(new Error('elevation rejected') as never);
    expect(failed).toHaveBeenCalledOnce();
    await expect(engine.install()).resolves.toBeUndefined();
    expect(client.quitAndInstall).toHaveBeenCalledTimes(2);
  });

  it('fails closed when strict verification fails even if the upstream verifier accepts', async () => {
    const { engine, verifySignature, client } = fixture();
    await engine.check();
    verifySignature.mockRejectedValue(new Error('verification unavailable'));
    await expect(engine.download(vi.fn())).rejects.toThrow();
    await expect(engine.install()).rejects.toThrow();
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });

  it('rechecks the downloaded file before each explicit installation', async () => {
    const { engine, verifySignature, client } = fixture();
    await engine.check();
    await engine.download(vi.fn());
    verifySignature.mockRejectedValue(new Error('cache replaced'));
    await expect(engine.install()).rejects.toThrow('cache replaced');
    expect(verifySignature).toHaveBeenCalledTimes(2);
    expect(client.quitAndInstall).not.toHaveBeenCalled();
  });
});
