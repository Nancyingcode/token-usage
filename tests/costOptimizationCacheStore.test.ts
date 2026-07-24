import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCostOptimizationCacheStore } from '../src/main/costOptimizationCacheStore';
import { createEmptyCostOptimizationIndex } from '../src/shared/costOptimizationIndex';
import { FIXED_NOW } from './helpers/costOptimizationFixtures';

const TEST_DIRECTORY_PREFIX = 'codex-cost-cache-';
const CACHE_FILE_NAME = 'cost-optimization-cache.json';
const REBUILD_WARNING = 'Cost optimization cache will be rebuilt.';

describe('cost optimization cache store', () => {
  let testDirectory = '';
  let cachePath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    cachePath = join(testDirectory, CACHE_FILE_NAME);
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('returns no warning when the cache file does not exist', async () => {
    await expect(createCostOptimizationCacheStore(cachePath).load()).resolves.toEqual({
      index: undefined,
      warning: undefined,
    });
  });

  it('returns a rebuild warning for malformed cache without backing it up', async () => {
    await writeFile(cachePath, '{broken', 'utf8');
    const result = await createCostOptimizationCacheStore(cachePath).load();

    expect(result.index).toBeUndefined();
    expect(result.warning).toBe(REBUILD_WARNING);
    await expect(readdir(testDirectory)).resolves.toEqual([CACHE_FILE_NAME]);
  });

  it('rejects unsupported or structurally inconsistent indexes', async () => {
    const index = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);
    await writeFile(cachePath, JSON.stringify({ ...index, schemaVersion: 2 }), 'utf8');
    await expect(createCostOptimizationCacheStore(cachePath).load()).resolves.toEqual({
      index: undefined,
      warning: REBUILD_WARNING,
    });

    await writeFile(
      cachePath,
      JSON.stringify({
        ...index,
        sources: {
          'usage.jsonl': {
            fingerprint: '1',
            contributions: [
              {
                id: 'contribution',
                sourceFile: 'usage.jsonl',
                sessionId: 'session',
                occurredAt: FIXED_NOW.toISOString(),
                date: '2026-07-25',
                projectPath: 'C:\\repo',
                projectName: 'repo',
                modelId: 'gpt-source',
                inputTokens: 1,
                cachedInputTokens: 0,
                outputTokens: 0,
                reasoningOutputTokens: 0,
                totalTokens: 1,
              },
            ],
          },
        },
      }),
      'utf8'
    );

    await expect(createCostOptimizationCacheStore(cachePath).load()).resolves.toEqual({
      index: undefined,
      warning: REBUILD_WARNING,
    });
  });

  it('round-trips a structurally valid index through one cache file', async () => {
    const store = createCostOptimizationCacheStore(cachePath);
    const index = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);

    await store.save(index);

    await expect(store.load()).resolves.toEqual({ index, warning: undefined });
    await expect(readdir(testDirectory)).resolves.toEqual([CACHE_FILE_NAME]);
  });
});
