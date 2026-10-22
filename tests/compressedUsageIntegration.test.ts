import { mkdir, mkdtemp, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApplicationRuntime, type ApplicationRuntime } from '../src/main/applicationRuntime';
import { createBudgetRuntime } from '../src/main/budgetRuntime';
import { createBudgetStore } from '../src/main/budgetStore';
import { createCompressedSessionStore } from '../src/main/compressedSessionStore';
import { createCompressedUsageService } from '../src/main/compressedUsageService';
import { createCostOptimizationCacheStore } from '../src/main/costOptimizationCacheStore';
import { createCostOptimizationConfigStore } from '../src/main/costOptimizationConfigStore';
import { createCostOptimizationRuntime } from '../src/main/costOptimizationRuntime';
import { USAGE_SCAN_INTERVAL_MS } from '../src/main/usageMonitor';
import { createUsageRuntime } from '../src/main/usageRuntime';
import { createUsageScanner } from '../src/main/usageScanner';
import { decompressZstdFile } from '../src/main/zstdFrames';
import { compressZstd, skippableZstdFrame } from './nodeHelpers/zstdFixtures';

const sessionContent = (tokens: number): string =>
  [
    JSON.stringify({ type: 'session_meta', payload: { cwd: 'C:\\fixture-project' } }),
    JSON.stringify({
      type: 'event_msg',
      timestamp: '2026-10-21T00:00:00Z',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: tokens, total_tokens: tokens } },
      },
    }),
    JSON.stringify({ type: 'message', payload: { text: '保留非 Token 内容 😀' } }),
  ].join('\r\n');

describe('compressed usage integration', () => {
  let directory = '';
  let sessionsDir = '';
  let storageDir = '';
  const applications: ApplicationRuntime[] = [];

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'codex-compressed-integration-'));
    sessionsDir = join(directory, 'sessions');
    storageDir = join(directory, 'user-data', 'imported-sessions');
    await mkdir(sessionsDir);
  });

  afterEach(async () => {
    applications.splice(0).forEach((application) => application.stop());
    const checked = resolve(directory);
    if (
      dirname(checked) !== resolve(tmpdir()) ||
      !basename(checked).startsWith('codex-compressed-integration-')
    ) {
      throw new Error('Unexpected integration fixture directory.');
    }
    await rm(checked, { recursive: true, force: true });
  });

  const setup = async () => {
    const decompressFile = vi.fn(decompressZstdFile);
    const scanner = createUsageScanner();
    const service = createCompressedUsageService({
      initialSessionsDir: sessionsDir,
      store: createCompressedSessionStore({ storageDir, decompressFile }),
      scanCycle: (root) =>
        scanner.scanCycle({
          sessionsDir: root,
          sessionIndexPath: join(directory, 'session_index.jsonl'),
        }),
    });
    let timerCallback: (() => void) | undefined;
    const setIntervalFn = vi.fn((callback: () => void) => {
      timerCallback = callback;
      return 1;
    });
    let currentTime = 0;
    const runtime = createUsageRuntime({
      initialSessionsDir: sessionsDir,
      scanCycle: service.scanCycle,
      subscribeExternalCycle: service.subscribeCycle,
      onDirectoryChange: service.setDirectory,
      onStop: service.stop,
      now: () => currentTime,
      setIntervalFn,
      clearIntervalFn: vi.fn(),
    });
    const budgetRuntime = createBudgetRuntime({
      store: createBudgetStore(join(directory, 'budget.json')),
      defaultPricing: [],
      notify: vi.fn(),
    });
    const costCacheStore = createCostOptimizationCacheStore(join(directory, 'cost-cache.json'));
    vi.spyOn(costCacheStore, 'save');
    const costRuntime = createCostOptimizationRuntime({
      configStore: createCostOptimizationConfigStore(join(directory, 'cost-settings.json')),
      cacheStore: costCacheStore,
      sessionsDir,
      defaultPricing: [],
    });
    const applyUsageCycle = vi.spyOn(costRuntime, 'applyUsageCycle');
    const application = createApplicationRuntime({
      usageRuntime: runtime,
      budgetRuntime,
      costRuntime,
    });
    applications.push(application);
    await application.initialize();
    const expectCostTokens = async (totalTokens: number): Promise<void> => {
      await vi.waitFor(() => {
        expect(costRuntime.getSnapshot({ period: 'total' })).toMatchObject({
          dataState: 'fresh',
          coverage: { totalTokens, unpricedTokens: totalTokens },
        });
      });
    };
    return {
      service,
      runtime,
      application,
      decompressFile,
      setIntervalFn,
      expectCostTokens,
      costCacheStore,
      costRuntime,
      applyUsageCycle,
      tick: () => {
        currentTime += USAGE_SCAN_INTERVAL_MS;
        timerCallback?.();
      },
    };
  };

  it('reuses the persisted live and imported cost index on restart and unchanged refresh', async () => {
    await writeFile(join(sessionsDir, 'live.jsonl'), sessionContent(20));
    await writeFile(join(sessionsDir, 'history.jsonl.zst'), compressZstd(sessionContent(30)));
    const fixture = await setup();
    await fixture.application.getInitialUsage();
    await fixture.service.refresh();
    await fixture.expectCostTokens(50);
    fixture.application.stop();
    const persistedIndex = await readFile(join(directory, 'cost-cache.json'));

    const restarted = await setup();
    await restarted.application.waitForCostOptimization();
    const cachedSnapshot = restarted.costRuntime.getSnapshot({ period: 'total' });
    const initialUsage = await restarted.application.getInitialUsage();
    await vi.waitFor(() => expect(restarted.applyUsageCycle).toHaveBeenCalledOnce());
    await restarted.applyUsageCycle.mock.results[0].value;

    expect(initialUsage.summary.totals.totalTokens).toBe(50);
    expect(restarted.costRuntime.getSnapshot({ period: 'total' })).toBe(cachedSnapshot);
    expect(restarted.costCacheStore.save).not.toHaveBeenCalled();
    expect(restarted.decompressFile).not.toHaveBeenCalled();

    await restarted.application.refresh();
    await vi.waitFor(() => expect(restarted.applyUsageCycle).toHaveBeenCalledTimes(2));
    await restarted.applyUsageCycle.mock.results[1].value;
    expect(restarted.costRuntime.getSnapshot({ period: 'total' })).toBe(cachedSnapshot);
    expect(restarted.costCacheStore.save).not.toHaveBeenCalled();
    expect(await readFile(join(directory, 'cost-cache.json'))).toEqual(persistedIndex);
  });

  it('reconciles added, changed and removed live sources with imported history after restart', async () => {
    const retained = join(sessionsDir, 'retained.jsonl');
    const updated = join(sessionsDir, 'updated.jsonl');
    const removed = join(sessionsDir, 'removed.jsonl');
    const added = join(sessionsDir, 'added.jsonl');
    await writeFile(retained, sessionContent(10));
    await writeFile(updated, sessionContent(20));
    await writeFile(removed, sessionContent(30));
    await writeFile(join(sessionsDir, 'history.jsonl.zst'), compressZstd(sessionContent(40)));
    const fixture = await setup();
    await fixture.application.getInitialUsage();
    await fixture.service.refresh();
    await fixture.expectCostTokens(100);
    fixture.application.stop();
    await writeFile(updated, sessionContent(200));
    await writeFile(added, sessionContent(50));
    await unlink(removed);

    const restarted = await setup();
    expect((await restarted.application.getInitialUsage()).summary.totals.totalTokens).toBe(300);
    await restarted.expectCostTokens(300);
    expect(restarted.costCacheStore.save).toHaveBeenCalledOnce();
    expect(restarted.costRuntime.getSnapshot({ period: 'total' }).cacheStats).toEqual({
      upsertedSources: 2,
      removedSources: 1,
      reusedSources: 2,
    });
    expect(restarted.decompressFile).not.toHaveBeenCalled();
  });

  it('keeps startup, interval, focus and live refresh separate from manual import and updates the cost index', async () => {
    const plain = join(sessionsDir, 'same.jsonl');
    const sameArchive = join(sessionsDir, 'same.jsonl.zst');
    const archive = join(sessionsDir, 'history.jsonl.zst');
    const nestedDirectory = join(sessionsDir, 'nested');
    await mkdir(nestedDirectory);
    const nested = join(nestedDirectory, 'same.jsonl.zst');
    await writeFile(plain, sessionContent(20));
    await writeFile(sameArchive, compressZstd(sessionContent(10)));
    await writeFile(archive, compressZstd(sessionContent(30)));
    await writeFile(nested, compressZstd(sessionContent(5)));
    const fixture = await setup();
    fixture.application.start();
    expect((await fixture.application.getInitialUsage()).summary.totals.totalTokens).toBe(20);
    expect(fixture.setIntervalFn).toHaveBeenCalledWith(
      expect.any(Function),
      USAGE_SCAN_INTERVAL_MS
    );
    expect(fixture.decompressFile).not.toHaveBeenCalled();
    await expect(stat(storageDir)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(fixture.service.getStatus()).toMatchObject({ discoveredCount: 3, unimportedCount: 3 });

    expect(await fixture.service.refresh()).toMatchObject({
      phase: 'ready',
      importedCount: 3,
      report: { added: 3 },
    });
    expect(fixture.runtime.getResult()?.summary.totals.totalTokens).toBe(55);
    await fixture.expectCostTokens(55);
    expect(fixture.decompressFile).toHaveBeenCalledTimes(3);
    const importedAt = fixture.service.getStatus().lastImportedAt;
    await writeFile(archive, compressZstd(sessionContent(500)));
    await writeFile(plain, sessionContent(40));
    fixture.tick();
    await vi.waitFor(() =>
      expect(fixture.runtime.getResult()?.summary.totals.totalTokens).toBe(75)
    );
    await fixture.application.refreshOnFocus();
    await fixture.application.refresh();
    expect(fixture.decompressFile).toHaveBeenCalledTimes(3);
    expect(fixture.service.getStatus().lastImportedAt).toBe(importedAt);
    await fixture.expectCostTokens(75);

    await unlink(plain);
    await fixture.application.refresh();
    expect(fixture.runtime.getResult()?.summary.totals.totalTokens).toBe(45);
    await fixture.expectCostTokens(45);
    expect(await fixture.service.refresh()).toMatchObject({
      report: { added: 0, updated: 1, unchanged: 2 },
    });
    expect(fixture.runtime.getResult()?.summary.totals.totalTokens).toBe(515);
    await fixture.expectCostTokens(515);
    expect(fixture.decompressFile).toHaveBeenCalledTimes(4);
  });

  it('restores complete multi-frame history after source deletion and parsed/index cache loss', async () => {
    const source = join(sessionsDir, 'history.jsonl.zst');
    const original = Buffer.from(`${sessionContent(30)}\n{malformed\n`);
    const split = original.indexOf(Buffer.from('保留')) + 1;
    const compressed = Buffer.concat([
      compressZstd(original.subarray(0, split)),
      skippableZstdFrame(),
      compressZstd(original.subarray(split)),
    ]);
    await writeFile(source, compressed);
    await writeFile(
      join(directory, 'session_index.jsonl'),
      JSON.stringify({ id: 'history', thread_name: '本地历史' })
    );
    const fixture = await setup();
    await fixture.application.refresh();
    await fixture.service.refresh();
    await fixture.expectCostTokens(30);
    expect(await readFile(source)).toEqual(compressed);
    expect(fixture.runtime.getResult()?.summary.sessions[0]).toMatchObject({
      sessionId: 'history',
      threadName: '本地历史',
    });
    const roots = await readdir(storageDir);
    const root = join(storageDir, roots[0]);
    const rawFiles = await readdir(join(root, 'raw'));
    expect(rawFiles).toHaveLength(1);
    expect(await readFile(join(root, 'raw', rawFiles[0]))).toEqual(original);
    const importedAt = fixture.service.getStatus().lastImportedAt;
    fixture.application.stop();
    await unlink(source);
    await unlink(join(root, 'parsed-cache.json'));
    await unlink(join(directory, 'cost-cache.json'));

    const restarted = await setup();
    const result = await restarted.application.getInitialUsage();
    expect(result.summary.totals.totalTokens).toBe(30);
    expect(result.summary.sessions[0].threadName).toBe('本地历史');
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'malformed-jsonl' }));
    expect(restarted.service.getStatus()).toMatchObject({
      discoveredCount: 0,
      importedCount: 1,
      lastImportedAt: importedAt,
    });
    expect(restarted.decompressFile).not.toHaveBeenCalled();
    await restarted.expectCostTokens(30);
  });
});
