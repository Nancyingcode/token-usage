import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUsageScanner, scanCodexUsage } from '../src/main/usageScanner';
import {
  USAGE_SCAN_CACHE_SCHEMA_VERSION,
  type UsageScanCacheStore,
} from '../src/main/usageScanCacheStore';

const TEST_DIRECTORY_PREFIX = 'codex-token-usage-';

describe('usageScanner', () => {
  let testDirectory = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('keeps stable session order and isolates invalid session data', async () => {
    const timestamp = '2026-07-16T00:00:00.000Z';
    await writeFile(join(testDirectory, 'b.jsonl'), validSession('b', timestamp));
    await writeFile(join(testDirectory, 'a.jsonl'), validSession('a', timestamp));
    await writeFile(join(testDirectory, 'broken.jsonl'), 'null');

    const result = await scanCodexUsage({ sessionsDir: testDirectory });

    expect(result.summary.sessions.map(({ sessionId }) => sessionId)).toEqual(['a', 'b', 'broken']);
    expect(result.warnings.some(({ sourceFile }) => sourceFile?.endsWith('broken.jsonl'))).toBe(
      true
    );
    expect(result.warnings.some(({ code }) => code === 'invalid-jsonl-record')).toBe(true);
  });

  it('rejects the cycle when the sessions directory cannot be discovered', async () => {
    const missingDirectory = join(testDirectory, 'missing');

    await expect(scanCodexUsage({ sessionsDir: missingDirectory })).rejects.toThrow(
      'Unable to discover sessions directory'
    );
  });

  it('keeps technical details when a session file cannot be read', async () => {
    const sessionFile = join(testDirectory, 'unreadable.jsonl');
    const missingIndexPath = join(testDirectory, 'missing-index.jsonl');
    await writeFile(sessionFile, validSession('unreadable', '2026-07-16T00:00:00.000Z'));
    const scanner = createUsageScanner({
      readFile: async (path, encoding) => {
        if (String(path) === sessionFile) {
          throw new Error('permission denied');
        }

        return readFile(path, encoding);
      },
    });

    const result = await scanner.scan({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: 'session-file-unreadable',
        details: 'permission denied',
      })
    );
  });

  it('codes malformed session index warnings', async () => {
    const sessionFile = join(testDirectory, 'indexed.jsonl');
    const sessionIndexPath = join(testDirectory, 'session-index.jsonl');
    await writeFile(sessionFile, validSession('indexed', '2026-07-16T00:00:00.000Z'));
    await writeFile(sessionIndexPath, '{bad json', 'utf8');

    const result = await scanCodexUsage({ sessionsDir: testDirectory, sessionIndexPath });

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'malformed-session-index', line: 1 })
    );
  });

  it('derives the session index from the parent of a custom sessions directory', async () => {
    const sessionsDirectory = join(testDirectory, 'sessions');
    await mkdir(sessionsDirectory);
    await writeFile(
      join(sessionsDirectory, 'indexed.jsonl'),
      validSession('indexed', '2026-07-16T00:00:00.000Z')
    );
    await writeFile(
      join(testDirectory, 'session_index.jsonl'),
      JSON.stringify({ id: 'indexed', thread_name: 'Custom path thread' })
    );

    const result = await createUsageScanner().scan({ sessionsDir: sessionsDirectory });

    expect(result.summary.sessions[0]?.threadName).toBe('Custom path thread');
  });

  it('reuses unchanged parsed sessions and removes deleted files', async () => {
    const sessionFile = join(testDirectory, 'cached.jsonl');
    const missingIndexPath = join(testDirectory, 'missing-index.jsonl');
    let sessionReadCount = 0;
    await writeFile(sessionFile, validSession('cached', '2026-07-16T00:00:00.000Z'));
    const scanner = createUsageScanner({
      readFile: async (path, encoding) => {
        if (String(path) === sessionFile) {
          sessionReadCount += 1;
        }

        return readFile(path, encoding);
      },
    });

    await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
    await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
    expect(sessionReadCount).toBe(1);

    await appendFile(sessionFile, '\n');
    await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
    expect(sessionReadCount).toBe(2);

    await unlink(sessionFile);
    const result = await scanner.scan({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    expect(result.summary.sessions).toEqual([]);
  });

  it('hydrates unchanged sessions from the persistent cache without reading JSONL again', async () => {
    const sessionFile = join(testDirectory, 'cached.jsonl');
    const sessionIndexPath = join(testDirectory, 'session-index.jsonl');
    const content = validSession('cached', '2026-07-16T00:00:00.000Z');
    await writeFile(sessionFile, content);
    await writeFile(
      sessionIndexPath,
      JSON.stringify({ id: 'cached', thread_name: 'Latest thread name' })
    );
    const seedScanner = createUsageScanner();
    const seedCycle = await seedScanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath,
    });
    const fileStat = await stat(sessionFile);
    const cacheStore: UsageScanCacheStore = {
      load: async () => ({
        schemaVersion: USAGE_SCAN_CACHE_SCHEMA_VERSION,
        sessionsDir: testDirectory,
        entries: {
          [sessionFile]: {
            fingerprint: `${fileStat.size}:${fileStat.mtimeMs}`,
            session: { ...seedCycle.result.summary.sessions[0], threadName: undefined },
          },
        },
      }),
      save: vi.fn(async () => undefined),
    };
    let sessionReadCount = 0;
    const scanner = createUsageScanner({
      cacheStore,
      readFile: async (path, encoding) => {
        if (String(path) === sessionFile) {
          sessionReadCount += 1;
        }

        return readFile(path, encoding);
      },
    });

    const result = await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath });

    expect(sessionReadCount).toBe(0);
    expect(result.summary.sessions[0]?.threadName).toBe('Latest thread name');
    await vi.waitFor(() => expect(cacheStore.save).toHaveBeenCalledOnce());
  });

  it('does not fail a successful scan when the persistent cache cannot be saved', async () => {
    const sessionFile = join(testDirectory, 'cache-save-failure.jsonl');
    await writeFile(sessionFile, validSession('cache-save-failure', '2026-07-16T00:00:00.000Z'));
    const cacheError = new Error('cache unavailable');
    const onCacheError = vi.fn();
    const scanner = createUsageScanner({
      cacheStore: {
        load: async () => undefined,
        save: vi.fn(async () => Promise.reject(cacheError)),
      },
      onCacheError,
    });

    await expect(scanner.scan({ sessionsDir: testDirectory })).resolves.toMatchObject({
      sessionsDir: testDirectory,
    });
    await vi.waitFor(() => expect(onCacheError).toHaveBeenCalledWith(cacheError));
  });

  it('publishes only changed and removed sources in scan cycles', async () => {
    const sessionFile = join(testDirectory, 'delta.jsonl');
    const missingIndexPath = join(testDirectory, 'missing-index.jsonl');
    await writeFile(sessionFile, validSession('delta', '2026-07-16T00:00:00.000Z'));
    const scanner = createUsageScanner();

    const first = await scanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    expect(first.changes.upserted.map(({ sourceFile }) => sourceFile)).toEqual([sessionFile]);
    expect(first.changes.removedSourceFiles).toEqual([]);

    const unchanged = await scanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    expect(unchanged.changes.upserted).toEqual([]);
    expect(unchanged.changes.removedSourceFiles).toEqual([]);

    await appendFile(sessionFile, '\n');
    const modified = await scanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    expect(modified.changes.upserted).toHaveLength(1);

    await unlink(sessionFile);
    const removed = await scanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    expect(removed.changes.removedSourceFiles).toEqual([sessionFile]);
  });

  it('forces a full rebuild and drops old cached sources when the directory changes', async () => {
    const firstDirectory = join(testDirectory, 'first');
    const secondDirectory = join(testDirectory, 'second');
    await Promise.all([mkdir(firstDirectory), mkdir(secondDirectory)]);
    const firstFile = join(firstDirectory, 'first.jsonl');
    const secondFile = join(secondDirectory, 'second.jsonl');
    await writeFile(firstFile, validSession('first', '2026-07-16T00:00:00.000Z'));
    await writeFile(secondFile, validSession('second', '2026-07-16T00:00:00.000Z'));
    const scanner = createUsageScanner();

    const initial = await scanner.scanCycle({ sessionsDir: firstDirectory });
    const switched = await scanner.scanCycle({ sessionsDir: secondDirectory });

    expect(initial.changes.requiresFullRebuild).toBe(false);
    expect(switched.changes.requiresFullRebuild).toBe(true);
    expect(switched.changes.removedSourceFiles).toEqual([firstFile]);
    expect(switched.changes.upserted.map(({ sourceFile }) => sourceFile)).toEqual([secondFile]);
    expect(switched.result.summary.sessions.map(({ sessionId }) => sessionId)).toEqual(['second']);
  });

  it('rejects a transient cached-file read failure without converting it to removal', async () => {
    const sessionFile = join(testDirectory, 'transient.jsonl');
    const missingIndexPath = join(testDirectory, 'missing-index.jsonl');
    let denySessionRead = false;
    await writeFile(sessionFile, validSession('transient', '2026-07-16T00:00:00.000Z'));
    const scanner = createUsageScanner({
      readFile: async (path, encoding) => {
        if (String(path) === sessionFile && denySessionRead) {
          throw new Error('temporary file lock');
        }

        return readFile(path, encoding);
      },
    });

    await scanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    await appendFile(sessionFile, '\n');
    denySessionRead = true;

    await expect(
      scanner.scanCycle({
        sessionsDir: testDirectory,
        sessionIndexPath: missingIndexPath,
      })
    ).rejects.toThrow('Unable to refresh cached session files');

    denySessionRead = false;
    const recovered = await scanner.scanCycle({
      sessionsDir: testDirectory,
      sessionIndexPath: missingIndexPath,
    });
    expect(recovered.changes.upserted).toHaveLength(1);
    expect(recovered.changes.removedSourceFiles).toEqual([]);
  });
});

const validSession = (sessionId: string, timestamp: string): string =>
  [
    JSON.stringify({
      timestamp,
      type: 'session_meta',
      payload: { session_id: sessionId, cwd: `C:\\repo\\${sessionId}` },
    }),
    JSON.stringify({
      timestamp,
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: 10,
            cached_input_tokens: 0,
            output_tokens: 2,
            reasoning_output_tokens: 0,
            total_tokens: 12,
          },
        },
      },
    }),
  ].join('\n');
