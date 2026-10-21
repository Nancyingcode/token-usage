import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompressedSessionStore } from '../src/main/compressedSessionStore';
import { parseSessionJsonlAsync } from '../src/main/sessionParser';

interface TestManifest {
  schemaVersion: number;
  sessionsDir: string;
  entries: Record<
    string,
    {
      sourceFile: string;
      sourceFingerprint: string;
      localRelativePath: string;
      contentSha256: string;
      size: number;
      importedAt: string;
    }
  >;
}

describe('compressed session store', () => {
  let testDirectory = '';
  let sessionsDir = '';
  let storageDir = '';
  let currentTime = 1_792_540_800_000;

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), 'codex-compressed-store-'));
    sessionsDir = join(testDirectory, 'sessions');
    storageDir = join(testDirectory, 'user-data', 'imported-sessions');
    await mkdir(sessionsDir);
  });

  afterEach(async () => {
    const checkedPath = resolve(testDirectory);
    if (
      dirname(checkedPath) !== resolve(tmpdir()) ||
      !basename(checkedPath).startsWith('codex-compressed-store-')
    ) {
      throw new Error('Refusing to remove an unexpected test directory.');
    }
    await rm(checkedPath, { recursive: true, force: true });
  });

  const decompressFile = vi.fn(async (source: string, target: string): Promise<void> => {
    await writeFile(target, await readFile(source), { flag: 'wx' });
  });

  const makeStore = () =>
    createCompressedSessionStore({ storageDir, decompressFile, now: () => currentTime });

  it('loads an empty store without writing or reading compressed sources', async () => {
    const source = join(sessionsDir, 'new.jsonl.zst');
    await writeFile(source, validSession(10));
    decompressFile.mockClear();
    const snapshot = await makeStore().load(sessionsDir);
    expect(snapshot).toEqual({ sessionsDir, sources: [] });
    expect(decompressFile).not.toHaveBeenCalled();
    await expect(stat(storageDir)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves the complete bytes, including unrelated records and malformed lines, across restarts', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    const content = Buffer.from(
      `${validSession(10)}\r\n{"type":"message","text":"完整中文 😀"}\n{bad json\n`
    );
    await writeFile(source, content);
    const imported = await makeStore().importFiles(sessionsDir, [source]);
    expect(imported.report).toEqual({ added: 1, updated: 0, unchanged: 0, failures: [] });
    expect(imported.snapshot.sources[0]?.session.totalTokens).toBe(10);
    expect(imported.snapshot.sources[0]?.session.sourceFile).toBe(source);
    expect(imported.snapshot.sources[0]?.session.warnings).toContainEqual(
      expect.objectContaining({ code: 'malformed-jsonl' })
    );
    const { manifest, rootDirectory } = await readManifest(storageDir);
    const entry = Object.values(manifest.entries)[0];
    expect(await readFile(join(rootDirectory, entry.localRelativePath))).toEqual(content);
    expect(entry.contentSha256).toBe(createHash('sha256').update(content).digest('hex'));
    await unlink(source);
    const reloaded = await makeStore().load(sessionsDir);
    expect(reloaded).toEqual(imported.snapshot);
  });

  it('does not decompress unchanged sources or discard imported files absent from a refresh', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const store = makeStore();
    const first = await store.importFiles(sessionsDir, [source]);
    decompressFile.mockClear();
    currentTime += 10_000;
    const unchanged = await store.importFiles(sessionsDir, [source]);
    expect(unchanged.report.unchanged).toBe(1);
    expect(unchanged.snapshot.lastImportedAt).toBe(first.snapshot.lastImportedAt);
    expect(decompressFile).not.toHaveBeenCalled();
    await unlink(source);
    const missing = await store.importFiles(sessionsDir, []);
    expect(missing.snapshot).toEqual(first.snapshot);
  });

  it('creates a new immutable version and leaves the previous raw file intact', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const store = makeStore();
    await store.importFiles(sessionsDir, [source]);
    const previous = await readManifest(storageDir);
    const oldEntry = Object.values(previous.manifest.entries)[0];
    await writeFile(source, validSession(150));
    currentTime += 10_000;
    const updated = await store.importFiles(sessionsDir, [source]);
    const next = await readManifest(storageDir);
    const nextEntry = Object.values(next.manifest.entries)[0];
    expect(updated.report.updated).toBe(1);
    expect(updated.snapshot.sources[0]?.session.totalTokens).toBe(150);
    expect(nextEntry.localRelativePath).not.toBe(oldEntry.localRelativePath);
    expect(await readFile(join(previous.rootDirectory, oldEntry.localRelativePath), 'utf8')).toBe(
      validSession(10)
    );
  });

  it('does not replace the manifest or in-memory snapshot when manifest persistence fails', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    let failReplace = false;
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile,
      replaceManifest: async (temporary, target) => {
        if (failReplace) {
          throw new Error('simulated manifest failure');
        }
        await rename(temporary, target);
      },
    });
    const original = await store.importFiles(sessionsDir, [source]);
    const previous = await readManifest(storageDir);
    const oldManifest = await readFile(previous.manifestPath);
    await writeFile(source, validSession(999));
    failReplace = true;
    await expect(store.importFiles(sessionsDir, [source])).rejects.toThrow(
      'simulated manifest failure'
    );
    expect(await store.load(sessionsDir)).toEqual(original.snapshot);
    expect(await readFile(previous.manifestPath)).toEqual(oldManifest);
    expect(await makeStore().load(sessionsDir)).toEqual(original.snapshot);
  });

  it('commits successful sources while keeping the old version of a failed source', async () => {
    const source = join(sessionsDir, 'old.jsonl.zst');
    const added = join(sessionsDir, 'new.jsonl.zst');
    await writeFile(source, validSession(10));
    const seeded = makeStore();
    await seeded.importFiles(sessionsDir, [source]);
    await writeFile(source, validSession(150));
    await writeFile(added, validSession(25));
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile: async (input, target) => {
        if (input === source) {
          throw new Error('incomplete frame');
        }
        await decompressFile(input, target);
      },
    });
    const result = await store.importFiles(sessionsDir, [source, added]);
    expect(result.report).toEqual({
      added: 1,
      updated: 0,
      unchanged: 0,
      failures: [{ sourceFile: source, message: 'incomplete frame' }],
    });
    expect(
      result.snapshot.sources.map(({ session }) => session.totalTokens).sort((a, b) => a - b)
    ).toEqual([10, 25]);
  });

  it('publishes a committed manifest without cleaning a reused temporary path', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile,
      replaceManifest: async (temporary, target) => {
        await rename(temporary, target);
        await mkdir(temporary);
      },
    });
    const result = await store.importFiles(sessionsDir, [source]);
    expect(result.report).toEqual({ added: 1, updated: 0, unchanged: 0, failures: [] });
    expect(result.snapshot.sources[0]?.session.totalTokens).toBe(10);
    expect(await store.load(sessionsDir)).toEqual(result.snapshot);
    expect(await makeStore().load(sessionsDir)).toEqual(result.snapshot);
  });

  it('preserves the manifest error when temporary cleanup also fails', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const original = await makeStore().importFiles(sessionsDir, [source]);
    const { manifestPath } = await readManifest(storageDir);
    const originalManifest = await readFile(manifestPath);
    await writeFile(source, validSession(150));
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile,
      replaceManifest: async (temporary) => {
        await unlink(temporary);
        await mkdir(temporary);
        throw new Error('primary manifest replacement failure');
      },
    });
    await expect(store.importFiles(sessionsDir, [source])).rejects.toThrow(
      'primary manifest replacement failure'
    );
    expect(await readFile(manifestPath)).toEqual(originalManifest);
    expect(await store.load(sessionsDir)).toEqual(original.snapshot);
    expect(await makeStore().load(sessionsDir)).toEqual(original.snapshot);
  });

  it('rejects source changes during import and never publishes their partial output', async () => {
    const source = join(sessionsDir, 'changing.jsonl.zst');
    await writeFile(source, validSession(10));
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile: async (input, target) => {
        await decompressFile(input, target);
        await writeFile(input, validSession(150));
      },
    });
    const result = await store.importFiles(sessionsDir, [source]);
    expect(result.report.failures[0]?.message).toContain('changed');
    expect(result.snapshot.sources).toEqual([]);
    expect(result.snapshot.lastImportedAt).toBeUndefined();
  });

  it('refuses to overwrite a corrupt manifest, missing raw file, or modified raw content', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    await makeStore().importFiles(sessionsDir, [source]);
    const { manifest, rootDirectory, manifestPath } = await readManifest(storageDir);
    const rawPath = join(rootDirectory, Object.values(manifest.entries)[0].localRelativePath);
    await writeFile(rawPath, validSession(11));
    const corrupted = makeStore();
    await expect(corrupted.load(sessionsDir)).rejects.toThrow('integrity');
    await expect(corrupted.importFiles(sessionsDir, [source])).rejects.toThrow('integrity');
    await unlink(rawPath);
    await expect(makeStore().load(sessionsDir)).rejects.toThrow();
    await writeFile(manifestPath, '{broken');
    await expect(makeStore().importFiles(sessionsDir, [source])).rejects.toThrow();
    expect(await readFile(manifestPath, 'utf8')).toBe('{broken');
  });

  it('rejects manifest path traversal and source identity mismatches', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    await makeStore().importFiles(sessionsDir, [source]);
    const { manifest, manifestPath } = await readManifest(storageDir);
    const key = Object.keys(manifest.entries)[0];
    manifest.entries[key].localRelativePath = '../../outside.jsonl';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(makeStore().load(sessionsDir)).rejects.toThrow('manifest');
    manifest.sessionsDir = join(testDirectory, 'other');
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(makeStore().load(sessionsDir)).rejects.toThrow('manifest');
  });

  it('retries a failed load after the local manifest and original are repaired', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const original = await makeStore().importFiles(sessionsDir, [source]);
    const { manifest, manifestPath, rootDirectory } = await readManifest(storageDir);
    const manifestBytes = await readFile(manifestPath);
    const rawPath = join(rootDirectory, Object.values(manifest.entries)[0].localRelativePath);
    const rawBytes = await readFile(rawPath);
    const store = makeStore();
    await writeFile(manifestPath, '{broken');
    await expect(store.load(sessionsDir)).rejects.toThrow();
    await expect(store.importFiles(sessionsDir, [source])).rejects.toThrow();
    expect(await readFile(manifestPath, 'utf8')).toBe('{broken');
    await writeFile(manifestPath, manifestBytes);
    await writeFile(rawPath, validSession(999));
    await expect(store.load(sessionsDir)).rejects.toThrow('integrity');
    await writeFile(rawPath, rawBytes);
    expect(await store.load(sessionsDir)).toEqual(original.snapshot);
    expect((await store.importFiles(sessionsDir, [source])).report.unchanged).toBe(1);
  });

  it.runIf(process.platform === 'win32')(
    'treats Windows source path casing as one logical import identity',
    async () => {
      const source = join(sessionsDir, 'Archive.jsonl.zst');
      const alternateSource = source.toLowerCase();
      await writeFile(source, validSession(10));
      const store = makeStore();
      const first = await store.importFiles(sessionsDir, [source, alternateSource]);
      expect(first.report.added).toBe(1);
      expect(first.snapshot.sources).toHaveLength(1);
      await writeFile(source, validSession(150));
      const replacementSource =
        first.snapshot.sources[0].sourceFile === source ? alternateSource : source;
      const updated = await store.importFiles(sessionsDir.toLowerCase(), [replacementSource]);
      expect(updated.report.updated).toBe(1);
      expect(updated.snapshot.sources).toHaveLength(1);
      expect(updated.snapshot.sources[0]?.session.totalTokens).toBe(150);
      expect(Object.keys((await readManifest(storageDir)).manifest.entries)).toEqual([
        'archive.jsonl',
      ]);
      const restarted = await makeStore().load(sessionsDir);
      expect(restarted.sources).toHaveLength(1);
      expect(restarted.sources[0]?.session.totalTokens).toBe(150);
    }
  );

  it('rejects storage inside the read-only source and source paths outside that source', async () => {
    const nested = createCompressedSessionStore({
      storageDir: join(sessionsDir, 'imported'),
      decompressFile,
    });
    await expect(nested.load(sessionsDir)).rejects.toThrow('overlap');
    const outside = join(testDirectory, 'outside.jsonl.zst');
    await writeFile(outside, validSession(10));
    const result = await makeStore().importFiles(sessionsDir, [outside]);
    expect(result.report.failures).toHaveLength(1);
    expect(result.snapshot.sources).toEqual([]);
  });

  it('rejects a junction pointing managed raw storage into the source directory', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    await makeStore().importFiles(sessionsDir, [source]);
    const { rootDirectory } = await readManifest(storageDir);
    const rawDirectory = join(rootDirectory, 'raw');
    await rename(rawDirectory, join(rootDirectory, 'preserved-raw'));
    await symlink(sessionsDir, rawDirectory, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(makeStore().load(sessionsDir)).rejects.toThrow();
    expect(await readdir(sessionsDir)).toEqual(['archive.jsonl.zst']);
    await unlink(rawDirectory);
  });

  it('isolates roots, reuses loaded snapshots, and ignores unreferenced raw files', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    const anotherRoot = join(testDirectory, 'another-source');
    await mkdir(anotherRoot);
    await writeFile(source, validSession(10));
    await makeStore().importFiles(sessionsDir, [source]);
    const { rootDirectory } = await readManifest(storageDir);
    await writeFile(join(rootDirectory, 'raw', 'orphan.jsonl'), validSession(999));
    const parseSession = vi.fn(parseSessionJsonlAsync);
    const store = createCompressedSessionStore({ storageDir, decompressFile, parseSession });
    const first = await store.load(sessionsDir);
    await store.load(sessionsDir);
    expect(parseSession.mock.calls.length).toBeLessThanOrEqual(1);
    expect(first.sources).toHaveLength(1);
    expect((await store.load(anotherRoot)).sources).toEqual([]);
  });

  it('does not commit when a directory switch invalidates the import', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const store = makeStore();
    let isCurrent = true;
    await expect(
      store.importFiles(
        sessionsDir,
        [source],
        () => {
          isCurrent = false;
        },
        () => isCurrent
      )
    ).rejects.toThrow('cancel');
    expect((await makeStore().load(sessionsDir)).sources).toEqual([]);
  });

  it('limits concurrent decompression and serializes writes for the same source root', async () => {
    const sourceFiles = await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const source = join(sessionsDir, `${index}.jsonl.zst`);
        await writeFile(source, validSession(index + 1));
        return source;
      })
    );
    let active = 0;
    let peak = 0;
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile: async (source, target) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 10));
        await decompressFile(source, target);
        active -= 1;
      },
    });
    const [first, second] = await Promise.all([
      store.importFiles(sessionsDir, sourceFiles),
      store.importFiles(sessionsDir, sourceFiles),
    ]);
    expect(peak).toBe(2);
    expect(first.report.added).toBe(5);
    expect(second.report.unchanged).toBe(5);
    expect(second.snapshot.sources).toHaveLength(5);
  });

  it('keeps parser failures out of the persisted source set', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    const store = createCompressedSessionStore({
      storageDir,
      decompressFile,
      parseSession: async () => {
        throw new Error('simulated parsing failure');
      },
    });
    const result = await store.importFiles(sessionsDir, [source]);
    expect(result.report.failures).toEqual([
      { sourceFile: source, message: 'simulated parsing failure' },
    ]);
    expect(result.snapshot.sources).toEqual([]);
    expect((await makeStore().load(sessionsDir)).sources).toEqual([]);
  });

  it('rebuilds a missing parse cache from verified local originals without reading the compressed source', async () => {
    const source = join(sessionsDir, 'archive.jsonl.zst');
    await writeFile(source, validSession(10));
    await makeStore().importFiles(sessionsDir, [source]);
    const { rootDirectory } = await readManifest(storageDir);
    const cachePath = join(rootDirectory, 'parsed-cache.json');
    await unlink(cachePath);
    await unlink(source);
    const parseSession = vi.fn(parseSessionJsonlAsync);
    const store = createCompressedSessionStore({ storageDir, decompressFile, parseSession });
    await store.load(sessionsDir);
    expect(parseSession).toHaveBeenCalledOnce();
    parseSession.mockClear();
    await createCompressedSessionStore({ storageDir, decompressFile, parseSession }).load(
      sessionsDir
    );
    expect(parseSession).not.toHaveBeenCalled();
  });

  it('imports real concatenated Zstandard frames through the default decoder without changing bytes', async () => {
    const source = join(sessionsDir, 'native.jsonl.zst');
    const content = Buffer.from(`${validSession(12)}\n{"type":"message","text":"完整中文 😀"}\n`);
    const split = content.indexOf(Buffer.from('中')) + 1;
    await writeFile(
      source,
      Buffer.concat([
        zstdCompressSync(content.subarray(0, split)),
        zstdCompressSync(content.subarray(split)),
      ])
    );
    const result = await createCompressedSessionStore({ storageDir }).importFiles(sessionsDir, [
      source,
    ]);
    expect(result.report).toEqual({ added: 1, updated: 0, unchanged: 0, failures: [] });
    const { manifest, rootDirectory } = await readManifest(storageDir);
    expect(
      await readFile(join(rootDirectory, Object.values(manifest.entries)[0].localRelativePath))
    ).toEqual(content);
    expect(result.snapshot.sources[0]?.session.totalTokens).toBe(12);
  });
});

const readManifest = async (
  storageDir: string
): Promise<{ manifest: TestManifest; rootDirectory: string; manifestPath: string }> => {
  const roots = await readdir(storageDir);
  const rootDirectory = join(storageDir, roots[0]);
  expect(relative(storageDir, rootDirectory).startsWith('..')).toBe(false);
  const manifestPath = join(rootDirectory, 'manifest.json');
  return {
    manifest: JSON.parse(await readFile(manifestPath, 'utf8')) as TestManifest,
    rootDirectory,
    manifestPath,
  };
};

const validSession = (tokens: number): string =>
  [
    {
      type: 'session_meta',
      payload: { id: 'fixture', cwd: 'C:/fixture', model: 'gpt-5' },
      timestamp: '2026-10-21T00:00:00.000Z',
    },
    {
      type: 'event_msg',
      timestamp: '2026-10-21T00:00:01.000Z',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: tokens, total_tokens: tokens } },
      },
    },
  ]
    .map((line) => JSON.stringify(line))
    .join('\n');
