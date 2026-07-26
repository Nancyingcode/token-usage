/**
 * @file Codex 用量扫描器
 * @description
 * 发现并并发读取会话文件，关联任务名称、复用文件缓存，并发布完整结果和来源变更集。
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { UsageChangeSet } from '../shared/costOptimizationTypes';
import { isRecord } from '../shared/runtimeTypes';
import getSessionId from '../shared/sessionId';
import { buildUsageSummary } from '../shared/usageMath';
import type { UsageScanResult, UsageSession, UsageWarning } from '../shared/usageTypes';
import { getDefaultCodexSessionsDir, getDefaultSessionIndexPath } from './codexPaths';
import parseSessionJsonl from './sessionParser';

export interface ScanOptions {
  sessionsDir?: string;
  sessionIndexPath?: string;
}

export interface UsageScanner {
  scan: (options?: ScanOptions) => Promise<UsageScanResult>;
  scanCycle: (options?: ScanOptions) => Promise<UsageScanCycle>;
}

export interface UsageScanCycle {
  result: UsageScanResult;
  changes: UsageChangeSet;
}

export interface UsageScannerDependencies {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  stat: (path: string) => Promise<{ size: number; mtimeMs: number }>;
}

interface FileDiscoveryResult {
  files: string[];
  warnings: UsageWarning[];
}

interface ThreadNameResult {
  names: Map<string, string>;
  warnings: UsageWarning[];
}

interface SessionFileResult {
  session?: UsageSession;
  fingerprint?: string;
  cacheHit: boolean;
  cachedReadFailure?: boolean;
  warnings: UsageWarning[];
}

interface IndexedResult<Value> {
  value: Value;
}

interface CachedSessionFile {
  fingerprint: string;
  session: UsageSession;
}

const MAX_CONCURRENT_FILE_READS = 8;

export const createUsageScanner = (
  dependencies: Partial<UsageScannerDependencies> = {}
): UsageScanner => {
  const readFile =
    dependencies.readFile ??
    ((path: string, encoding: 'utf8'): Promise<string> => fs.readFile(path, encoding));
  const stat =
    dependencies.stat ??
    (async (path: string): Promise<{ size: number; mtimeMs: number }> => fs.stat(path));
  const cache = new Map<string, CachedSessionFile>();

  const scanCycle = async (options: ScanOptions = {}): Promise<UsageScanCycle> => {
    const sessionsDir = options.sessionsDir ?? getDefaultCodexSessionsDir();
    const sessionIndexPath = options.sessionIndexPath ?? getDefaultSessionIndexPath();
    const previousCachedPaths = new Set(cache.keys());
    const [discovery, threadNameResult] = await Promise.all([
      findJsonlFiles(sessionsDir),
      loadThreadNames(sessionIndexPath, readFile),
    ]);
    const discoveredPaths = new Set(discovery.files);
    const removedSourceFiles = new Set(
      [...previousCachedPaths].filter((path) => !discoveredPaths.has(path))
    );

    removedSourceFiles.forEach((path) => cache.delete(path));

    const fileResults = await mapWithConcurrency(
      discovery.files,
      MAX_CONCURRENT_FILE_READS,
      async (file): Promise<SessionFileResult> => {
        try {
          const fileStat = await stat(file);
          const fingerprint = `${fileStat.size}:${fileStat.mtimeMs}`;
          const cached = cache.get(file);
          const cacheHit = cached?.fingerprint === fingerprint;
          const parsedSession =
            cacheHit && cached
              ? cached.session
              : parseSessionJsonl(file, await readFile(file, 'utf8'));

          cache.set(file, { fingerprint, session: parsedSession });

          const session = {
            ...parsedSession,
            threadName: threadNameResult.names.get(getSessionId(file)),
          };

          return { session, fingerprint, cacheHit, warnings: session.warnings };
        } catch (error) {
          const wasCached = previousCachedPaths.has(file);
          const sourceWasRemoved = isFileNotFoundError(error);

          if (wasCached && sourceWasRemoved) {
            cache.delete(file);
            removedSourceFiles.add(file);
          }

          return {
            cacheHit: false,
            cachedReadFailure: wasCached && !sourceWasRemoved,
            warnings: [
              {
                sourceFile: file,
                code: 'session-file-unreadable',
                details: errorMessage(error),
              },
            ],
          };
        }
      }
    );
    const cachedReadFailed = fileResults.some(
      ({ cachedReadFailure }) => cachedReadFailure === true
    );

    if (cachedReadFailed) {
      throw new Error('Unable to refresh cached session files.');
    }

    const sessions = fileResults.flatMap(({ session }) => (session ? [session] : []));
    const warnings = [
      ...discovery.warnings,
      ...threadNameResult.warnings,
      ...fileResults.flatMap((result) => result.warnings),
    ];
    const upserted = fileResults.flatMap(({ session, fingerprint, cacheHit }) =>
      session && fingerprint && !cacheHit
        ? [{ sourceFile: session.sourceFile, fingerprint, session }]
        : []
    );
    const scannedAt = new Date().toISOString();

    return {
      result: {
        sessionsDir,
        scannedAt,
        summary: buildUsageSummary(sessions),
        warnings,
      },
      changes: {
        upserted,
        removedSourceFiles: [...removedSourceFiles].sort((first, second) =>
          first.localeCompare(second)
        ),
        requiresFullRebuild: false,
      },
    };
  };

  const scan = async (options: ScanOptions = {}): Promise<UsageScanResult> =>
    (await scanCycle(options)).result;

  return { scan, scanCycle };
};

const defaultUsageScanner = createUsageScanner();

export const scanCodexUsage = (options: ScanOptions = {}): Promise<UsageScanResult> =>
  defaultUsageScanner.scan(options);

const findJsonlFiles = async (dir: string): Promise<FileDiscoveryResult> => {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const discoveries = await Promise.all(
      entries.map(async (entry): Promise<FileDiscoveryResult> => {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          return findJsonlFiles(fullPath);
        }

        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          return { files: [fullPath], warnings: [] };
        }

        return { files: [], warnings: [] };
      })
    );

    return {
      files: discoveries.flatMap((discovery) => discovery.files).sort((a, b) => a.localeCompare(b)),
      warnings: discoveries.flatMap((discovery) => discovery.warnings),
    };
  } catch (error) {
    throw new Error('Unable to discover sessions directory.', { cause: error });
  }
};

const loadThreadNames = async (
  sessionIndexPath: string,
  readFile: UsageScannerDependencies['readFile']
): Promise<ThreadNameResult> => {
  const names = new Map<string, string>();
  const warnings: UsageWarning[] = [];

  try {
    const content = await readFile(sessionIndexPath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      try {
        const record: unknown = JSON.parse(trimmed);

        if (!isRecord(record)) {
          throw new TypeError('Session index line must be an object.');
        }

        if (typeof record.id === 'string' && typeof record.thread_name === 'string') {
          names.set(record.id, record.thread_name);
        }
      } catch {
        warnings.push({
          sourceFile: sessionIndexPath,
          line: index + 1,
          code: 'malformed-session-index',
        });
      }
    });
  } catch {
    return { names, warnings };
  }

  return { names, warnings };
};

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output>
): Promise<Output[]> => {
  const results = new Map<number, IndexedResult<Output>>();
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex;
    nextIndex += 1;

    if (currentIndex >= items.length) {
      return;
    }

    results.set(currentIndex, { value: await mapper(items[currentIndex]) });
    await runNext();
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  return items.map((_, index) => {
    const result = results.get(index);

    if (!result) {
      throw new Error(`Missing concurrent result at index ${index}.`);
    }

    return result.value;
  });
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isFileNotFoundError = (error: unknown): boolean => isRecord(error) && error.code === 'ENOENT';
