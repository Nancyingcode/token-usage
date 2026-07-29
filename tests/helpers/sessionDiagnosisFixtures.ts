import type { ModelPricingEntry } from '../../src/shared/budgetTypes';
import type {
  CostAnomaly,
  IndexedUsageContribution,
  PricingCoverage,
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
    unpricedTokens: totalTokens - pricedTokens,
    totalTokens,
    percentage,
    unpricedModelIds: [...unpricedModelIds],
  };
};
