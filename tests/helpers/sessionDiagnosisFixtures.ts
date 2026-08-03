import type { ModelPricingEntry } from '../../src/shared/budgetTypes';
import type {
  CostAnomaly,
  IndexedUsageContribution,
  PricingCoverage,
  SessionDiagnosisBaseline,
  SessionDiagnosisCause,
  SessionDiagnosisConfidence,
  SessionDiagnosisDetail,
  SessionDiagnosisDetailResult,
  SessionDiagnosisFindingSummary,
  SessionDiagnosisSeverity,
  SessionDiagnosisSummary,
  SessionDiagnosisTimelinePoint,
  UsageSourceChange,
} from '../../src/shared/costOptimizationTypes';
import type { NumericDiagnosisMetric } from '../../src/shared/sessionDiagnosisBaselines';
import type {
  SessionDiagnosisDetectorContext,
  SessionDiagnosisObservation,
} from '../../src/shared/sessionDiagnosisTypes';
import type { TokenUsage, UsageSlice } from '../../src/shared/usageTypes';
import { COVERAGE, PRICING, SETTINGS } from './costOptimizationFixtures';

export const makeSlice = (occurredAt: string, overrides: Partial<UsageSlice> = {}): UsageSlice => {
  const inputTokens = overrides.inputTokens ?? 1_000;
  const outputTokens = overrides.outputTokens ?? 100;

  return {
    occurredAt,
    modelId: overrides.modelId ?? 'gpt-source',
    inputTokens,
    cachedInputTokens: overrides.cachedInputTokens ?? 0,
    outputTokens,
    reasoningOutputTokens: overrides.reasoningOutputTokens ?? 0,
    totalTokens: overrides.totalTokens ?? inputTokens + outputTokens,
  };
};

export const makeContribution = (
  overrides: Partial<IndexedUsageContribution> = {}
): IndexedUsageContribution => ({
  id: overrides.id ?? 'source.jsonl\u001fsession\u001f2026-07-24T10:00:00.000Z\u001f0',
  sourceFile: overrides.sourceFile ?? 'source.jsonl',
  sessionId: overrides.sessionId ?? 'session',
  occurredAt: overrides.occurredAt ?? '2026-07-24T10:00:00.000Z',
  date: overrides.date ?? '2026-07-24',
  projectPath: overrides.projectPath ?? 'C:\\repo',
  projectName: overrides.projectName ?? 'repo',
  modelId: overrides.modelId ?? 'gpt-source',
  inputTokens: overrides.inputTokens ?? 1_000,
  cachedInputTokens: overrides.cachedInputTokens ?? 0,
  outputTokens: overrides.outputTokens ?? 100,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 0,
  totalTokens: overrides.totalTokens ?? 1_100,
});

export const makeDiagnosisObservation = (
  overrides: Partial<SessionDiagnosisObservation> = {}
): SessionDiagnosisObservation => ({
  diagnosisId: overrides.diagnosisId ?? 'source.jsonl\u001fsession',
  sourceFile: overrides.sourceFile ?? 'source.jsonl',
  sessionId: overrides.sessionId ?? 'session',
  startedAt: overrides.startedAt ?? '2026-07-24T10:00:00.000Z',
  endedAt: overrides.endedAt ?? '2026-07-24T10:10:00.000Z',
  projectPath: overrides.projectPath ?? 'C:\\repo',
  projectName: overrides.projectName ?? 'repo',
  eventCount: overrides.eventCount ?? 1,
  dominantModelId: overrides.dominantModelId ?? 'gpt-source',
  contributions: overrides.contributions ?? [makeContribution()],
  pricedCostUsd: overrides.pricedCostUsd ?? 1,
  coverage: overrides.coverage ?? COVERAGE,
  inputTokens: overrides.inputTokens ?? 1_000,
  cachedInputTokens: overrides.cachedInputTokens ?? 0,
  outputTokens: overrides.outputTokens ?? 100,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 0,
  totalTokens: overrides.totalTokens ?? 1_100,
  ...(overrides.threadName ? { threadName: overrides.threadName } : {}),
});

export const makeDiagnosisObservationWithSlices = (
  slices: UsageSlice[],
  overrides: Partial<SessionDiagnosisObservation> = {}
): SessionDiagnosisObservation =>
  makeDiagnosisObservation({
    ...sumSlices(slices),
    ...overrides,
    eventCount: overrides.eventCount ?? slices.length,
    contributions: slices.map((slice, index) =>
      makeContribution({
        id: `source.jsonl\u001fsession\u001f${slice.occurredAt}\u001f${index}`,
        ...slice,
      })
    ),
  });

export const makeDiagnosisSourceChange = (
  sourceFile: string,
  sessionId: string,
  startedAt: string,
  slices: UsageSlice[],
  projectPath = 'C:\\repo'
): UsageSourceChange => ({
  sourceFile,
  fingerprint: `${sessionId}:${slices.length}`,
  session: {
    sessionId,
    startedAt,
    endedAt: slices.at(-1)?.occurredAt ?? startedAt,
    projectPath,
    projectName: projectPath.split('\\').pop() || 'Unknown Project',
    usageSlices: slices.map((slice) => ({ ...slice })),
    ...sumSlices(slices),
    eventCount: slices.length,
    sourceFile,
    warnings: [],
  },
});

export const makeDetectorContext = (
  current: SessionDiagnosisObservation,
  history: SessionDiagnosisObservation[],
  settingOverrides: Partial<typeof SETTINGS> = {},
  pricing: ModelPricingEntry[] = PRICING
): SessionDiagnosisDetectorContext => ({
  current,
  history,
  settings: { ...SETTINGS, ...settingOverrides },
  pricing,
});

export const makeNumericMetric = (
  diagnosisId: string,
  occurredAt: string,
  value: number,
  overrides: Partial<NumericDiagnosisMetric> = {}
): NumericDiagnosisMetric => ({
  diagnosisId,
  occurredAt,
  projectPath: overrides.projectPath ?? 'C:\\repo',
  dominantModelId: overrides.dominantModelId ?? 'gpt-source',
  value,
});

export const makeSessionAnomaly = (sessionId: string): CostAnomaly => ({
  id: `anomaly-${sessionId}`,
  level: 'session',
  severity: 'warning',
  occurredAt: '2026-07-24T10:00:00.000Z',
  sessionId,
  actualCostUsd: 2,
  baselineCostUsd: 1,
  deviationRatio: 2,
  score: 4,
  sampleCount: 7,
  baselineScope: 'model',
  coverage: COVERAGE,
  contributionIds: [],
});

const sumSlices = (slices: UsageSlice[]): TokenUsage =>
  slices.reduce<TokenUsage>(
    (total, slice) => ({
      inputTokens: total.inputTokens + slice.inputTokens,
      cachedInputTokens: total.cachedInputTokens + slice.cachedInputTokens,
      outputTokens: total.outputTokens + slice.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens + slice.reasoningOutputTokens,
      totalTokens: total.totalTokens + slice.totalTokens,
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    }
  );

export const makeCoverage = (
  totalTokens: number,
  percentage: number,
  unpricedModelIds: string[] = []
): PricingCoverage => {
  const pricedTokens = (totalTokens * percentage) / 100;

  return {
    pricedTokens,
    exactPricedTokens: pricedTokens,
    assumedTokens: 0,
    unpricedTokens: totalTokens - pricedTokens,
    totalTokens,
    percentage,
    exactPercentage: percentage,
    assumedPercentage: 0,
    unpricedModelIds: [...unpricedModelIds],
  };
};

export const makeFindingSummary = (
  cause: SessionDiagnosisCause,
  severity: SessionDiagnosisSeverity,
  confidence: SessionDiagnosisConfidence,
  baseline?: SessionDiagnosisBaseline
): SessionDiagnosisFindingSummary => ({
  cause,
  severity,
  confidence,
  normalizedScore: severity === 'critical' ? 1 : 0.5,
  ...(baseline ? { baseline } : {}),
});

export const makeDiagnosisSummary = (
  sessionId: string,
  overrides: Partial<SessionDiagnosisSummary> = {}
): SessionDiagnosisSummary => ({
  diagnosisId: overrides.diagnosisId ?? `${sessionId}.jsonl\u001f${sessionId}`,
  sourceFile: overrides.sourceFile ?? `${sessionId}.jsonl`,
  sessionId,
  startedAt: overrides.startedAt ?? '2026-07-24T10:00:00.000Z',
  projectPath: overrides.projectPath ?? 'C:\\repo',
  projectName: overrides.projectName ?? 'repo',
  eventCount: overrides.eventCount ?? 3,
  pricedCostUsd: overrides.pricedCostUsd ?? 1.25,
  coverage: overrides.coverage ?? COVERAGE,
  tokenPercentile: overrides.tokenPercentile ?? 1,
  impactPercentile: overrides.impactPercentile ?? 1,
  requiresAttention: overrides.requiresAttention ?? true,
  primaryFinding:
    'primaryFinding' in overrides
      ? overrides.primaryFinding
      : makeFindingSummary('input-growth', 'critical', 'high'),
  additionalFindingCount: overrides.additionalFindingCount ?? 0,
  inputTokens: overrides.inputTokens ?? 10_000,
  cachedInputTokens: overrides.cachedInputTokens ?? 2_000,
  outputTokens: overrides.outputTokens ?? 1_000,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 200,
  totalTokens: overrides.totalTokens ?? 11_000,
  ...(overrides.threadName ? { threadName: overrides.threadName } : {}),
  ...(overrides.pricedCostPercentile !== undefined
    ? {
        pricedCostPercentile: overrides.pricedCostPercentile,
      }
    : {}),
  ...(overrides.anomalySeverity ? { anomalySeverity: overrides.anomalySeverity } : {}),
});

export const makeDiagnosisSummaries = (): SessionDiagnosisSummary[] => [
  makeDiagnosisSummary('attention'),
  makeDiagnosisSummary('normal', {
    requiresAttention: false,
    primaryFinding: undefined,
    additionalFindingCount: 0,
    impactPercentile: 0.2,
  }),
];

export const makePartiallyPricedDiagnosisSummary = (): SessionDiagnosisSummary =>
  makeDiagnosisSummary('partial', {
    coverage: {
      pricedTokens: 8_000,
      exactPricedTokens: 8_000,
      assumedTokens: 0,
      unpricedTokens: 3_000,
      totalTokens: 11_000,
      percentage: 72.7272727273,
      exactPercentage: 72.7272727273,
      assumedPercentage: 0,
      unpricedModelIds: ['unknown-model'],
    },
    pricedCostUsd: 0.75,
    pricedCostPercentile: undefined,
  });

export const makeDiagnosisTimelinePoints = (): SessionDiagnosisTimelinePoint[] => [
  {
    contributionId: 'first',
    occurredAt: '2026-07-24T10:00:00.000Z',
    modelId: 'gpt-source',
    inputTokens: 4_000,
    cachedInputTokens: 2_000,
    outputTokens: 500,
    reasoningOutputTokens: 100,
    totalTokens: 4_500,
  },
  {
    contributionId: 'second',
    occurredAt: '2026-07-24T10:10:00.000Z',
    modelId: 'gpt-target',
    inputTokens: 16_000,
    cachedInputTokens: 1_000,
    outputTokens: 2_000,
    reasoningOutputTokens: 800,
    totalTokens: 18_000,
  },
];

export const makeDiagnosisDetail = (): SessionDiagnosisDetail => ({
  summary: makeDiagnosisSummary('detail', {
    additionalFindingCount: 1,
  }),
  detectors: [
    {
      state: 'finding',
      cause: 'input-growth',
      severity: 'critical',
      confidence: 'high',
      normalizedScore: 1,
      evidence: {
        kind: 'input-growth',
        earlyMedianTokens: 4_000,
        lateMedianTokens: 16_000,
        growthRatio: 4,
        absoluteGrowthTokens: 12_000,
      },
    },
    {
      state: 'not-found',
      cause: 'cache-degradation',
      reason: 'within-normal-range',
    },
    {
      state: 'insufficient-data',
      cause: 'generation-concentration',
      reason: 'insufficient-history',
    },
    {
      state: 'not-applicable',
      cause: 'model-cost-dominance',
      reason: 'pricing-incomplete',
    },
    {
      state: 'finding',
      cause: 'interaction-accumulation',
      severity: 'warning',
      confidence: 'medium',
      normalizedScore: 0.5,
      evidence: {
        kind: 'interaction-accumulation',
        eventCount: 23,
        durationMs: 5_400_000,
        maxSliceShare: 0.2,
      },
    },
  ],
  timeline: makeDiagnosisTimelinePoints(),
  invalidTimelinePointCount: 0,
});

export const makeReadyDiagnosisResult = (
  diagnosisId = 'detail.jsonl\u001fdetail'
): SessionDiagnosisDetailResult => {
  const detail = makeDiagnosisDetail();

  return {
    kind: 'ready',
    detail: {
      ...detail,
      summary: { ...detail.summary, diagnosisId },
    },
  };
};
