/**
 * @file 成本优化索引缓存
 * @description
 * 对可重建的成本索引执行结构校验和原子读写；无效缓存只触发重建，不备份或修改会话数据。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type {
  CostOptimizationIndex,
  IndexedUsageBucket,
  IndexedUsageContribution,
} from '../shared/costOptimizationTypes';
import { isRecord } from '../shared/runtimeTypes';
import type { TokenUsage } from '../shared/usageTypes';

const CACHE_SCHEMA_VERSION = 1;
const JSON_INDENT_SPACES = 2;
const TEMP_FILE_SUFFIX = '.tmp';
const REBUILD_WARNING = 'Cost optimization cache will be rebuilt.';
const TOKEN_USAGE_KEYS: Array<keyof TokenUsage> = [
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
  'totalTokens',
];

export interface CostOptimizationCacheLoadResult {
  index: CostOptimizationIndex | undefined;
  warning: string | undefined;
}

export interface CostOptimizationCacheStore {
  load: () => Promise<CostOptimizationCacheLoadResult>;
  save: (index: CostOptimizationIndex) => Promise<void>;
}

const isMissingFileError = (error: unknown): boolean => isRecord(error) && error.code === 'ENOENT';

const isFiniteNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const hasTokenUsage = (value: Record<string, unknown>): boolean =>
  TOKEN_USAGE_KEYS.every((key) => isFiniteNonNegativeNumber(value[key]));

const hasOptionalString = (value: Record<string, unknown>, key: string): boolean =>
  value[key] === undefined || typeof value[key] === 'string';

const isPositiveIntegerRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) &&
  Object.values(value).every(
    (count) => typeof count === 'number' && Number.isInteger(count) && count > 0
  );

const isContribution = (value: unknown): value is IndexedUsageContribution => {
  if (!isRecord(value) || !hasTokenUsage(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.sourceFile === 'string' &&
    typeof value.sessionId === 'string' &&
    typeof value.occurredAt === 'string' &&
    typeof value.date === 'string' &&
    typeof value.projectPath === 'string' &&
    typeof value.projectName === 'string' &&
    hasOptionalString(value, 'modelId')
  );
};

const isBucket = (value: unknown): value is IndexedUsageBucket => {
  if (!isRecord(value) || !hasTokenUsage(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    hasOptionalString(value, 'date') &&
    hasOptionalString(value, 'projectPath') &&
    hasOptionalString(value, 'projectName') &&
    hasOptionalString(value, 'sessionId') &&
    hasOptionalString(value, 'occurredAt') &&
    hasOptionalString(value, 'modelId') &&
    isPositiveIntegerRecord(value.memberCounts) &&
    isPositiveIntegerRecord(value.contributionCounts)
  );
};

const isBucketRecord = (value: unknown): value is Record<string, IndexedUsageBucket> =>
  isRecord(value) &&
  Object.entries(value).every(([id, bucket]) => isBucket(bucket) && bucket.id === id);

const isSourcesRecord = (value: unknown): value is CostOptimizationIndex['sources'] =>
  isRecord(value) &&
  Object.entries(value).every(
    ([sourceFile, source]) =>
      isRecord(source) &&
      typeof source.fingerprint === 'string' &&
      Array.isArray(source.contributions) &&
      source.contributions.every(
        (contribution) => isContribution(contribution) && contribution.sourceFile === sourceFile
      )
  );

const getContributionTotals = (sources: CostOptimizationIndex['sources']): TokenUsage =>
  Object.values(sources)
    .flatMap(({ contributions }) => contributions)
    .reduce<TokenUsage>(
      (totals, contribution) => ({
        inputTokens: totals.inputTokens + contribution.inputTokens,
        cachedInputTokens: totals.cachedInputTokens + contribution.cachedInputTokens,
        outputTokens: totals.outputTokens + contribution.outputTokens,
        reasoningOutputTokens: totals.reasoningOutputTokens + contribution.reasoningOutputTokens,
        totalTokens: totals.totalTokens + contribution.totalTokens,
      }),
      {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 0,
      }
    );

const getBucketTotals = (buckets: Record<string, IndexedUsageBucket>): TokenUsage =>
  Object.values(buckets).reduce<TokenUsage>(
    (totals, bucket) => ({
      inputTokens: totals.inputTokens + bucket.inputTokens,
      cachedInputTokens: totals.cachedInputTokens + bucket.cachedInputTokens,
      outputTokens: totals.outputTokens + bucket.outputTokens,
      reasoningOutputTokens: totals.reasoningOutputTokens + bucket.reasoningOutputTokens,
      totalTokens: totals.totalTokens + bucket.totalTokens,
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    }
  );

const tokenUsageEquals = (first: TokenUsage, second: TokenUsage): boolean =>
  TOKEN_USAGE_KEYS.every((key) => first[key] === second[key]);

const decodeIndex = (content: string): CostOptimizationIndex => {
  const raw: unknown = JSON.parse(content);

  if (
    !isRecord(raw) ||
    raw.schemaVersion !== CACHE_SCHEMA_VERSION ||
    typeof raw.sessionsDir !== 'string' ||
    typeof raw.generatedAt !== 'string' ||
    !isSourcesRecord(raw.sources) ||
    !isBucketRecord(raw.dayModelBuckets) ||
    !isBucketRecord(raw.projectDayModelBuckets) ||
    !isBucketRecord(raw.sessionModelBuckets)
  ) {
    throw new TypeError('Cost optimization cache has an invalid schema.');
  }

  const index: CostOptimizationIndex = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    sessionsDir: raw.sessionsDir,
    generatedAt: raw.generatedAt,
    sources: raw.sources,
    dayModelBuckets: raw.dayModelBuckets,
    projectDayModelBuckets: raw.projectDayModelBuckets,
    sessionModelBuckets: raw.sessionModelBuckets,
  };
  const contributionTotals = getContributionTotals(index.sources);
  const bucketCollections = [
    index.dayModelBuckets,
    index.projectDayModelBuckets,
    index.sessionModelBuckets,
  ];

  if (
    bucketCollections.some(
      (buckets) => !tokenUsageEquals(contributionTotals, getBucketTotals(buckets))
    )
  ) {
    throw new TypeError('Cost optimization cache totals are inconsistent.');
  }

  return index;
};

export const createCostOptimizationCacheStore = (cachePath: string): CostOptimizationCacheStore => {
  const load = async (): Promise<CostOptimizationCacheLoadResult> => {
    let content: string;

    try {
      content = await readFile(cachePath, 'utf8');
    } catch (error) {
      if (isMissingFileError(error)) {
        return { index: undefined, warning: undefined };
      }

      throw error;
    }

    try {
      return { index: decodeIndex(content), warning: undefined };
    } catch {
      return { index: undefined, warning: REBUILD_WARNING };
    }
  };

  const save = async (index: CostOptimizationIndex): Promise<void> => {
    const validatedIndex = decodeIndex(JSON.stringify(index));
    const tempPath = `${cachePath}${TEMP_FILE_SUFFIX}`;
    await mkdir(dirname(cachePath), { recursive: true });

    try {
      await writeFile(
        tempPath,
        `${JSON.stringify(validatedIndex, null, JSON_INDENT_SPACES)}\n`,
        'utf8'
      );
      await rename(tempPath, cachePath);
    } finally {
      await rm(tempPath, { force: true });
    }
  };

  return { load, save };
};
