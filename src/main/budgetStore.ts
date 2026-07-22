import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PersistedBudgetConfig } from '../shared/budgetTypes';
import {
  BUDGET_CONFIG_SCHEMA_VERSION,
  decodePersistedBudgetConfig,
} from '../shared/budgetValidation';
import { isRecord } from '../shared/runtimeTypes';

const DEFAULT_WARNING_PERCENT = 80;
const DEFAULT_CRITICAL_PERCENT = 100;
const JSON_INDENT_SPACES = 2;

export { BUDGET_CONFIG_SCHEMA_VERSION };

export const DEFAULT_BUDGET_CONFIG: PersistedBudgetConfig = {
  schemaVersion: BUDGET_CONFIG_SCHEMA_VERSION,
  policies: [],
  thresholds: {
    warningPercent: DEFAULT_WARNING_PERCENT,
    criticalPercent: DEFAULT_CRITICAL_PERCENT,
  },
  pricingOverrides: [],
  notificationReceipts: [],
};

export interface BudgetConfigLoadResult {
  config: PersistedBudgetConfig;
  warnings: string[];
}

export interface BudgetStore {
  load: () => Promise<BudgetConfigLoadResult>;
  save: (config: PersistedBudgetConfig) => Promise<void>;
}

class FutureBudgetSchemaError extends RangeError {}

const createDefaultBudgetConfig = (): PersistedBudgetConfig => ({
  ...DEFAULT_BUDGET_CONFIG,
  thresholds: { ...DEFAULT_BUDGET_CONFIG.thresholds },
  policies: [],
  pricingOverrides: [],
  notificationReceipts: [],
});

const isMissingFileError = (error: unknown): boolean => isRecord(error) && error.code === 'ENOENT';

const decodeConfigFile = (content: string): PersistedBudgetConfig => {
  const raw: unknown = JSON.parse(content);

  if (
    isRecord(raw) &&
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion > BUDGET_CONFIG_SCHEMA_VERSION
  ) {
    throw new FutureBudgetSchemaError('Budget configuration uses a newer schema.');
  }

  return decodePersistedBudgetConfig(raw);
};

export const createBudgetStore = (
  configPath: string,
  now: () => Date = () => new Date()
): BudgetStore => {
  const backupCorruptConfig = async (): Promise<string> => {
    const timestamp = now().toISOString().replace(/[.:]/g, '-');
    const backupPath = `${configPath}.corrupt-${timestamp}`;
    await rename(configPath, backupPath);
    return backupPath;
  };

  const load = async (): Promise<BudgetConfigLoadResult> => {
    let content: string;

    try {
      content = await readFile(configPath, 'utf8');
    } catch (error) {
      if (isMissingFileError(error)) {
        return { config: createDefaultBudgetConfig(), warnings: [] };
      }

      throw error;
    }

    try {
      return { config: decodeConfigFile(content), warnings: [] };
    } catch (error) {
      if (error instanceof FutureBudgetSchemaError) {
        throw error;
      }

      const backupPath = await backupCorruptConfig();
      return {
        config: createDefaultBudgetConfig(),
        warnings: [`Budget configuration was reset. Corrupt data was moved to ${backupPath}.`],
      };
    }
  };

  const save = async (config: PersistedBudgetConfig): Promise<void> => {
    const validatedConfig = decodePersistedBudgetConfig(config);
    const tempPath = `${configPath}.tmp`;

    await mkdir(dirname(configPath), { recursive: true });

    try {
      await writeFile(
        tempPath,
        `${JSON.stringify(validatedConfig, null, JSON_INDENT_SPACES)}\n`,
        'utf8'
      );
      await rename(tempPath, configPath);
    } finally {
      await rm(tempPath, { force: true });
    }
  };

  return { load, save };
};
