import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBudgetStore, DEFAULT_BUDGET_CONFIG } from '../src/main/budgetStore';
import type { PersistedBudgetConfig } from '../src/shared/budgetTypes';

const TEST_DIRECTORY_PREFIX = 'codex-budget-store-';
const FIXED_TIMESTAMP = '2026-07-20T00:00:00.000Z';

describe('budget store', () => {
  let testDirectory = '';
  let configPath = '';

  beforeEach(async () => {
    testDirectory = await mkdtemp(join(tmpdir(), TEST_DIRECTORY_PREFIX));
    configPath = join(testDirectory, 'budget-config.json');
  });

  afterEach(async () => {
    await rm(testDirectory, { recursive: true, force: true });
  });

  it('returns defaults when the config file does not exist', async () => {
    const store = createBudgetStore(configPath, fixedNow);

    await expect(store.load()).resolves.toEqual({ config: DEFAULT_BUDGET_CONFIG, warnings: [] });
  });

  it('saves valid configuration through a temporary file and reads it back', async () => {
    const store = createBudgetStore(configPath, fixedNow);
    const config: PersistedBudgetConfig = {
      ...DEFAULT_BUDGET_CONFIG,
      policies: [
        {
          id: 'global-day',
          scope: 'global',
          period: 'day',
          modelTarget: { kind: 'all' },
          tokenLimit: 10_000,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
        },
      ],
    };

    await store.save(config);

    await expect(store.load()).resolves.toEqual({ config, warnings: [] });
    await expect(readdir(testDirectory)).resolves.toEqual(['budget-config.json']);
    await expect(readFile(configPath, 'utf8')).resolves.toContain('"schemaVersion": 2');
  });

  it('migrates schema 1 budgets to all-model targets without losing configuration', async () => {
    const legacyConfig = {
      schemaVersion: 1,
      policies: [
        {
          id: 'legacy-global-day',
          scope: 'global',
          period: 'day',
          tokenLimit: 10_000,
          createdAt: FIXED_TIMESTAMP,
          updatedAt: FIXED_TIMESTAMP,
        },
      ],
      thresholds: { warningPercent: 80, criticalPercent: 100 },
      pricingOverrides: [],
      notificationReceipts: [],
    };
    await writeFile(configPath, JSON.stringify(legacyConfig), 'utf8');

    const result = await createBudgetStore(configPath, fixedNow).load();

    expect(result.warnings).toEqual([]);
    expect(result.config.schemaVersion).toBe(2);
    expect(result.config.policies[0]).toEqual(
      expect.objectContaining({ modelTarget: { kind: 'all' } })
    );
  });

  it('backs up malformed JSON before returning defaults', async () => {
    await writeFile(configPath, '{broken', 'utf8');

    const result = await createBudgetStore(configPath, fixedNow).load();
    const files = await readdir(testDirectory);

    expect(result.config).toEqual(DEFAULT_BUDGET_CONFIG);
    expect(result.warnings[0]).toContain('Budget configuration was reset');
    expect(files).toContain('budget-config.json.corrupt-2026-07-20T00-00-00-000Z');
  });

  it('backs up structurally invalid current configuration', async () => {
    await writeFile(
      configPath,
      JSON.stringify({ ...DEFAULT_BUDGET_CONFIG, thresholds: { warningPercent: 100 } }),
      'utf8'
    );

    const result = await createBudgetStore(configPath, fixedNow).load();

    expect(result.config).toEqual(DEFAULT_BUDGET_CONFIG);
    expect(result.warnings).toHaveLength(1);
  });

  it('refuses a future schema without overwriting it', async () => {
    const future = '{"schemaVersion":3}';
    await writeFile(configPath, future, 'utf8');

    await expect(createBudgetStore(configPath, fixedNow).load()).rejects.toThrow('newer schema');
    await expect(readFile(configPath, 'utf8')).resolves.toBe(future);
  });
});

const fixedNow = (): Date => new Date(FIXED_TIMESTAMP);
