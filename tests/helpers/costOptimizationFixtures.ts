import type { ModelPricingEntry } from '../../src/shared/budgetTypes';
import type {
  CostForecast,
  CostOptimizationIndex,
  CostOptimizationSnapshot,
  IndexedUsageBucket,
  PricingCoverage,
  UsageSourceChange,
} from '../../src/shared/costOptimizationTypes';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../../src/shared/costOptimizationValidation';

export const FIXED_NOW = new Date('2026-07-25T12:00:00.000Z');
export const FIXED_NOW_ISO = FIXED_NOW.toISOString();
export const SETTINGS = {
  ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
  candidateModelIds: ['gpt-target'],
};
export const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-source',
    aliases: [],
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 10,
    effectiveAt: '2026-07-01',
    sourceKind: 'built-in',
  },
  {
    modelId: 'gpt-target',
    aliases: [],
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 5,
    effectiveAt: '2026-07-01',
    sourceKind: 'built-in',
  },
];
export const COVERAGE: PricingCoverage = {
  pricedTokens: 1_100_000,
  exactPricedTokens: 1_100_000,
  assumedTokens: 0,
  unpricedTokens: 0,
  totalTokens: 1_100_000,
  percentage: 100,
  exactPercentage: 100,
  assumedPercentage: 0,
  unpricedModelIds: [],
};

export const makeBucket = (
  modelId: string | undefined,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): IndexedUsageBucket => ({
  id: `${modelId ?? 'unknown'}:2026-07-24`,
  date: '2026-07-24',
  modelId,
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens: 0,
  totalTokens: inputTokens + outputTokens,
  memberCounts: { session: 1 },
  contributionCounts: { contribution: 1 },
});

export const makeIndex = (buckets: IndexedUsageBucket[]): CostOptimizationIndex => ({
  schemaVersion: 2,
  sessionsDir: 'C:\\sessions',
  generatedAt: FIXED_NOW_ISO,
  sources: {},
  dayModelBuckets: Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket])),
  projectDayModelBuckets: {},
  sessionModelBuckets: {},
});

export const makeSourceChange = (
  sourceFile: string,
  fingerprint: string,
  totalTokens: number
): UsageSourceChange => ({
  sourceFile,
  fingerprint,
  session: {
    sessionId: sourceFile,
    startedAt: '2026-07-24T12:00:00.000Z',
    endedAt: '2026-07-24T12:00:00.000Z',
    projectPath: 'C:\\repo',
    projectName: 'repo',
    usageSlices: [
      {
        occurredAt: '2026-07-24T12:00:00.000Z',
        modelId: 'gpt-source',
        inputTokens: totalTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens,
      },
    ],
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
    eventCount: 1,
    sourceFile,
    warnings: [],
  },
});

export const READY_FORECAST: CostForecast = {
  kind: 'ready',
  method: 'weekday-trend',
  intervalKind: 'empirical-80',
  historyDays: 56,
  horizonDays: 30,
  points: [
    {
      date: '2026-07-26',
      predictedCostUsd: 2,
      lowerCostUsd: 1,
      upperCostUsd: 3,
    },
  ],
  projectedCostUsd: 60,
  periodEndProjectedCostUsd: 63.7,
  budgetCrossings: [
    {
      policyId: 'monthly-cost',
      date: '2026-08-20',
      projectedCostUsd: 70,
      limitUsd: 70,
    },
  ],
  coverage: COVERAGE,
};

export const SNAPSHOT: CostOptimizationSnapshot = {
  generatedAt: FIXED_NOW_ISO,
  dataState: 'fresh',
  warnings: [],
  settings: SETTINGS,
  query: { period: 'month' },
  pricing: PRICING,
  budgets: [],
  coverage: COVERAGE,
  currentCostUsd: 48.2,
  modelRows: [
    {
      modelId: 'gpt-source',
      inputTokens: 1_000_000,
      cachedInputTokens: 200_000,
      outputTokens: 100_000,
      reasoningOutputTokens: 0,
      totalTokens: 1_100_000,
      sessionCount: 7,
      pricedCostUsd: 2.7,
      costShare: 1,
      averageSessionCostUsd: 2.7 / 7,
      coverage: COVERAGE,
    },
  ],
  substitutionScenarios: [
    {
      sourceModelId: 'gpt-source',
      targetModelId: 'gpt-target',
      actualCostUsd: 2.7,
      scenarioCostUsd: 1.35,
      savingsUsd: 1.35,
      affectedSessionCount: 7,
      contributionIds: ['contribution-1'],
    },
  ],
  anomalies: [
    {
      id: 'day-2026-07-24',
      level: 'day',
      severity: 'warning',
      occurredAt: '2026-07-24T23:59:59.000Z',
      date: '2026-07-24',
      actualCostUsd: 8,
      baselineCostUsd: 3,
      deviationRatio: 8 / 3,
      score: 4,
      sampleCount: 28,
      baselineScope: 'global-day',
      coverage: COVERAGE,
      contributionIds: ['contribution-1'],
    },
    {
      id: 'session-session-1',
      level: 'session',
      severity: 'critical',
      occurredAt: '2026-07-24T12:00:00.000Z',
      sessionId: 'session-1',
      projectPath: 'C:\\repo',
      projectName: 'repo',
      modelId: 'gpt-source',
      actualCostUsd: 5,
      baselineCostUsd: 1,
      deviationRatio: 5,
      score: 8,
      sampleCount: 28,
      baselineScope: 'project-model',
      coverage: COVERAGE,
      contributionIds: ['contribution-1'],
    },
  ],
  diagnostics: [],
  forecast: READY_FORECAST,
  recommendations: [
    {
      id: 'model-substitution:gpt-source:gpt-target',
      type: 'model-substitution',
      titleKey: 'recommendation.modelSubstitution',
      scopeLabel: 'gpt-source → gpt-target',
      savingsUsd: 11.8,
      confidence: 'high',
      evidence: [
        { kind: 'sessions', count: 7 },
        { kind: 'pricing-coverage', percentage: 100 },
      ],
      riskKey: 'risk.modelEquivalence',
      contributionSavings: { 'contribution-1': 11.8 },
    },
  ],
  conservativeSavingsUsd: 17.4,
  cacheStats: {
    upsertedSources: 0,
    removedSources: 0,
    reusedSources: 1,
  },
};
