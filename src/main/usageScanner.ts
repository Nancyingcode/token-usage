import { promises as fs } from 'node:fs';
import { join } from 'node:path';
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

  const scan = async (options: ScanOptions = {}): Promise<UsageScanResult> => {
    const sessionsDir = options.sessionsDir ?? getDefaultCodexSessionsDir();
    const sessionIndexPath = options.sessionIndexPath ?? getDefaultSessionIndexPath();
    const [discovery, threadNameResult] = await Promise.all([
      findJsonlFiles(sessionsDir),
      loadThreadNames(sessionIndexPath, readFile),
    ]);
    const discoveredPaths = new Set(discovery.files);

    [...cache.keys()]
      .filter((path) => !discoveredPaths.has(path))
      .forEach((path) => cache.delete(path));

    const fileResults = await mapWithConcurrency(
      discovery.files,
      MAX_CONCURRENT_FILE_READS,
      async (file): Promise<SessionFileResult> => {
        try {
          const fileStat = await stat(file);
          const fingerprint = `${fileStat.size}:${fileStat.mtimeMs}`;
          const cached = cache.get(file);
          const parsedSession =
            cached?.fingerprint === fingerprint
              ? cached.session
              : parseSessionJsonl(file, await readFile(file, 'utf8'));

          cache.set(file, { fingerprint, session: parsedSession });

          const session = {
            ...parsedSession,
            threadName: threadNameResult.names.get(getSessionId(file)),
          };

          return { session, warnings: session.warnings };
        } catch (error) {
          return {
            warnings: [
              {
                sourceFile: file,
                message: `Unable to read session file: ${errorMessage(error)}`,
              },
            ],
          };
        }
      }
    );
    const sessions = fileResults.flatMap(({ session }) => (session ? [session] : []));
    const warnings = [
      ...discovery.warnings,
      ...threadNameResult.warnings,
      ...fileResults.flatMap((result) => result.warnings),
    ];

    return {
      sessionsDir,
      scannedAt: new Date().toISOString(),
      summary: buildUsageSummary(sessions),
      warnings,
    };
  };

  return { scan };
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
    return {
      files: [],
      warnings: [
        {
          sourceFile: dir,
          message: `Unable to scan Codex sessions directory: ${errorMessage(error)}`,
        },
      ],
    };
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
          message: 'Malformed session index line skipped.',
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
