import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createUsageScanCacheStore,
  USAGE_SCAN_CACHE_SCHEMA_VERSION,
  type UsageScanCache,
} from '../src/main/usageScanCacheStore';
import type { UsageSession } from '../src/shared/usageTypes';

const TEST_DIRECTORY_PREFIX = 'codex-usage-scan-cache-';
const CACHE_FILE_NAME = 'usage-scan-cache.json';

describe('usage scan cache store', () => {
  let testDirectory = '';
  let cachePath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    cachePath = join(testDirectory, CACHE_FILE_NAME);
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('returns undefined for a missing or malformed cache', async () => {
    const store = createUsageScanCacheStore(cachePath);

    await expect(store.load()).resolves.toBeUndefined();
    await writeFile(cachePath, '{broken', 'utf8');
    await expect(store.load()).resolves.toBeUndefined();
    await expect(readdir(testDirectory)).resolves.toEqual([CACHE_FILE_NAME]);
  });

  it('round-trips a valid cache through one atomic file', async () => {
    const store = createUsageScanCacheStore(cachePath);
    const cache = makeCache();

    await store.save(cache);

    await expect(store.load()).resolves.toEqual(cache);
    expect(await readFile(cachePath, 'utf8')).toContain(
      `"schemaVersion": ${USAGE_SCAN_CACHE_SCHEMA_VERSION}`
    );
    await expect(readdir(testDirectory)).resolves.toEqual([CACHE_FILE_NAME]);
  });

  it('rejects an unsupported schema or invalid session data', async () => {
    const cache = makeCache();
    await writeFile(cachePath, JSON.stringify({ ...cache, schemaVersion: 999 }), 'utf8');
    await expect(createUsageScanCacheStore(cachePath).load()).resolves.toBeUndefined();

    const invalid = structuredClone(cache) as unknown as {
      entries: Record<string, { session: { totalTokens: unknown } }>;
    };
    invalid.entries['C:\\sessions\\cached.jsonl'].session.totalTokens = -1;
    await writeFile(cachePath, JSON.stringify(invalid), 'utf8');
    await expect(createUsageScanCacheStore(cachePath).load()).resolves.toBeUndefined();
  });
});

const makeSession = (): UsageSession => ({
  sessionId: 'cached',
  startedAt: '2026-08-12T00:00:00.000Z',
  endedAt: '2026-08-12T00:00:01.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [
    {
      occurredAt: '2026-08-12T00:00:01.000Z',
      modelId: 'gpt-5',
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 2,
      reasoningOutputTokens: 0,
      totalTokens: 12,
    },
  ],
  turnOutcomes: [{ occurredAt: '2026-08-12T00:00:01.000Z', status: 'completed' }],
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 2,
  reasoningOutputTokens: 0,
  totalTokens: 12,
  eventCount: 2,
  sourceFile: 'C:\\sessions\\cached.jsonl',
  warnings: [],
});

const makeCache = (): UsageScanCache => ({
  schemaVersion: USAGE_SCAN_CACHE_SCHEMA_VERSION,
  sessionsDir: 'C:\\sessions',
  entries: {
    'C:\\sessions\\cached.jsonl': {
      fingerprint: '100:200',
      session: makeSession(),
    },
  },
});
