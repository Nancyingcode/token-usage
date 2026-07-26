/**
 * @file 成本优化设置存储
 * @description
 * 对版本化设置执行运行时校验、损坏备份和原子替换，不读取或修改 Codex 会话数据。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  CostOptimizationSettings,
  PersistedCostOptimizationConfig,
} from '../shared/costOptimizationTypes';
import {
  DEFAULT_COST_OPTIMIZATION_SETTINGS,
  getCostOptimizationSettingsIssues,
} from '../shared/costOptimizationValidation';
import { isRecord } from '../shared/runtimeTypes';

export const COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION = 1;

const JSON_INDENT_SPACES = 2;
const TEMP_FILE_SUFFIX = '.tmp';
const SHORT_FORECAST_HORIZON_DAYS = 7;
const LONG_FORECAST_HORIZON_DAYS = 30;

export interface CostOptimizationConfigLoadResult {
  config: PersistedCostOptimizationConfig;
  warning: string | undefined;
}

export interface CostOptimizationConfigStore {
  load: (pricedModelIds: string[]) => Promise<CostOptimizationConfigLoadResult>;
  save: (config: PersistedCostOptimizationConfig, pricedModelIds: string[]) => Promise<void>;
}

class FutureCostOptimizationSchemaError extends RangeError {}

const isMissingFileError = (error: unknown): boolean => isRecord(error) && error.code === 'ENOENT';

const normalizeModelId = (modelId: string): string => modelId.trim().toLocaleLowerCase('en-US');

const getUniqueModelIds = (modelIds: string[]): string[] => {
  const idsByKey = new Map<string, string>();

  modelIds.forEach((modelId) => {
    const trimmedModelId = modelId.trim();
    const key = normalizeModelId(trimmedModelId);

    if (key && !idsByKey.has(key)) {
      idsByKey.set(key, trimmedModelId);
    }
  });

  return [...idsByKey.values()];
};

const createDefaultConfig = (pricedModelIds: string[]): PersistedCostOptimizationConfig => ({
  schemaVersion: COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION,
  settings: {
    ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
    candidateModelIds: getUniqueModelIds(pricedModelIds),
  },
});

const decodeSettings = (raw: unknown): CostOptimizationSettings => {
  if (
    !isRecord(raw) ||
    typeof raw.anomalyHistoryWindow !== 'number' ||
    typeof raw.anomalyMinimumSamples !== 'number' ||
    typeof raw.anomalySensitivity !== 'number' ||
    (raw.forecastHorizonDays !== SHORT_FORECAST_HORIZON_DAYS &&
      raw.forecastHorizonDays !== LONG_FORECAST_HORIZON_DAYS) ||
    typeof raw.forecastMinimumHistoryDays !== 'number' ||
    !Array.isArray(raw.candidateModelIds) ||
    !raw.candidateModelIds.every((modelId) => typeof modelId === 'string') ||
    typeof raw.minimumSavingsUsd !== 'number' ||
    typeof raw.targetCachePercentage !== 'number' ||
    typeof raw.minimumPricingCoveragePercentage !== 'number'
  ) {
    throw new TypeError('Cost optimization settings have an invalid schema.');
  }

  return {
    anomalyHistoryWindow: raw.anomalyHistoryWindow,
    anomalyMinimumSamples: raw.anomalyMinimumSamples,
    anomalySensitivity: raw.anomalySensitivity,
    forecastHorizonDays: raw.forecastHorizonDays,
    forecastMinimumHistoryDays: raw.forecastMinimumHistoryDays,
    candidateModelIds: [...raw.candidateModelIds],
    minimumSavingsUsd: raw.minimumSavingsUsd,
    targetCachePercentage: raw.targetCachePercentage,
    minimumPricingCoveragePercentage: raw.minimumPricingCoveragePercentage,
  };
};

const decodeConfig = (
  content: string,
  pricedModelIds: string[],
  validateCandidateAvailability: boolean
): PersistedCostOptimizationConfig => {
  const raw: unknown = JSON.parse(content);

  if (
    isRecord(raw) &&
    typeof raw.schemaVersion === 'number' &&
    raw.schemaVersion > COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION
  ) {
    throw new FutureCostOptimizationSchemaError('Cost optimization settings use a newer schema.');
  }
  if (!isRecord(raw) || raw.schemaVersion !== COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION) {
    throw new TypeError('Cost optimization settings have an invalid schema.');
  }

  const settings = decodeSettings(raw.settings);
  const issues = getCostOptimizationSettingsIssues(settings, pricedModelIds).filter(
    ({ code }) => validateCandidateAvailability || code !== 'candidate-model-unpriced'
  );

  if (issues.length > 0) {
    throw new TypeError(
      `Cost optimization settings are invalid: ${issues.map(({ code }) => code).join(', ')}`
    );
  }

  return {
    schemaVersion: COST_OPTIMIZATION_CONFIG_SCHEMA_VERSION,
    settings,
  };
};

export const createCostOptimizationConfigStore = (
  configPath: string,
  now: () => Date = () => new Date()
): CostOptimizationConfigStore => {
  const load = async (pricedModelIds: string[]): Promise<CostOptimizationConfigLoadResult> => {
    let content: string;

    try {
      content = await readFile(configPath, 'utf8');
    } catch (error) {
      if (isMissingFileError(error)) {
        return {
          config: createDefaultConfig(pricedModelIds),
          warning: undefined,
        };
      }

      throw error;
    }

    try {
      const config = decodeConfig(content, pricedModelIds, false);
      const normalizedPricedIds = new Set(pricedModelIds.map(normalizeModelId));
      const unavailableCandidates = config.settings.candidateModelIds.filter(
        (modelId) => !normalizedPricedIds.has(normalizeModelId(modelId))
      );

      return {
        config,
        warning:
          unavailableCandidates.length > 0
            ? `Candidate models are no longer priced: ${unavailableCandidates.join(', ')}.`
            : undefined,
      };
    } catch (error) {
      if (error instanceof FutureCostOptimizationSchemaError) {
        throw error;
      }

      const timestamp = now().toISOString().replace(/[.:]/g, '-');
      const backupPath = `${configPath}.corrupt-${timestamp}`;
      await rename(configPath, backupPath);
      return {
        config: createDefaultConfig(pricedModelIds),
        warning: `Cost optimization settings were reset. Corrupt data was moved to ${backupPath}.`,
      };
    }
  };

  const save = async (
    config: PersistedCostOptimizationConfig,
    pricedModelIds: string[]
  ): Promise<void> => {
    const validatedConfig = decodeConfig(JSON.stringify(config), pricedModelIds, true);
    const tempPath = `${configPath}${TEMP_FILE_SUFFIX}`;
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
