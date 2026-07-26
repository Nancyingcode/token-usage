/**
 * @file 成本优化可逆用量索引
 * @description
 * 将会话切片标准化为来源贡献，并以不可变方式维护日、项目日和会话三个价格安全聚合层。
 *
 * 约束：
 * - 每次替换来源前必须先撤销该来源的旧贡献
 * - 聚合桶必须保留成员与贡献计数，避免删除共享桶
 */
import { getSessionUsageSlices } from './pricing';
import type {
  CostOptimizationIndex,
  IndexedUsageBucket,
  IndexedUsageContribution,
  UsageChangeSet,
  UsageSourceChange,
} from './costOptimizationTypes';
import type { TokenUsage } from './usageTypes';

const INDEX_SCHEMA_VERSION = 1;
const UNKNOWN_MODEL_KEY = 'unknown-model';
const KEY_SEPARATOR = '\u001f';
const DATE_PART_LENGTH = 2;

const EMPTY_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const TOKEN_USAGE_KEYS: Array<keyof TokenUsage> = [
  'inputTokens',
  'cachedInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
  'totalTokens',
];

const getModelKey = (modelId: string | undefined): string =>
  modelId?.trim().toLocaleLowerCase('en-US') || UNKNOWN_MODEL_KEY;

const getDayModelBucketId = (date: string, modelId: string | undefined): string =>
  ['day-model', date, getModelKey(modelId)].join(KEY_SEPARATOR);

const getProjectDayModelBucketId = (
  projectPath: string,
  date: string,
  modelId: string | undefined
): string => ['project-day-model', projectPath, date, getModelKey(modelId)].join(KEY_SEPARATOR);

const getSessionModelBucketId = (sessionId: string, modelId: string | undefined): string =>
  ['session-model', sessionId, getModelKey(modelId)].join(KEY_SEPARATOR);

const toLocalDateKey = (timestamp: string): string => {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid usage timestamp: ${timestamp}`);
  }

  const month = String(date.getMonth() + 1).padStart(DATE_PART_LENGTH, '0');
  const day = String(date.getDate()).padStart(DATE_PART_LENGTH, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const cloneBucket = (bucket: IndexedUsageBucket): IndexedUsageBucket => ({
  ...bucket,
  memberCounts: { ...bucket.memberCounts },
  contributionCounts: { ...bucket.contributionCounts },
});

const cloneIndex = (index: CostOptimizationIndex): CostOptimizationIndex => ({
  ...index,
  sources: Object.fromEntries(
    Object.entries(index.sources).map(([sourceFile, source]) => [
      sourceFile,
      {
        fingerprint: source.fingerprint,
        contributions: source.contributions.map((contribution) => ({ ...contribution })),
      },
    ])
  ),
  dayModelBuckets: Object.fromEntries(
    Object.entries(index.dayModelBuckets).map(([id, bucket]) => [id, cloneBucket(bucket)])
  ),
  projectDayModelBuckets: Object.fromEntries(
    Object.entries(index.projectDayModelBuckets).map(([id, bucket]) => [id, cloneBucket(bucket)])
  ),
  sessionModelBuckets: Object.fromEntries(
    Object.entries(index.sessionModelBuckets).map(([id, bucket]) => [id, cloneBucket(bucket)])
  ),
});

const updateCount = (
  counts: Record<string, number>,
  key: string,
  direction: 1 | -1
): Record<string, number> => {
  const nextCount = (counts[key] ?? 0) + direction;
  const nextCounts = { ...counts };

  if (nextCount <= 0) {
    delete nextCounts[key];
    return nextCounts;
  }

  nextCounts[key] = nextCount;
  return nextCounts;
};

const isEmptyBucket = (bucket: IndexedUsageBucket): boolean =>
  TOKEN_USAGE_KEYS.every((key) => bucket[key] === 0) &&
  Object.keys(bucket.memberCounts).length === 0 &&
  Object.keys(bucket.contributionCounts).length === 0;

const applyContributionToBucket = (
  buckets: Record<string, IndexedUsageBucket>,
  bucketId: string,
  metadata: Omit<
    IndexedUsageBucket,
    keyof TokenUsage | 'id' | 'memberCounts' | 'contributionCounts'
  >,
  contribution: IndexedUsageContribution,
  direction: 1 | -1
): Record<string, IndexedUsageBucket> => {
  const existing = buckets[bucketId];
  const nextBuckets = { ...buckets };
  const bucket: IndexedUsageBucket = existing
    ? cloneBucket(existing)
    : {
        id: bucketId,
        ...EMPTY_TOKEN_USAGE,
        ...metadata,
        memberCounts: {},
        contributionCounts: {},
      };

  TOKEN_USAGE_KEYS.forEach((key) => {
    bucket[key] += contribution[key] * direction;
  });
  bucket.memberCounts = updateCount(bucket.memberCounts, contribution.sessionId, direction);
  bucket.contributionCounts = updateCount(bucket.contributionCounts, contribution.id, direction);

  if (isEmptyBucket(bucket)) {
    delete nextBuckets[bucketId];
    return nextBuckets;
  }

  nextBuckets[bucketId] = bucket;
  return nextBuckets;
};

const applyContribution = (
  index: CostOptimizationIndex,
  contribution: IndexedUsageContribution,
  direction: 1 | -1
): CostOptimizationIndex => {
  const dayBucketId = getDayModelBucketId(contribution.date, contribution.modelId);
  const dayModelBuckets = applyContributionToBucket(
    index.dayModelBuckets,
    dayBucketId,
    { date: contribution.date, modelId: contribution.modelId },
    contribution,
    direction
  );

  const projectBucketId = getProjectDayModelBucketId(
    contribution.projectPath,
    contribution.date,
    contribution.modelId
  );
  const projectDayModelBuckets = applyContributionToBucket(
    index.projectDayModelBuckets,
    projectBucketId,
    {
      date: contribution.date,
      projectPath: contribution.projectPath,
      projectName: contribution.projectName,
      modelId: contribution.modelId,
    },
    contribution,
    direction
  );

  const sessionBucketId = getSessionModelBucketId(contribution.sessionId, contribution.modelId);
  const sessionModelBuckets = applyContributionToBucket(
    index.sessionModelBuckets,
    sessionBucketId,
    {
      sessionId: contribution.sessionId,
      occurredAt: contribution.occurredAt,
      projectPath: contribution.projectPath,
      projectName: contribution.projectName,
      modelId: contribution.modelId,
    },
    contribution,
    direction
  );

  return {
    ...index,
    dayModelBuckets,
    projectDayModelBuckets,
    sessionModelBuckets,
  };
};

const getSourceContributions = (sourceChange: UsageSourceChange): IndexedUsageContribution[] =>
  getSessionUsageSlices(sourceChange.session).map((slice, index) => ({
    id: [
      sourceChange.sourceFile,
      sourceChange.session.sessionId,
      slice.occurredAt,
      String(index),
    ].join(KEY_SEPARATOR),
    sourceFile: sourceChange.sourceFile,
    sessionId: sourceChange.session.sessionId,
    occurredAt: slice.occurredAt,
    date: toLocalDateKey(slice.occurredAt),
    projectPath: sourceChange.session.projectPath,
    projectName: sourceChange.session.projectName,
    modelId: slice.modelId,
    inputTokens: slice.inputTokens,
    cachedInputTokens: slice.cachedInputTokens,
    outputTokens: slice.outputTokens,
    reasoningOutputTokens: slice.reasoningOutputTokens,
    totalTokens: slice.totalTokens,
  }));

const removeSource = (index: CostOptimizationIndex, sourceFile: string): CostOptimizationIndex => {
  const source = index.sources[sourceFile];

  if (!source) {
    return index;
  }

  let nextIndex = index;
  source.contributions.forEach((contribution) => {
    nextIndex = applyContribution(nextIndex, contribution, -1);
  });
  const sources = { ...nextIndex.sources };
  delete sources[sourceFile];
  return { ...nextIndex, sources };
};

const addSource = (
  index: CostOptimizationIndex,
  sourceChange: UsageSourceChange
): CostOptimizationIndex => {
  const contributions = getSourceContributions(sourceChange);
  let nextIndex = index;
  contributions.forEach((contribution) => {
    nextIndex = applyContribution(nextIndex, contribution, 1);
  });
  return {
    ...nextIndex,
    sources: {
      ...nextIndex.sources,
      [sourceChange.sourceFile]: {
        fingerprint: sourceChange.fingerprint,
        contributions,
      },
    },
  };
};

export const createEmptyCostOptimizationIndex = (
  sessionsDir: string,
  now: Date = new Date()
): CostOptimizationIndex => ({
  schemaVersion: INDEX_SCHEMA_VERSION,
  sessionsDir,
  generatedAt: now.toISOString(),
  sources: {},
  dayModelBuckets: {},
  projectDayModelBuckets: {},
  sessionModelBuckets: {},
});

export const rebuildCostOptimizationIndex = (
  sessionsDir: string,
  sources: UsageSourceChange[],
  now: Date = new Date()
): CostOptimizationIndex =>
  applyUsageChangeSet(
    createEmptyCostOptimizationIndex(sessionsDir, now),
    {
      upserted: sources,
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
    now
  );

export const applyUsageChangeSet = (
  index: CostOptimizationIndex,
  changes: UsageChangeSet,
  now: Date = new Date()
): CostOptimizationIndex => {
  let nextIndex = changes.requiresFullRebuild
    ? createEmptyCostOptimizationIndex(index.sessionsDir, now)
    : cloneIndex(index);
  const sourcesToReplace = changes.upserted.map(({ sourceFile }) => sourceFile);
  const sourcesToRemove = new Set([...changes.removedSourceFiles, ...sourcesToReplace]);

  sourcesToRemove.forEach((sourceFile) => {
    nextIndex = removeSource(nextIndex, sourceFile);
  });
  changes.upserted.forEach((sourceChange) => {
    nextIndex = addSource(nextIndex, sourceChange);
  });

  return {
    ...nextIndex,
    generatedAt: now.toISOString(),
  };
};
