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

const MAX_CONCURRENT_FILE_READS = 8;

export const scanCodexUsage = async (options: ScanOptions = {}): Promise<UsageScanResult> => {
  const sessionsDir = options.sessionsDir ?? getDefaultCodexSessionsDir();
  const [discovery, threadNameResult] = await Promise.all([
    findJsonlFiles(sessionsDir),
    loadThreadNames(getDefaultSessionIndexPath()),
  ]);
  const fileResults = await mapWithConcurrency(
    discovery.files,
    MAX_CONCURRENT_FILE_READS,
    async (file) => readSessionFile(file, threadNameResult.names)
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

const loadThreadNames = async (sessionIndexPath: string): Promise<ThreadNameResult> => {
  const names = new Map<string, string>();
  const warnings: UsageWarning[] = [];

  try {
    const content = await fs.readFile(sessionIndexPath, 'utf8');
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

const readSessionFile = async (
  file: string,
  threadNames: Map<string, string>
): Promise<SessionFileResult> => {
  try {
    const content = await fs.readFile(file, 'utf8');
    const sourceSessionId = getSessionId(file);
    const session = parseSessionJsonl(file, content, threadNames.get(sourceSessionId));

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
