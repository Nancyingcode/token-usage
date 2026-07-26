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

const isEmptyBucket = (bucket: IndexedUsageBucket): boolean =>
  TOKEN_USAGE_KEYS.every((key) => bucket[key] === 0) &&
  Object.keys(bucket.memberCounts).length === 0 &&
  Object.keys(bucket.contributionCounts).length === 0;

type BucketMetadata = Omit<
  IndexedUsageBucket,
  keyof TokenUsage | 'id' | 'memberCounts' | 'contributionCounts'
>;

class BucketCollectionDraft {
  private readonly buckets: Record<string, IndexedUsageBucket>;

  private readonly touchedBucketIds = new Set<string>();

  public constructor(initialBuckets: Record<string, IndexedUsageBucket>, reset: boolean) {
    this.buckets = reset ? {} : { ...initialBuckets };
  }

  public apply(
    bucketId: string,
    metadata: BucketMetadata,
    contribution: IndexedUsageContribution,
    direction: 1 | -1
  ): void {
    const existing = this.buckets[bucketId];
    const bucket =
      existing && this.touchedBucketIds.has(bucketId)
        ? existing
        : existing
          ? cloneBucket(existing)
          : {
              id: bucketId,
              ...EMPTY_TOKEN_USAGE,
              ...metadata,
              memberCounts: {},
              contributionCounts: {},
            };
    this.touchedBucketIds.add(bucketId);

    TOKEN_USAGE_KEYS.forEach((key) => {
      bucket[key] += contribution[key] * direction;
    });
    const nextMemberCount = (bucket.memberCounts[contribution.sessionId] ?? 0) + direction;
    const nextContributionCount = (bucket.contributionCounts[contribution.id] ?? 0) + direction;

    if (nextMemberCount <= 0) {
      delete bucket.memberCounts[contribution.sessionId];
    } else {
      bucket.memberCounts[contribution.sessionId] = nextMemberCount;
    }
    if (nextContributionCount <= 0) {
      delete bucket.contributionCounts[contribution.id];
    } else {
      bucket.contributionCounts[contribution.id] = nextContributionCount;
    }

    if (isEmptyBucket(bucket)) {
      delete this.buckets[bucketId];
      return;
    }

    this.buckets[bucketId] = bucket;
  }

  public toRecord(): Record<string, IndexedUsageBucket> {
    return this.buckets;
  }
}

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
  const hasSourceChanges = changes.upserted.length > 0 || changes.removedSourceFiles.length > 0;

  if (!changes.requiresFullRebuild && !hasSourceChanges) {
    return index;
  }

  const sources = changes.requiresFullRebuild ? {} : { ...index.sources };
  const dayModelBuckets = new BucketCollectionDraft(
    index.dayModelBuckets,
    changes.requiresFullRebuild
  );
  const projectDayModelBuckets = new BucketCollectionDraft(
    index.projectDayModelBuckets,
    changes.requiresFullRebuild
  );
  const sessionModelBuckets = new BucketCollectionDraft(
    index.sessionModelBuckets,
    changes.requiresFullRebuild
  );
  const sourcesToReplace = changes.upserted.map(({ sourceFile }) => sourceFile);
  const sourcesToRemove = new Set([...changes.removedSourceFiles, ...sourcesToReplace]);

  const applyContribution = (contribution: IndexedUsageContribution, direction: 1 | -1): void => {
    dayModelBuckets.apply(
      getDayModelBucketId(contribution.date, contribution.modelId),
      { date: contribution.date, modelId: contribution.modelId },
      contribution,
      direction
    );
    projectDayModelBuckets.apply(
      getProjectDayModelBucketId(contribution.projectPath, contribution.date, contribution.modelId),
      {
        date: contribution.date,
        projectPath: contribution.projectPath,
        projectName: contribution.projectName,
        modelId: contribution.modelId,
      },
      contribution,
      direction
    );
    sessionModelBuckets.apply(
      getSessionModelBucketId(contribution.sessionId, contribution.modelId),
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
  };

  sourcesToRemove.forEach((sourceFile) => {
    const source = sources[sourceFile];

    if (source) {
      source.contributions.forEach((contribution) => applyContribution(contribution, -1));
      delete sources[sourceFile];
    }
  });
  changes.upserted.forEach((sourceChange) => {
    const contributions = getSourceContributions(sourceChange);
    contributions.forEach((contribution) => applyContribution(contribution, 1));
    sources[sourceChange.sourceFile] = {
      fingerprint: sourceChange.fingerprint,
      contributions,
    };
  });

  return {
    ...index,
    generatedAt: now.toISOString(),
    sources,
    dayModelBuckets: dayModelBuckets.toRecord(),
    projectDayModelBuckets: projectDayModelBuckets.toRecord(),
    sessionModelBuckets: sessionModelBuckets.toRecord(),
  };
};
