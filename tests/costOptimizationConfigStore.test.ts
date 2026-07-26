import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createCostOptimizationConfigStore,
  COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION,
} from '../src/main/costOptimizationConfigStore';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../src/shared/costOptimizationValidation';

const TEST_DIRECTORY_PREFIX = 'codex-cost-config-';
const CONFIG_FILE_NAME = 'cost-optimization-config.json';
const FIXED_TIMESTAMP = '2026-07-25T00:00:00.000Z';

describe('cost optimization config store', () => {
  let testDirectory = '';
  let configPath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    configPath = join(testDirectory, CONFIG_FILE_NAME);
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('uses currently priced models as candidates when the file is missing', async () => {
    const result = await createCostOptimizationConfigStore(configPath, fixedNow).load([
      'gpt-source',
      'gpt-target',
    ]);

    expect(result.config).toEqual({
      schemaVersion: COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION,
      settings: {
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        candidateModelIds: ['gpt-source', 'gpt-target'],
      },
    });
    expect(result.warning).toBeUndefined();
  });

  it('backs up malformed configuration before returning defaults', async () => {
    await writeFile(configPath, '{broken', 'utf8');
    const result = await createCostOptimizationConfigStore(configPath, fixedNow).load([]);

    expect(result.config.settings).toEqual(DEFAULT_COST_OPTIMIZATION_SETTINGS);
    expect(result.warning).toContain('Cost optimization settings were reset');
    expect(await readdir(testDirectory)).toContain(
      'cost-optimization-config.json.corrupt-2026-07-25T00-00-00-000Z'
    );
  });

  it('round-trips valid settings through an atomic file replacement', async () => {
    const store = createCostOptimizationConfigStore(configPath, fixedNow);
    const config = {
      schemaVersion: COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION,
      settings: {
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        candidateModelIds: ['gpt-source'],
      },
    };

    await store.save(config, ['gpt-source']);

    await expect(store.load(['gpt-source'])).resolves.toEqual({
      config,
      warning: undefined,
    });
    await expect(readdir(testDirectory)).resolves.toEqual([CONFIG_FILE_NAME]);
    await expect(readFile(configPath, 'utf8')).resolves.toContain('"schemaVersion": 1');
  });

  it('preserves candidates that lost pricing instead of resetting the configuration', async () => {
    const store = createCostOptimizationConfigStore(configPath, fixedNow);
    const config = {
      schemaVersion: COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION,
      settings: {
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        candidateModelIds: ['retired-model'],
      },
    };
    await store.save(config, ['retired-model']);

    const result = await store.load([]);

    expect(result.config).toEqual(config);
    expect(result.warning).toContain('retired-model');
    await expect(readdir(testDirectory)).resolves.toEqual([CONFIG_FILE_NAME]);
  });

  it('refuses a future schema without replacing the source file', async () => {
    const futureConfig = '{"schemaVersion":2,"settings":{}}';
    await writeFile(configPath, futureConfig, 'utf8');

    await expect(createCostOptimizationConfigStore(configPath, fixedNow).load([])).rejects.toThrow(
      'newer schema'
    );
    await expect(readFile(configPath, 'utf8')).resolves.toBe(futureConfig);
  });
});

const fixedNow = (): Date => new Date(FIXED_TIMESTAMP);
