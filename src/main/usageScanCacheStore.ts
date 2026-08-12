/**
 * @file 用量扫描解析缓存
 * @description
 * 在 Electron userData 中持久化会话文件指纹与解析结果；缓存可安全丢弃，且不得写入 Codex 会话目录。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isRecord } from '../shared/runtimeTypes';
import type {
  TokenUsage,
  UsageSession,
  UsageSlice,
  UsageTurnOutcome,
  UsageWarning,
  UsageWarningCode,
} from '../shared/usageTypes';

export const USAGE_SCAN_CACHE_SCHEMA_VERSION = 1;

const JSON_INDENT_SPACES = 2;
const TEMP_FILE_SUFFIX = '.tmp';
const TOKEN_USAGE_KEYS: Array<keyof TokenUsage> = [
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
  'totalTokens',
];
const WARNING_CODES = new Set<UsageWarningCode>([
  'malformed-jsonl',
  'invalid-jsonl-record',
  'invalid-token-usage',
  'session-file-unreadable',
  'sessions-directory-unreadable',
  'malformed-session-index',
]);
const TURN_STATUSES = new Set<UsageTurnOutcome['status']>(['completed', 'failed', 'interrupted']);

export interface UsageScanCacheEntry {
  fingerprint: string;
  session: UsageSession;
}

export interface UsageScanCache {
  schemaVersion: typeof USAGE_SCAN_CACHE_SCHEMA_VERSION;
  sessionsDir: string;
  entries: Record<string, UsageScanCacheEntry>;
}

export interface UsageScanCacheStore {
  load: () => Promise<UsageScanCache | undefined>;
  save: (cache: UsageScanCache) => Promise<void>;
}

const isMissingFileError = (error: unknown): boolean => isRecord(error) && error.code === 'ENOENT';

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const hasTokenUsage = (value: Record<string, unknown>): boolean =>
  TOKEN_USAGE_KEYS.every((key) => isFiniteNonNegativeNumber(value[key]));

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isWarning = (value: unknown): value is UsageWarning =>
  isRecord(value) &&
  typeof value.code === 'string' &&
  WARNING_CODES.has(value.code as UsageWarningCode) &&
  isOptionalString(value.sourceFile) &&
  (value.line === undefined || (Number.isInteger(value.line) && Number(value.line) > 0)) &&
  isOptionalString(value.details);

const isUsageSlice = (value: unknown): value is UsageSlice =>
  isRecord(value) &&
  hasTokenUsage(value) &&
  typeof value.occurredAt === 'string' &&
  isOptionalString(value.modelId);

const isTurnOutcome = (value: unknown): value is UsageTurnOutcome => {
  if (
    !isRecord(value) ||
    typeof value.occurredAt !== 'string' ||
    typeof value.status !== 'string' ||
    !TURN_STATUSES.has(value.status as UsageTurnOutcome['status']) ||
    !isOptionalString(value.turnId) ||
    !isOptionalString(value.interruptReason)
  ) {
    return false;
  }

  return (
    value.error === undefined ||
    (isRecord(value.error) &&
      typeof value.error.message === 'string' &&
      isOptionalString(value.error.code))
  );
};

const isUsageSession = (value: unknown, sourceFile: string): value is UsageSession =>
  isRecord(value) &&
  hasTokenUsage(value) &&
  typeof value.sessionId === 'string' &&
  typeof value.startedAt === 'string' &&
  typeof value.endedAt === 'string' &&
  typeof value.projectPath === 'string' &&
  typeof value.projectName === 'string' &&
  isOptionalString(value.threadName) &&
  Array.isArray(value.usageSlices) &&
  value.usageSlices.every(isUsageSlice) &&
  Array.isArray(value.turnOutcomes) &&
  value.turnOutcomes.every(isTurnOutcome) &&
  Number.isInteger(value.eventCount) &&
  Number(value.eventCount) >= 0 &&
  value.sourceFile === sourceFile &&
  Array.isArray(value.warnings) &&
  value.warnings.every(isWarning);

const decodeCache = (content: string): UsageScanCache => {
  const raw: unknown = JSON.parse(content);

  if (
    !isRecord(raw) ||
    raw.schemaVersion !== USAGE_SCAN_CACHE_SCHEMA_VERSION ||
    typeof raw.sessionsDir !== 'string' ||
    !isRecord(raw.entries)
  ) {
    throw new TypeError('Usage scan cache has an invalid schema.');
  }

  const entries = Object.fromEntries(
    Object.entries(raw.entries).map(([sourceFile, entry]) => {
      if (
        !isRecord(entry) ||
        typeof entry.fingerprint !== 'string' ||
        !isUsageSession(entry.session, sourceFile)
      ) {
        throw new TypeError('Usage scan cache contains an invalid session.');
      }

      return [
        sourceFile,
        {
          fingerprint: entry.fingerprint,
          session: entry.session,
        },
      ];
    })
  );

  return {
    schemaVersion: USAGE_SCAN_CACHE_SCHEMA_VERSION,
    sessionsDir: raw.sessionsDir,
    entries,
  };
};

export const createUsageScanCacheStore = (cachePath: string): UsageScanCacheStore => ({
  load: async () => {
    let content: string;

    try {
      content = await readFile(cachePath, 'utf8');
    } catch (error) {
      if (isMissingFileError(error)) {
        return undefined;
      }

      return undefined;
    }

    try {
      return decodeCache(content);
    } catch {
      return undefined;
    }
  },
  save: async (cache) => {
    const validatedCache = decodeCache(JSON.stringify(cache));
    const tempPath = `${cachePath}${TEMP_FILE_SUFFIX}`;
    await mkdir(dirname(cachePath), { recursive: true });

    try {
      await writeFile(
        tempPath,
        `${JSON.stringify(validatedCache, null, JSON_INDENT_SPACES)}\n`,
        'utf8'
      );
      await rename(tempPath, cachePath);
    } finally {
      await rm(tempPath, { force: true });
    }
  },
});
