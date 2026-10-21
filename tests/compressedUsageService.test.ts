import { describe, expect, it, vi } from 'vitest';
import { createCompressedUsageService } from '../src/main/compressedUsageService';
import type { CompressedSessionStore } from '../src/main/compressedSessionStore';
import { parseSessionJsonl } from '../src/main/sessionParser';
import type { UsageScanCycle } from '../src/main/usageScanner';
import type {
  CompressedImportResult,
  ImportedSessionSnapshot,
} from '../src/shared/compressedDataTypes';
import type { UsageSourceChange } from '../src/shared/costOptimizationTypes';
import { buildUsageSummary } from '../src/shared/usageMath';

const ROOT = 'C:\\sessions';
const source = (file: string, tokens: number): UsageSourceChange => ({
  sourceFile: file,
  fingerprint: String(tokens),
  session: parseSessionJsonl(
    file,
    JSON.stringify({
      timestamp: '2026-10-21T00:00:00Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: tokens, total_tokens: tokens } },
      },
    })
  ),
});
const cycle = (
  sources: UsageSourceChange[],
  compressedSourceFiles = ['C:\\sessions\\a.jsonl.zst'],
  sessionsDir = ROOT
): UsageScanCycle => ({
  sources,
  compressedSourceFiles,
  plainSourceFiles: sources.map((entry) => entry.sourceFile),
  threadNames: { a: 'Thread A' },
  result: {
    sessionsDir,
    scannedAt: '2026-10-21T00:00:00Z',
    summary: buildUsageSummary(sources.map((entry) => entry.session)),
    warnings: [],
  },
  changes: { upserted: [], removedSourceFiles: [], requiresFullRebuild: false },
});
const snapshot = (sources: UsageSourceChange[], sessionsDir = ROOT): ImportedSessionSnapshot => ({
  sessionsDir,
  sources,
  lastImportedAt: '2026-10-20T00:00:00Z',
});
const imported = (sources: UsageSourceChange[]): CompressedImportResult => ({
  snapshot: snapshot(sources),
  checkedAt: '2026-10-21T00:01:00Z',
  report: { added: sources.length, updated: 0, unchanged: 0, failures: [] },
});
const harness = (initial = snapshot([])) => {
  let live = cycle([]);
  const scanCycle = vi.fn(async () => live);
  const store: CompressedSessionStore = {
    load: vi.fn(async () => initial),
    importFiles: vi.fn(async () => imported([])),
  };
  const service = createCompressedUsageService({
    initialSessionsDir: ROOT,
    store,
    scanCycle,
    discoverCompressedFiles: vi.fn(async () => live.compressedSourceFiles ?? []),
  });
  return {
    service,
    store,
    scanCycle,
    setLive: (next: UsageScanCycle) => {
      live = next;
    },
  };
};

describe('compressed usage service', () => {
  it('loads local history without importing and diffs the selected sources when live data disappears', async () => {
    const archive = source('C:\\sessions\\a.jsonl.zst', 10);
    const fixture = harness(snapshot([archive]));
    fixture.setLive(cycle([source('C:\\sessions\\a.jsonl', 20)]));
    const first = await fixture.service.scanCycle(ROOT);
    expect(first.result.summary.totals.totalTokens).toBe(20);
    expect(first.changes.requiresFullRebuild).toBe(true);
    expect(first.changes.upserted).toHaveLength(1);
    expect(fixture.store.importFiles).not.toHaveBeenCalled();
    fixture.setLive(cycle([]));
    const next = await fixture.service.scanCycle(ROOT);
    expect(next.result.summary.totals.totalTokens).toBe(10);
    expect(next.changes.removedSourceFiles).toEqual(['C:\\sessions\\a.jsonl']);
    expect(next.changes.upserted[0].sourceFile).toBe(archive.sourceFile);
    expect(next.result.summary.sessions[0].threadName).toBe('Thread A');
    expect(fixture.store.load).toHaveBeenCalledTimes(1);
  });

  it('reports unimported sources without retaining old ordinary data as hidden history', async () => {
    const fixture = harness();
    fixture.setLive(cycle([source('C:\\sessions\\a.jsonl', 20)]));
    await fixture.service.scanCycle(ROOT);
    fixture.setLive(cycle([]));
    const next = await fixture.service.scanCycle(ROOT);
    expect(next.result.summary.sessions).toEqual([]);
    expect(fixture.service.getStatus()).toMatchObject({
      discoveredCount: 1,
      unimportedCount: 1,
      importedCount: 0,
    });
  });

  it('does not fall back to history when a discovered ordinary source was unreadable', async () => {
    const fixture = harness(snapshot([source('C:\\sessions\\a.jsonl.zst', 10)]));
    fixture.setLive({ ...cycle([]), plainSourceFiles: ['C:\\sessions\\a.jsonl'] });
    expect((await fixture.service.scanCycle(ROOT)).result.summary.sessions).toEqual([]);
  });

  it('single-flights manual import and merges with the newest live cycle', async () => {
    const fixture = harness();
    await fixture.service.scanCycle(ROOT);
    const pending = deferred<CompressedImportResult>();
    vi.mocked(fixture.store.importFiles).mockReturnValue(pending.promise);
    const published = vi.fn();
    const statuses = vi.fn();
    fixture.service.subscribeCycle(published);
    fixture.service.subscribe(statuses);
    const first = fixture.service.refresh();
    const second = fixture.service.refresh();
    expect(first).toBe(second);
    await vi.waitFor(() => expect(fixture.store.importFiles).toHaveBeenCalledOnce());
    fixture.setLive(cycle([source('C:\\sessions\\new.jsonl', 30)]));
    await fixture.service.scanCycle(ROOT);
    pending.resolve(imported([source('C:\\sessions\\a.jsonl.zst', 10)]));
    await expect(first).resolves.toMatchObject({
      phase: 'ready',
      importedCount: 1,
      unimportedCount: 0,
    });
    expect(published.mock.calls.at(-1)?.[0].result.summary.totals.totalTokens).toBe(40);
    expect(statuses.mock.calls.at(-1)?.[0].phase).toBe('ready');
  });

  it('keeps local history and reports failed storage without publishing candidate data', async () => {
    const fixture = harness(snapshot([source('C:\\sessions\\a.jsonl.zst', 10)]));
    await fixture.service.scanCycle(ROOT);
    vi.mocked(fixture.store.importFiles).mockRejectedValue(new Error('disk full'));
    const published = vi.fn();
    fixture.service.subscribeCycle(published);
    await expect(fixture.service.refresh()).resolves.toMatchObject({
      phase: 'error',
      error: 'disk full',
      importedCount: 1,
    });
    expect(published).not.toHaveBeenCalled();
    expect((await fixture.service.scanCycle(ROOT)).result.summary.totals.totalTokens).toBe(10);
    expect(fixture.service.getStatus()).toMatchObject({ phase: 'error', error: 'disk full' });
  });

  it('does not publish an old directory import after switching sources', async () => {
    const fixture = harness();
    await fixture.service.scanCycle(ROOT);
    const pending = deferred<CompressedImportResult>();
    vi.mocked(fixture.store.importFiles).mockReturnValue(pending.promise);
    const published = vi.fn();
    fixture.service.subscribeCycle(published);
    const task = fixture.service.refresh();
    await vi.waitFor(() => expect(fixture.store.importFiles).toHaveBeenCalledOnce());
    fixture.service.setDirectory('D:\\sessions');
    pending.resolve(imported([source('C:\\sessions\\a.jsonl.zst', 10)]));
    await task;
    expect(fixture.service.getStatus().sessionsDir).toBe('D:\\sessions');
    expect(published).not.toHaveBeenCalled();
    expect(vi.mocked(fixture.store.importFiles).mock.calls[0][3]?.()).toBe(false);
  });

  it('reports broken local history while leaving live usage available', async () => {
    const fixture = harness();
    vi.mocked(fixture.store.load).mockRejectedValue(new Error('invalid manifest'));
    fixture.setLive(cycle([source('C:\\sessions\\live.jsonl', 20)]));
    expect((await fixture.service.scanCycle(ROOT)).result.summary.totals.totalTokens).toBe(20);
    expect(fixture.service.getStatus()).toMatchObject({
      phase: 'error',
      error: 'invalid manifest',
    });
    expect(fixture.store.importFiles).not.toHaveBeenCalled();
    vi.mocked(fixture.store.load).mockResolvedValue(
      snapshot([source('C:\\sessions\\a.jsonl.zst', 10)])
    );
    expect((await fixture.service.scanCycle(ROOT)).result.summary.totals.totalTokens).toBe(30);
    expect(fixture.service.getStatus()).toMatchObject({
      phase: 'idle',
      importedCount: 1,
      error: undefined,
    });
  });

  it('does not publish old live data as fresh after a failed live scan when import succeeds', async () => {
    const fixture = harness();
    fixture.setLive(cycle([source('C:\\sessions\\live.jsonl', 20)]));
    await fixture.service.scanCycle(ROOT);
    fixture.scanCycle.mockRejectedValue(new Error('live directory unavailable'));
    await expect(fixture.service.scanCycle(ROOT)).rejects.toThrow('live directory unavailable');
    vi.mocked(fixture.store.importFiles).mockResolvedValue(
      imported([source('C:\\sessions\\a.jsonl.zst', 10)])
    );
    const published = vi.fn();
    fixture.service.subscribeCycle(published);
    const status = await fixture.service.refresh();
    expect(published).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      phase: 'error',
      error: 'live directory unavailable',
      importedCount: 1,
      report: { added: 1 },
    });
    fixture.scanCycle.mockResolvedValue(cycle([source('C:\\sessions\\live.jsonl', 30)]));
    const recovered = await fixture.service.scanCycle(ROOT);
    expect(recovered.result.summary.totals.totalTokens).toBe(40);
    expect(published).toHaveBeenCalledOnce();
    expect(fixture.service.getStatus()).toMatchObject({ phase: 'ready', error: undefined });
  });
});

const deferred = <Value>() => {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};
