/**
 * @file 分层费用异常检测
 * @description
 * 使用仅来自当前观测之前的稳健基线，在日、项目、模型和会话四个层级识别正向费用异常。
 *
 * 约束：
 * - 定价覆盖不足的当前观测和历史样本都不参与检测
 * - 会话基线按同项目同模型、同模型、全局依次降级
 */
import type { ModelPricingEntry } from './budgetTypes';
import { getPricingCoverage } from './costOptimizationCost';
import type {
  CostAnomaly,
  CostAnomalyLevel,
  CostOptimizationIndex,
  CostOptimizationQuery,
  CostOptimizationSettings,
  IndexedUsageBucket,
  PricingCoverage,
} from './costOptimizationTypes';
import { calculateEstimatedCost } from './pricing';
import type { RollingUsagePeriod, UsageSlice } from './usageTypes';

const MAD_SCALE_FACTOR = 1.4826;
const ZERO_MAD_RELATIVE_SCALE = 0.25;
const ZERO_MAD_ABSOLUTE_SCALE_USD = 0.01;
const CRITICAL_SCORE_MULTIPLIER = 2;
const UNKNOWN_MODEL_KEY = 'unknown-model';
const KEY_SEPARATOR = '\u001f';
const DATE_PART_LENGTH = 2;
const PERIOD_DAY_COUNTS: Record<RollingUsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

interface CostObservation {
  level: CostAnomalyLevel;
  key: string;
  seriesKey: string;
  baselineScope: string;
  occurredAt: string;
  date?: string;
  projectPath?: string;
  projectName?: string;
  modelId?: string;
  sessionId?: string;
  actualCostUsd: number;
  coverage: PricingCoverage;
  contributionIds: string[];
}

interface ObservationMetadata {
  level: CostAnomalyLevel;
  key: string;
  seriesKey: string;
  baselineScope: string;
  occurredAt: string;
  date?: string;
  projectPath?: string;
  projectName?: string;
  modelId?: string;
  sessionId?: string;
}

export const median = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export const medianAbsoluteDeviation = (
  values: number[],
  center: number = median(values)
): number => median(values.map((value) => Math.abs(value - center)));

const normalizeModelId = (modelId: string | undefined): string =>
  modelId?.trim().toLocaleLowerCase('en-US') || UNKNOWN_MODEL_KEY;

const toLocalDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(DATE_PART_LENGTH, '0');
  const day = String(date.getDate()).padStart(DATE_PART_LENGTH, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const getTimestampDate = (timestamp: string): string | undefined => {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? undefined : toLocalDateKey(date);
};

const getBucketTimestamp = (bucket: IndexedUsageBucket): string =>
  bucket.occurredAt ?? `${bucket.date ?? '0000-00-00'}T23:59:59.999`;

const getObservationDate = (observation: CostObservation): string | undefined =>
  observation.date ?? getTimestampDate(observation.occurredAt);

const isObservationInQuery = (
  observation: CostObservation,
  query: CostOptimizationQuery,
  now: Date
): boolean => {
  const projectMatches = !query.projectPath || observation.projectPath === query.projectPath;

  if (!projectMatches) {
    return false;
  }
  if (query.period === 'total') {
    return true;
  }

  const observationDate = getObservationDate(observation);
  const nowTime = now.getTime();

  if (!observationDate || Number.isNaN(nowTime)) {
    return false;
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAY_COUNTS[query.period] - 1));
  return observationDate >= toLocalDateKey(start) && observationDate <= toLocalDateKey(now);
};

const toUsageSlice = (bucket: IndexedUsageBucket): UsageSlice => ({
  occurredAt: getBucketTimestamp(bucket),
  modelId: bucket.modelId,
  inputTokens: bucket.inputTokens,
  cachedInputTokens: bucket.cachedInputTokens,
  outputTokens: bucket.outputTokens,
  reasoningOutputTokens: bucket.reasoningOutputTokens,
  totalTokens: bucket.totalTokens,
});

const toObservation = (
  buckets: IndexedUsageBucket[],
  metadata: ObservationMetadata,
  pricingEntries: ModelPricingEntry[]
): CostObservation => ({
  ...metadata,
  actualCostUsd: calculateEstimatedCost(buckets.map(toUsageSlice), pricingEntries).pricedCostUsd,
  coverage: getPricingCoverage(buckets, pricingEntries),
  contributionIds: [
    ...new Set(buckets.flatMap((bucket) => Object.keys(bucket.contributionCounts))),
  ].sort((first, second) => first.localeCompare(second)),
});

const groupBuckets = (
  buckets: IndexedUsageBucket[],
  getKey: (bucket: IndexedUsageBucket) => string
): Map<string, IndexedUsageBucket[]> => {
  const groups = new Map<string, IndexedUsageBucket[]>();

  buckets.forEach((bucket) => {
    const key = getKey(bucket);
    const group = groups.get(key) ?? [];
    group.push(bucket);
    groups.set(key, group);
  });

  return groups;
};

const buildDayObservations = (
  buckets: IndexedUsageBucket[],
  pricingEntries: ModelPricingEntry[],
  selectedProjectPath: string | undefined
): CostObservation[] =>
  [...groupBuckets(buckets, (bucket) => bucket.date ?? '').entries()]
    .filter(([date]) => Boolean(date))
    .map(([date, groupedBuckets]) =>
      toObservation(
        groupedBuckets,
        {
          level: 'day',
          key: ['day', selectedProjectPath ?? 'global', date].join(KEY_SEPARATOR),
          seriesKey: selectedProjectPath ?? 'global',
          baselineScope: selectedProjectPath ? 'project-day' : 'global-day',
          occurredAt: `${date}T23:59:59.999`,
          date,
          projectPath: selectedProjectPath,
          projectName: groupedBuckets[0]?.projectName,
        },
        pricingEntries
      )
    );

const buildProjectObservations = (
  buckets: IndexedUsageBucket[],
  pricingEntries: ModelPricingEntry[]
): CostObservation[] =>
  [
    ...groupBuckets(buckets, (bucket) =>
      [bucket.projectPath ?? '', bucket.date ?? ''].join(KEY_SEPARATOR)
    ).values(),
  ]
    .filter(
      (groupedBuckets) =>
        Boolean(groupedBuckets[0]?.projectPath) && Boolean(groupedBuckets[0]?.date)
    )
    .map((groupedBuckets) => {
      const { projectPath, projectName, date } = groupedBuckets[0];
      const stableProjectPath = projectPath ?? '';
      const stableDate = date ?? '';
      return toObservation(
        groupedBuckets,
        {
          level: 'project',
          key: ['project', stableProjectPath, stableDate].join(KEY_SEPARATOR),
          seriesKey: stableProjectPath,
          baselineScope: 'project-day',
          occurredAt: `${stableDate}T23:59:59.999`,
          date: stableDate,
          projectPath: stableProjectPath,
          projectName,
        },
        pricingEntries
      );
    });

const buildModelObservations = (
  buckets: IndexedUsageBucket[],
  pricingEntries: ModelPricingEntry[],
  selectedProjectPath: string | undefined
): CostObservation[] =>
  [
    ...groupBuckets(buckets, (bucket) =>
      [bucket.date ?? '', normalizeModelId(bucket.modelId)].join(KEY_SEPARATOR)
    ).values(),
  ]
    .filter((groupedBuckets) => Boolean(groupedBuckets[0]?.date))
    .map((groupedBuckets) => {
      const { date, modelId, projectName } = groupedBuckets[0];
      const stableDate = date ?? '';
      const modelKey = normalizeModelId(modelId);
      const scopeKey = selectedProjectPath ?? 'global';
      return toObservation(
        groupedBuckets,
        {
          level: 'model',
          key: ['model', scopeKey, modelKey, stableDate].join(KEY_SEPARATOR),
          seriesKey: [scopeKey, modelKey].join(KEY_SEPARATOR),
          baselineScope: selectedProjectPath ? 'project-model-day' : 'global-model-day',
          occurredAt: `${stableDate}T23:59:59.999`,
          date: stableDate,
          projectPath: selectedProjectPath,
          projectName,
          modelId,
        },
        pricingEntries
      );
    });

const buildSessionObservations = (
  buckets: IndexedUsageBucket[],
  pricingEntries: ModelPricingEntry[]
): CostObservation[] =>
  buckets
    .filter(({ sessionId, occurredAt }) => Boolean(sessionId) && Boolean(occurredAt))
    .map((bucket) => {
      const sessionId = bucket.sessionId ?? '';
      const occurredAt = bucket.occurredAt ?? '';
      const modelKey = normalizeModelId(bucket.modelId);
      return toObservation(
        [bucket],
        {
          level: 'session',
          key: ['session', sessionId, modelKey].join(KEY_SEPARATOR),
          seriesKey: modelKey,
          baselineScope: 'project-model',
          occurredAt,
          projectPath: bucket.projectPath,
          projectName: bucket.projectName,
          modelId: bucket.modelId,
          sessionId,
        },
        pricingEntries
      );
    });

const hasSafeCoverage = (
  observation: CostObservation,
  settings: CostOptimizationSettings
): boolean => observation.coverage.percentage >= settings.minimumPricingCoveragePercentage;

const toAnomaly = (
  observation: CostObservation,
  history: CostObservation[],
  baselineScope: string,
  settings: CostOptimizationSettings
): CostAnomaly | undefined => {
  const baselineValues = history.map(({ actualCostUsd }) => actualCostUsd);
  const baselineCostUsd = median(baselineValues);
  const deviation = medianAbsoluteDeviation(baselineValues, baselineCostUsd);
  const scale =
    deviation > 0
      ? MAD_SCALE_FACTOR * deviation
      : Math.max(baselineCostUsd * ZERO_MAD_RELATIVE_SCALE, ZERO_MAD_ABSOLUTE_SCALE_USD);
  const score = (observation.actualCostUsd - baselineCostUsd) / scale;

  if (score < settings.anomalySensitivity) {
    return undefined;
  }

  const severity =
    score >= settings.anomalySensitivity * CRITICAL_SCORE_MULTIPLIER ? 'critical' : 'warning';
  const deviationRatio =
    baselineCostUsd > 0
      ? observation.actualCostUsd / baselineCostUsd
      : observation.actualCostUsd / ZERO_MAD_ABSOLUTE_SCALE_USD;

  return {
    id: observation.key,
    level: observation.level,
    severity,
    occurredAt: observation.occurredAt,
    date: observation.date,
    projectPath: observation.projectPath,
    projectName: observation.projectName,
    modelId: observation.modelId,
    sessionId: observation.sessionId,
    actualCostUsd: observation.actualCostUsd,
    baselineCostUsd,
    deviationRatio,
    score,
    sampleCount: history.length,
    baselineScope,
    coverage: observation.coverage,
    contributionIds: observation.contributionIds,
  };
};

const getPriorObservations = (
  observations: CostObservation[],
  current: CostObservation,
  settings: CostOptimizationSettings
): CostObservation[] =>
  observations
    .filter(
      (observation) =>
        observation.occurredAt < current.occurredAt && hasSafeCoverage(observation, settings)
    )
    .sort((first, second) => first.occurredAt.localeCompare(second.occurredAt))
    .slice(-settings.anomalyHistoryWindow);

const detectSeriesAnomalies = (
  observations: CostObservation[],
  query: CostOptimizationQuery,
  settings: CostOptimizationSettings,
  now: Date
): CostAnomaly[] => {
  const observationsBySeries = new Map<string, CostObservation[]>();

  observations.forEach((observation) => {
    const series = observationsBySeries.get(observation.seriesKey) ?? [];
    series.push(observation);
    observationsBySeries.set(observation.seriesKey, series);
  });

  return observations.flatMap((observation) => {
    if (!isObservationInQuery(observation, query, now) || !hasSafeCoverage(observation, settings)) {
      return [];
    }

    const history = getPriorObservations(
      observationsBySeries.get(observation.seriesKey) ?? [],
      observation,
      settings
    );

    if (history.length < settings.anomalyMinimumSamples) {
      return [];
    }

    const anomaly = toAnomaly(observation, history, observation.baselineScope, settings);
    return anomaly ? [anomaly] : [];
  });
};

const getSessionBaseline = (
  observations: CostObservation[],
  current: CostObservation,
  settings: CostOptimizationSettings
): { history: CostObservation[]; scope: string } | undefined => {
  const prior = observations.filter(
    (observation) =>
      observation.occurredAt < current.occurredAt && hasSafeCoverage(observation, settings)
  );
  const modelKey = normalizeModelId(current.modelId);
  const candidates: Array<{
    scope: string;
    observations: CostObservation[];
  }> = [
    {
      scope: 'project-model',
      observations: prior.filter(
        ({ projectPath, modelId }) =>
          projectPath === current.projectPath && normalizeModelId(modelId) === modelKey
      ),
    },
    {
      scope: 'model',
      observations: prior.filter(({ modelId }) => normalizeModelId(modelId) === modelKey),
    },
    { scope: 'global', observations: prior },
  ];

  for (const candidate of candidates) {
    const history = candidate.observations
      .sort((first, second) => first.occurredAt.localeCompare(second.occurredAt))
      .slice(-settings.anomalyHistoryWindow);

    if (history.length >= settings.anomalyMinimumSamples) {
      return { history, scope: candidate.scope };
    }
  }

  return undefined;
};

const detectSessionAnomalies = (
  observations: CostObservation[],
  query: CostOptimizationQuery,
  settings: CostOptimizationSettings,
  now: Date
): CostAnomaly[] =>
  observations.flatMap((observation) => {
    if (!isObservationInQuery(observation, query, now) || !hasSafeCoverage(observation, settings)) {
      return [];
    }

    const baseline = getSessionBaseline(observations, observation, settings);

    if (!baseline) {
      return [];
    }

    const anomaly = toAnomaly(observation, baseline.history, baseline.scope, settings);
    return anomaly ? [anomaly] : [];
  });

export const detectCostAnomalies = (
  index: CostOptimizationIndex,
  query: CostOptimizationQuery,
  pricingEntries: ModelPricingEntry[],
  settings: CostOptimizationSettings,
  now: Date = new Date()
): CostAnomaly[] => {
  const selectedProjectBuckets = query.projectPath
    ? Object.values(index.projectDayModelBuckets).filter(
        ({ projectPath }) => projectPath === query.projectPath
      )
    : undefined;
  const scopedDayBuckets = selectedProjectBuckets ?? Object.values(index.dayModelBuckets);
  const projectBuckets = Object.values(index.projectDayModelBuckets).filter(
    ({ projectPath }) => !query.projectPath || projectPath === query.projectPath
  );
  const sessionBuckets = Object.values(index.sessionModelBuckets).filter(
    ({ projectPath }) => !query.projectPath || projectPath === query.projectPath
  );

  const dayObservations = buildDayObservations(scopedDayBuckets, pricingEntries, query.projectPath);
  const projectObservations = buildProjectObservations(projectBuckets, pricingEntries);
  const modelObservations = buildModelObservations(
    scopedDayBuckets,
    pricingEntries,
    query.projectPath
  );
  const sessionObservations = buildSessionObservations(sessionBuckets, pricingEntries);
  const anomalies = [
    ...detectSeriesAnomalies(dayObservations, query, settings, now),
    ...detectSeriesAnomalies(projectObservations, query, settings, now),
    ...detectSeriesAnomalies(modelObservations, query, settings, now),
    ...detectSessionAnomalies(sessionObservations, query, settings, now),
  ];

  return anomalies.sort((first, second) => {
    const severityComparison =
      Number(second.severity === 'critical') - Number(first.severity === 'critical');
    const firstIncrease = first.actualCostUsd - first.baselineCostUsd;
    const secondIncrease = second.actualCostUsd - second.baselineCostUsd;
    return (
      severityComparison ||
      secondIncrease - firstIncrease ||
      second.occurredAt.localeCompare(first.occurredAt) ||
      first.id.localeCompare(second.id)
    );
  });
};
