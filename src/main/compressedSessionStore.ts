/**
 * @file 手动导入的完整压缩会话存储
 * @description
 * 将解压原文保存为不可变版本，以原子清单决定生效文件；只读源目录，不将持久化原文当成可丢弃缓存。
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type {
  CompressedImportReport,
  CompressedImportResult,
  ImportedSessionSnapshot,
} from '../shared/compressedDataTypes';
import type { UsageSourceChange } from '../shared/costOptimizationTypes';
import { isRecord } from '../shared/runtimeTypes';
import type { UsageSession } from '../shared/usageTypes';
import { parseSessionJsonlAsync } from './sessionParser';
import { createUsageScanCacheStore, USAGE_SCAN_CACHE_SCHEMA_VERSION } from './usageScanCacheStore';
import {
  assertManagedPath,
  assertReadableCompressedSource,
  assertStorageSeparation,
  getCompressedRootDirectory,
  getCompressedSourceKey,
  isMissingPath,
  normalizeSourceRoot,
} from './compressedSessionPaths';

const MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_FILENAME = 'manifest.json';
const PARSE_CACHE_FILENAME = 'parsed-cache.json';
const RAW_DIRECTORY = 'raw';
const STAGING_DIRECTORY = 'staging';
const JSON_INDENT_SPACES = 2;
// 每个任务最多同时持有两份解压窗口与解析文本；不随待导入文件数增长。
const MAX_CONCURRENT_ZSTD_IMPORTS = 2;
// 本地恢复最多保留两份读取/解析窗口；缓存命中仅逐块校验，避免启动内存随原文总量增长。
const MAX_CONCURRENT_LOCAL_LOADS = 2;
// 1 MiB 分块兼顾 Electron 文件读取开销与单次哈希耗时；每个 worker 跨文件复用，分配量不随副本数增长。
const LOCAL_VERIFICATION_BUFFER_BYTES = 1_048_576;
const RAW_VERSION_PATTERN = /^raw\/[\da-f-]+\.jsonl$/;
const SHA256_PATTERN = /^[\da-f]{64}$/;

interface ImportedFileEntry {
  sourceFile: string;
  sourceFingerprint: string;
  localRelativePath: string;
  contentSha256: string;
  size: number;
  importedAt: string;
}

interface ImportedManifest {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  sessionsDir: string;
  entries: Record<string, ImportedFileEntry>;
}

interface LoadedRoot {
  manifest: ImportedManifest;
  snapshot: ImportedSessionSnapshot;
}

export interface CompressedSessionStoreDependencies {
  storageDir: string;
  decompressFile?: (sourceFile: string, targetFile: string) => Promise<void>;
  now?: () => number;
  replaceManifest?: (temporaryFile: string, targetFile: string) => Promise<void>;
  parseSession?: (sourceFile: string, content: string) => Promise<UsageSession>;
}

export interface CompressedSessionStore {
  load: (sessionsDir: string) => Promise<ImportedSessionSnapshot>;
  importFiles: (
    sessionsDir: string,
    sourceFiles: string[],
    onProgress?: (processed: number, total: number) => void,
    isCurrent?: () => boolean
  ) => Promise<CompressedImportResult>;
}

const hasTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const isImportedFileEntry = (
  value: unknown,
  sessionsDir: string,
  key: string
): value is ImportedFileEntry => {
  if (
    !isRecord(value) ||
    typeof value.sourceFile !== 'string' ||
    typeof value.sourceFingerprint !== 'string' ||
    !value.sourceFingerprint ||
    typeof value.localRelativePath !== 'string' ||
    !RAW_VERSION_PATTERN.test(value.localRelativePath) ||
    typeof value.contentSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.contentSha256) ||
    typeof value.size !== 'number' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !hasTimestamp(value.importedAt)
  ) {
    return false;
  }
  try {
    return (
      resolve(value.sourceFile) === value.sourceFile &&
      getCompressedSourceKey(sessionsDir, value.sourceFile) === key
    );
  } catch {
    return false;
  }
};

const decodeManifest = (raw: unknown, sessionsDir: string): ImportedManifest => {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== MANIFEST_SCHEMA_VERSION ||
    typeof raw.sessionsDir !== 'string' ||
    relative(sessionsDir, raw.sessionsDir) !== '' ||
    !isRecord(raw.entries)
  ) {
    throw new Error('Imported session manifest has an invalid schema or source identity.');
  }
  const entries = Object.fromEntries(
    Object.entries(raw.entries).map(([key, value]) => {
      if (!isImportedFileEntry(value, sessionsDir, key)) {
        throw new Error('Imported session manifest contains an invalid entry.');
      }
      return [key, value];
    })
  );
  const localFiles = Object.values(entries).map(({ localRelativePath }) => localRelativePath);
  if (new Set(localFiles).size !== localFiles.length) {
    throw new Error('Imported session manifest reuses a local file for multiple sources.');
  }
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, sessionsDir, entries };
};

const getContentHash = (content: Buffer): string =>
  createHash('sha256').update(content).digest('hex');

const verifyCachedOriginal = async (
  rawPath: string,
  entry: ImportedFileEntry,
  buffer: Buffer
): Promise<void> => {
  const hash = createHash('sha256');
  let bytes = 0;
  const file = await open(rawPath, 'r');
  try {
    while (true) {
      const { bytesRead } = await file.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      bytes += bytesRead;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await file.close();
  }
  if (bytes !== entry.size || hash.digest('hex') !== entry.contentSha256) {
    throw new Error(`Imported session integrity check failed: ${entry.sourceFile}`);
  }
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getSnapshot = (
  manifest: ImportedManifest,
  sources: UsageSourceChange[]
): ImportedSessionSnapshot => {
  const importedTimes = Object.values(manifest.entries)
    .map(({ importedAt }) => importedAt)
    .sort();
  const lastImportedAt = importedTimes.at(-1);
  return {
    sessionsDir: manifest.sessionsDir,
    sources: [...sources].sort((first, second) =>
      first.sourceFile.localeCompare(second.sourceFile)
    ),
    ...(lastImportedAt ? { lastImportedAt } : {}),
  };
};

const requireCurrentImport = (isCurrent: () => boolean): void => {
  if (!isCurrent()) {
    throw new Error('Compressed session import was cancelled after the source directory changed.');
  }
};

export const createCompressedSessionStore = (
  dependencies: CompressedSessionStoreDependencies
): CompressedSessionStore => {
  if (!isAbsolute(dependencies.storageDir)) {
    throw new Error('Imported session storage directory must be absolute.');
  }
  const storageDir = resolve(dependencies.storageDir);
  const now = dependencies.now ?? Date.now;
  const parseSession = dependencies.parseSession ?? parseSessionJsonlAsync;
  const replaceManifest = dependencies.replaceManifest ?? rename;
  const decompressFile =
    dependencies.decompressFile ??
    (async (source: string, target: string): Promise<void> => {
      const { decompressZstdFile } = await import('./zstdFrames');
      await decompressZstdFile(source, target);
    });
  // Store 实例复用每个源根的成功快照与写入队列；失败后须重新验证原文，不能以空状态覆盖损坏数据。
  const loadedRoots = new Map<string, Promise<LoadedRoot>>();
  const importQueues = new Map<string, Promise<void>>();

  const getRootKey = (sessionsDir: string): string =>
    getCompressedRootDirectory(storageDir, sessionsDir);

  const saveParseCache = async (rootDirectory: string, state: LoadedRoot): Promise<void> => {
    const cachePath = join(rootDirectory, PARSE_CACHE_FILENAME);
    try {
      await assertManagedPath(storageDir, cachePath);
      await assertManagedPath(storageDir, `${cachePath}.tmp`);
      await createUsageScanCacheStore(cachePath).save({
        schemaVersion: USAGE_SCAN_CACHE_SCHEMA_VERSION,
        sessionsDir: state.manifest.sessionsDir,
        entries: Object.fromEntries(
          state.snapshot.sources.map(({ sourceFile, fingerprint, session }) => [
            sourceFile,
            { fingerprint, session },
          ])
        ),
      });
    } catch {
      // 解析缓存可由完整原文重建；缓存失败不能撤销已原子提交的持久化导入。
    }
  };

  const readRoot = async (sessionsDir: string): Promise<LoadedRoot> => {
    await assertStorageSeparation(storageDir, sessionsDir);
    const rootDirectory = getRootKey(sessionsDir);
    const manifestPath = join(rootDirectory, MANIFEST_FILENAME);
    await assertManagedPath(storageDir, manifestPath);
    let manifest: ImportedManifest;
    try {
      manifest = decodeManifest(JSON.parse(await readFile(manifestPath, 'utf8')), sessionsDir);
    } catch (error) {
      if (!isMissingPath(error)) {
        throw error;
      }
      manifest = { schemaVersion: MANIFEST_SCHEMA_VERSION, sessionsDir, entries: {} };
      return { manifest, snapshot: getSnapshot(manifest, []) };
    }
    const cachePath = join(rootDirectory, PARSE_CACHE_FILENAME);
    await assertManagedPath(storageDir, cachePath);
    const parsedCache = await createUsageScanCacheStore(cachePath).load();
    const sources: UsageSourceChange[] = [];
    let cacheNeedsRebuild = false;
    const entries = Object.values(manifest.entries);
    let nextEntryIndex = 0;
    const readEntry = async (
      entry: ImportedFileEntry,
      verificationBuffer: Buffer
    ): Promise<void> => {
      const rawPath = join(rootDirectory, entry.localRelativePath);
      await assertManagedPath(storageDir, rawPath);
      const cached =
        parsedCache?.sessionsDir === sessionsDir
          ? parsedCache.entries[entry.sourceFile]
          : undefined;
      let session: UsageSession;
      if (cached?.fingerprint === entry.contentSha256) {
        await verifyCachedOriginal(rawPath, entry, verificationBuffer);
        session = cached.session;
      } else {
        const content = await readFile(rawPath);
        if (content.length !== entry.size || getContentHash(content) !== entry.contentSha256) {
          throw new Error(`Imported session integrity check failed: ${entry.sourceFile}`);
        }
        session = await parseSession(entry.sourceFile, content.toString('utf8'));
        cacheNeedsRebuild = true;
      }
      sources.push({ sourceFile: entry.sourceFile, fingerprint: entry.contentSha256, session });
    };
    const worker = async (): Promise<void> => {
      const verificationBuffer = Buffer.allocUnsafe(LOCAL_VERIFICATION_BUFFER_BYTES);
      while (nextEntryIndex < entries.length) {
        const index = nextEntryIndex;
        nextEntryIndex += 1;
        await readEntry(entries[index], verificationBuffer);
      }
    };
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(MAX_CONCURRENT_LOCAL_LOADS, entries.length) }, worker)
    );
    const failedWorker = workers.find((result) => result.status === 'rejected');
    if (failedWorker?.status === 'rejected') {
      // 等全部读取退出再清除加载任务，避免失败后的重试与旧读取/解析任务重叠。
      throw failedWorker.reason;
    }
    const state = { manifest, snapshot: getSnapshot(manifest, sources) };
    if (cacheNeedsRebuild) {
      await saveParseCache(rootDirectory, state);
    }
    return state;
  };

  const loadRoot = (sessionsDir: string): Promise<LoadedRoot> => {
    const key = getRootKey(sessionsDir);
    let loaded = loadedRoots.get(key);
    if (!loaded) {
      const pending = readRoot(sessionsDir).catch((error: unknown) => {
        if (loadedRoots.get(key) === pending) {
          loadedRoots.delete(key);
        }
        throw error;
      });
      loaded = pending;
      loadedRoots.set(key, loaded);
    }
    return loaded;
  };

  const removeTemporary = async (temporaryPath: string): Promise<void> => {
    await assertManagedPath(storageDir, temporaryPath);
    await rm(temporaryPath, { force: true });
  };

  const writeManifest = async (
    rootDirectory: string,
    manifest: ImportedManifest,
    isCurrent: () => boolean
  ): Promise<void> => {
    const target = join(rootDirectory, MANIFEST_FILENAME);
    const temporary = join(rootDirectory, `${randomUUID()}.manifest.tmp`);
    await assertStorageSeparation(storageDir, manifest.sessionsDir);
    await assertManagedPath(storageDir, target);
    await assertManagedPath(storageDir, temporary);
    try {
      const file = await open(temporary, 'wx');
      try {
        await file.writeFile(`${JSON.stringify(manifest, null, JSON_INDENT_SPACES)}\n`, 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      requireCurrentImport(isCurrent);
      await replaceManifest(temporary, target);
    } catch (error) {
      try {
        await removeTemporary(temporary);
      } catch {
        // 清理故障不能掩盖清单写入的原始错误；成功替换后临时路径已移走，无须再清理。
      }
      throw error;
    }
  };

  const runImport = async (
    sessionsDir: string,
    sourceFiles: string[],
    onProgress: (processed: number, total: number) => void,
    isCurrent: () => boolean
  ): Promise<CompressedImportResult> => {
    requireCurrentImport(isCurrent);
    const previous = await loadRoot(sessionsDir);
    await assertStorageSeparation(storageDir, sessionsDir);
    const rootDirectory = getRootKey(sessionsDir);
    const nextEntries = { ...previous.manifest.entries };
    const nextSources = new Map(
      previous.snapshot.sources.map((source) => [source.sourceFile, source])
    );
    const report: CompressedImportReport = { added: 0, updated: 0, unchanged: 0, failures: [] };
    const uniqueFiles = new Map<string, string>();
    sourceFiles.forEach((file) => {
      const resolved = resolve(file);
      const identity = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      if (!uniqueFiles.has(identity)) {
        uniqueFiles.set(identity, resolved);
      }
    });
    const files = [...uniqueFiles.values()].sort();
    let processed = 0;
    let nextFileIndex = 0;
    onProgress(processed, files.length);

    const importFile = async (sourceFile: string): Promise<void> => {
      let temporaryPath: string | undefined;
      try {
        requireCurrentImport(isCurrent);
        const key = getCompressedSourceKey(sessionsDir, sourceFile);
        await assertReadableCompressedSource(sessionsDir, sourceFile);
        const before = await stat(sourceFile);
        const sourceFingerprint = `${before.size}:${before.mtimeMs}`;
        const existing = previous.manifest.entries[key];
        if (existing?.sourceFingerprint === sourceFingerprint) {
          report.unchanged += 1;
          return;
        }
        const stagingDirectory = join(rootDirectory, STAGING_DIRECTORY);
        const rawDirectory = join(rootDirectory, RAW_DIRECTORY);
        await assertManagedPath(storageDir, stagingDirectory);
        await assertManagedPath(storageDir, rawDirectory);
        await mkdir(stagingDirectory, { recursive: true });
        await mkdir(rawDirectory, { recursive: true });
        temporaryPath = join(stagingDirectory, `${randomUUID()}.tmp`);
        await assertManagedPath(storageDir, temporaryPath);
        await decompressFile(sourceFile, temporaryPath);
        await assertReadableCompressedSource(sessionsDir, sourceFile);
        const after = await stat(sourceFile);
        if (`${after.size}:${after.mtimeMs}` !== sourceFingerprint) {
          throw new Error('Compressed source changed during import.');
        }
        requireCurrentImport(isCurrent);
        await assertManagedPath(storageDir, temporaryPath);
        const rawHandle = await open(temporaryPath, 'r+');
        let content: Buffer;
        try {
          await rawHandle.sync();
          content = await rawHandle.readFile();
        } finally {
          await rawHandle.close();
        }
        const contentSha256 = getContentHash(content);
        const session = await parseSession(sourceFile, content.toString('utf8'));
        requireCurrentImport(isCurrent);
        const localRelativePath = `${RAW_DIRECTORY}/${randomUUID()}.jsonl`;
        const rawPath = join(rootDirectory, localRelativePath);
        await assertManagedPath(storageDir, rawPath);
        // 旧清单始终指向旧版本；新版本只在清单替换成功后生效，避免写入失败破坏已导入数据。
        await rename(temporaryPath, rawPath);
        temporaryPath = undefined;
        nextEntries[key] = {
          sourceFile,
          sourceFingerprint,
          localRelativePath,
          contentSha256,
          size: content.length,
          importedAt: new Date(now()).toISOString(),
        };
        if (existing) {
          nextSources.delete(existing.sourceFile);
        }
        nextSources.set(sourceFile, { sourceFile, fingerprint: contentSha256, session });
        if (existing) {
          report.updated += 1;
        } else {
          report.added += 1;
        }
      } catch (error) {
        report.failures.push({ sourceFile, message: getErrorMessage(error) });
      } finally {
        if (temporaryPath) {
          await removeTemporary(temporaryPath);
        }
        processed += 1;
        onProgress(processed, files.length);
      }
    };

    const worker = async (): Promise<void> => {
      while (nextFileIndex < files.length) {
        const index = nextFileIndex;
        nextFileIndex += 1;
        await importFile(files[index]);
      }
    };
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(MAX_CONCURRENT_ZSTD_IMPORTS, files.length) }, worker)
    );
    const failedWorker = workers.find((workerResult) => workerResult.status === 'rejected');
    if (failedWorker?.status === 'rejected') {
      // 写入队列必须等待所有文件任务退出；否则一次清理错误可能让下一轮与剩余任务同时操作清单。
      throw failedWorker.reason;
    }
    requireCurrentImport(isCurrent);
    let state = previous;
    if (report.added + report.updated > 0) {
      const manifest: ImportedManifest = {
        schemaVersion: MANIFEST_SCHEMA_VERSION,
        sessionsDir,
        entries: nextEntries,
      };
      const snapshot = getSnapshot(manifest, [...nextSources.values()]);
      await writeManifest(rootDirectory, manifest, isCurrent);
      state = { manifest, snapshot };
      loadedRoots.set(getRootKey(sessionsDir), Promise.resolve(state));
      await saveParseCache(rootDirectory, state);
    }
    report.failures.sort((first, second) =>
      (first.sourceFile ?? '').localeCompare(second.sourceFile ?? '')
    );
    return { snapshot: state.snapshot, report, checkedAt: new Date(now()).toISOString() };
  };

  return {
    load: async (sessionsDir) => (await loadRoot(normalizeSourceRoot(sessionsDir))).snapshot,
    importFiles: (directory, sourceFiles, onProgress = () => undefined, isCurrent = () => true) => {
      const sessionsDir = normalizeSourceRoot(directory);
      const key = getRootKey(sessionsDir);
      const operation = (importQueues.get(key) ?? Promise.resolve()).then(() =>
        runImport(sessionsDir, sourceFiles, onProgress, isCurrent)
      );
      importQueues.set(
        key,
        operation.then(
          () => undefined,
          () => undefined
        )
      );
      return operation;
    },
  };
};
