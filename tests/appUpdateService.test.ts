/**
 * @file 应用更新授权与状态回归
 * @description 使用可控端口验证真实服务，不下载、执行安装器或访问用户数据。
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createAppUpdateService,
  type AppUpdateEngine,
  type AppUpdateRelease,
} from '../src/main/appUpdateService';
import type { AppUpdateProgress } from '../src/shared/appUpdateTypes';

const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createFixture = () => {
  let installErrorListener: (() => void) | undefined;
  const unsubscribeError = vi.fn();
  const engine = {
    check: vi.fn<() => Promise<AppUpdateRelease | undefined>>().mockResolvedValue({
      version: '0.10.0',
      releaseNotes: 'A stable release.',
    }),
    download: vi
      .fn<(progress: (value: AppUpdateProgress) => void) => Promise<void>>()
      .mockResolvedValue(),
    install: vi.fn(),
    destroy: vi.fn(),
    onInstallError: vi.fn((listener: () => void) => {
      installErrorListener = listener;
      return unsubscribeError;
    }),
  } satisfies AppUpdateEngine;
  const resume = vi.fn();
  const confirmInstall = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
  const prepareForInstall = vi.fn<() => Promise<() => void>>().mockResolvedValue(resume);
  const service = createAppUpdateService({
    currentVersion: '0.9.0',
    engine,
    confirmInstall,
    prepareForInstall,
  });
  return {
    service,
    engine,
    resume,
    confirmInstall,
    prepareForInstall,
    unsubscribeError,
    emitInstallError: () => installErrorListener?.(),
  };
};

const makeDownloaded = async (fixture: ReturnType<typeof createFixture>): Promise<void> => {
  await fixture.service.check();
  await fixture.service.download();
};

describe('application update service', () => {
  it('checks without downloading or installing and requires explicit calls', async () => {
    const fixture = createFixture();
    expect(fixture.service.getSnapshot()).toMatchObject({ phase: 'idle', currentVersion: '0.9.0' });
    expect(await fixture.service.download()).toMatchObject({ phase: 'idle' });
    expect(await fixture.service.install()).toMatchObject({ phase: 'idle' });
    expect(await fixture.service.check()).toMatchObject({
      phase: 'available',
      targetVersion: '0.10.0',
      releaseNotes: 'A stable release.',
    });
    expect(fixture.engine.download).not.toHaveBeenCalled();
    expect(fixture.engine.install).not.toHaveBeenCalled();
    expect(await fixture.service.download()).toMatchObject({ phase: 'downloaded' });
    expect(fixture.confirmInstall).not.toHaveBeenCalled();
    expect(fixture.engine.install).not.toHaveBeenCalled();
    expect(await fixture.service.install()).toMatchObject({ phase: 'installing' });
    expect(fixture.confirmInstall).toHaveBeenCalledOnce();
    expect(fixture.prepareForInstall).toHaveBeenCalledOnce();
    expect(fixture.engine.install).toHaveBeenCalledOnce();
    expect(fixture.resume).not.toHaveBeenCalled();
  });

  it.each(['development', 'platform', 'publisher-missing'] as const)(
    'never calls the updater when unavailable because of %s',
    async (unavailableReason) => {
      const fixture = createFixture();
      const service = createAppUpdateService({
        currentVersion: '0.9.0',
        engine: fixture.engine,
        unavailableReason,
        confirmInstall: fixture.confirmInstall,
        prepareForInstall: fixture.prepareForInstall,
      });
      await service.check();
      await service.download();
      expect(await service.install()).toMatchObject({ phase: 'unavailable', unavailableReason });
      expect(fixture.engine.check).not.toHaveBeenCalled();
      expect(fixture.engine.download).not.toHaveBeenCalled();
      expect(fixture.engine.install).not.toHaveBeenCalled();
    }
  );

  it.each(['0.9.0', '0.8.9'])('does not offer same or older version %s', async (version) => {
    const fixture = createFixture();
    fixture.engine.check.mockResolvedValue({ version });
    expect(await fixture.service.check()).toMatchObject({ phase: 'up-to-date' });
    await fixture.service.download();
    expect(fixture.engine.download).not.toHaveBeenCalled();
  });

  it('reports no release as up to date', async () => {
    const fixture = createFixture();
    fixture.engine.check.mockResolvedValue(undefined);
    expect(await fixture.service.check()).toMatchObject({ phase: 'up-to-date' });
  });

  it.each(['0.10.0-beta.1', '0.10.0+metadata', 'v0.10.0', 'garbage'])(
    'rejects unsupported release %s before any download',
    async (version) => {
      const fixture = createFixture();
      fixture.engine.check.mockResolvedValue({ version });
      expect(await fixture.service.check()).toMatchObject({
        phase: 'error',
        error: 'invalid-release',
      });
      await fixture.service.download();
      await fixture.service.install();
      expect(fixture.engine.download).not.toHaveBeenCalled();
      expect(fixture.engine.install).not.toHaveBeenCalled();
    }
  );

  it('refuses an unsupported current version', async () => {
    const fixture = createFixture();
    const service = createAppUpdateService({
      currentVersion: '0.9.0-beta',
      engine: fixture.engine,
      confirmInstall: fixture.confirmInstall,
      prepareForInstall: fixture.prepareForInstall,
    });
    expect(await service.check()).toMatchObject({ phase: 'error', error: 'invalid-release' });
    expect(fixture.engine.check).not.toHaveBeenCalled();
  });

  it('coalesces duplicate checks and never queues a download without a release', async () => {
    const fixture = createFixture();
    const request = deferred<AppUpdateRelease | undefined>();
    fixture.engine.check.mockReturnValue(request.promise);
    const first = fixture.service.check();
    const duplicate = fixture.service.check();
    await fixture.service.download();
    request.resolve({ version: '0.10.0' });
    await Promise.all([first, duplicate]);
    expect(fixture.engine.check).toHaveBeenCalledOnce();
    expect(fixture.engine.download).not.toHaveBeenCalled();
  });

  it('keeps the checked release stable while a download is running', async () => {
    const fixture = createFixture();
    await fixture.service.check();
    const transfer = deferred<void>();
    fixture.engine.download.mockReturnValue(transfer.promise);
    const first = fixture.service.download();
    const duplicate = fixture.service.download();
    await fixture.service.check();
    await fixture.service.install();
    transfer.resolve();
    await Promise.all([first, duplicate]);
    expect(fixture.engine.check).toHaveBeenCalledOnce();
    expect(fixture.engine.download).toHaveBeenCalledOnce();
    expect(fixture.engine.install).not.toHaveBeenCalled();
    expect(fixture.service.getSnapshot()).toMatchObject({
      phase: 'downloaded',
      targetVersion: '0.10.0',
    });
  });

  it('cancels the restart confirmation without preparing or installing', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    fixture.confirmInstall.mockResolvedValue(false);
    expect(await fixture.service.install()).toMatchObject({ phase: 'downloaded' });
    expect(fixture.prepareForInstall).not.toHaveBeenCalled();
    expect(fixture.engine.install).not.toHaveBeenCalled();
  });

  it('coalesces install requests through confirmation and save preparation', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    const confirmation = deferred<boolean>();
    const preparation = deferred<() => void>();
    fixture.confirmInstall.mockReturnValue(confirmation.promise);
    fixture.prepareForInstall.mockReturnValue(preparation.promise);
    const first = fixture.service.install();
    const duplicate = fixture.service.install();
    await Promise.resolve();
    expect(fixture.engine.install).not.toHaveBeenCalled();
    confirmation.resolve(true);
    await Promise.resolve();
    expect(fixture.engine.install).not.toHaveBeenCalled();
    preparation.resolve(fixture.resume);
    await Promise.all([first, duplicate]);
    expect(fixture.confirmInstall).toHaveBeenCalledOnce();
    expect(fixture.prepareForInstall).toHaveBeenCalledOnce();
    expect(fixture.engine.install).toHaveBeenCalledOnce();
  });

  it('does not start installation if pending writes cannot be saved', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    fixture.prepareForInstall.mockRejectedValueOnce(new Error('private path'));
    expect(await fixture.service.install()).toMatchObject({ phase: 'error', error: 'save-failed' });
    expect(fixture.engine.install).not.toHaveBeenCalled();
    expect(JSON.stringify(fixture.service.getSnapshot())).not.toContain('private path');
    expect(await fixture.service.install()).toMatchObject({ phase: 'installing' });
  });

  it('resumes the application after a synchronous installation startup failure', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    fixture.engine.install.mockImplementationOnce(() => {
      throw new Error('cannot execute');
    });
    expect(await fixture.service.install()).toMatchObject({
      phase: 'error',
      error: 'install-failed',
    });
    expect(fixture.resume).toHaveBeenCalledOnce();
    expect(await fixture.service.install()).toMatchObject({ phase: 'installing' });
  });

  it('resumes only once on an asynchronous updater installation error', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    await fixture.service.install();
    fixture.emitInstallError();
    fixture.emitInstallError();
    expect(fixture.resume).toHaveBeenCalledOnce();
    expect(fixture.service.getSnapshot()).toMatchObject({
      phase: 'error',
      error: 'install-failed',
    });
  });

  it('waits for asynchronous installation verification and restores on rejection', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    const startup = deferred<void>();
    fixture.engine.install.mockReturnValueOnce(startup.promise);
    const installing = fixture.service.install();
    await vi.waitFor(() => expect(fixture.engine.install).toHaveBeenCalledOnce());
    startup.reject(new Error('private installer path'));
    expect(await installing).toMatchObject({ phase: 'error', error: 'install-failed' });
    expect(fixture.resume).toHaveBeenCalledOnce();
    expect(JSON.stringify(fixture.service.getSnapshot())).not.toContain('private installer path');
    expect(await fixture.service.install()).toMatchObject({ phase: 'installing' });
  });

  it('ignores a late installation rejection after application destruction', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    const startup = deferred<void>();
    fixture.engine.install.mockReturnValueOnce(startup.promise);
    const installing = fixture.service.install();
    await vi.waitFor(() => expect(fixture.engine.install).toHaveBeenCalledOnce());
    fixture.service.destroy();
    const snapshot = fixture.service.getSnapshot();
    startup.reject(new Error('late failure'));
    await installing;
    expect(fixture.service.getSnapshot()).toEqual(snapshot);
    expect(fixture.resume).not.toHaveBeenCalled();
  });

  it('does not misclassify updater check/download errors as installation failures', async () => {
    const fixture = createFixture();
    fixture.emitInstallError();
    expect(fixture.service.getSnapshot().phase).toBe('idle');
    fixture.engine.check.mockRejectedValueOnce(new Error('sensitive request'));
    expect(await fixture.service.check()).toMatchObject({ phase: 'error', error: 'check-failed' });
    expect(await fixture.service.check()).toMatchObject({ phase: 'available' });
    fixture.engine.download.mockRejectedValueOnce(new Error('sensitive path'));
    expect(await fixture.service.download()).toMatchObject({
      phase: 'error',
      error: 'download-failed',
    });
    expect(JSON.stringify(fixture.service.getSnapshot())).not.toContain('sensitive');
    expect(await fixture.service.download()).toMatchObject({ phase: 'downloaded' });
  });

  it('publishes monotonic cloned snapshots and bounded finite download progress', async () => {
    const fixture = createFixture();
    const revisions: number[] = [];
    fixture.service.subscribe((value) => {
      revisions.push(value.revision);
      const receivedProgress = value.progress;
      if (receivedProgress) {
        receivedProgress.percent = -1;
      }
    });
    await fixture.service.check();
    fixture.engine.download.mockImplementation(async (progress) => {
      progress({ percent: 150, transferred: 200, total: 100 });
      expect(fixture.service.getSnapshot().progress).toEqual({
        percent: 100,
        transferred: 100,
        total: 100,
      });
      progress({ percent: Number.NaN, transferred: 0, total: Number.POSITIVE_INFINITY });
      expect(fixture.service.getSnapshot().progress).toEqual({
        percent: 100,
        transferred: 100,
        total: 100,
      });
    });
    await fixture.service.download();
    expect(
      revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]!)
    ).toBe(true);
    const value = fixture.service.getSnapshot();
    value.targetVersion = '99.0.0';
    expect(fixture.service.getSnapshot().targetVersion).toBe('0.10.0');
  });

  it('ignores late progress after download failure and a newer check', async () => {
    const fixture = createFixture();
    await fixture.service.check();
    let oldProgress: ((progress: AppUpdateProgress) => void) | undefined;
    fixture.engine.download.mockImplementationOnce(async (progress) => {
      oldProgress = progress;
      throw new Error('download failed');
    });
    await fixture.service.download();
    fixture.engine.check.mockResolvedValue({ version: '0.11.0' });
    await fixture.service.check();
    oldProgress?.({ percent: 90, transferred: 90, total: 100 });
    expect(fixture.service.getSnapshot()).toMatchObject({
      phase: 'available',
      targetVersion: '0.11.0',
    });
    expect(fixture.service.getSnapshot().progress).toBeUndefined();
    await fixture.service.install();
    expect(fixture.engine.install).not.toHaveBeenCalled();
  });

  it('destroy cancels the engine and ignores late results without installing on ordinary exit', async () => {
    const fixture = createFixture();
    const check = deferred<AppUpdateRelease | undefined>();
    fixture.engine.check.mockReturnValue(check.promise);
    const listener = vi.fn();
    fixture.service.subscribe(listener);
    const running = fixture.service.check();
    await Promise.resolve();
    fixture.service.destroy();
    const snapshot = fixture.service.getSnapshot();
    listener.mockClear();
    check.resolve({ version: '0.10.0' });
    await running;
    await fixture.service.download();
    await fixture.service.install();
    fixture.service.destroy();
    expect(fixture.service.getSnapshot()).toEqual(snapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(fixture.engine.destroy).toHaveBeenCalledOnce();
    expect(fixture.unsubscribeError).toHaveBeenCalledOnce();
    expect(fixture.engine.install).not.toHaveBeenCalled();
  });

  it('does not launch after destruction during the confirmation or prepare await', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    const preparation = deferred<() => void>();
    fixture.prepareForInstall.mockReturnValue(preparation.promise);
    const installing = fixture.service.install();
    await vi.waitFor(() => expect(fixture.prepareForInstall).toHaveBeenCalledOnce());
    fixture.service.destroy();
    preparation.resolve(fixture.resume);
    await installing;
    expect(fixture.engine.install).not.toHaveBeenCalled();
  });

  it('does not prepare after an approval resolves following destruction', async () => {
    const fixture = createFixture();
    await makeDownloaded(fixture);
    const confirmation = deferred<boolean>();
    fixture.confirmInstall.mockReturnValue(confirmation.promise);
    const installing = fixture.service.install();
    await Promise.resolve();
    fixture.service.destroy();
    confirmation.resolve(true);
    await installing;
    expect(fixture.prepareForInstall).not.toHaveBeenCalled();
    expect(fixture.engine.install).not.toHaveBeenCalled();
  });

  it('does not download if a state subscriber destroys the service', async () => {
    const fixture = createFixture();
    await fixture.service.check();
    fixture.service.subscribe((value) => {
      if (value.phase === 'downloading') {
        fixture.service.destroy();
      }
    });
    await fixture.service.download();
    expect(fixture.engine.download).not.toHaveBeenCalled();
  });
});
