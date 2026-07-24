import { describe, expect, it } from 'vitest';
import { evaluateBudgets } from '../src/shared/budgetEvaluation';
import type {
  BudgetPolicy,
  EvaluateBudgetsInput,
  ModelPricingEntry,
} from '../src/shared/budgetTypes';
import { addTokenUsage, emptyTokenUsage, getProjectName } from '../src/shared/usageMath';
import type { TokenUsage, UsageSession, UsageSlice } from '../src/shared/usageTypes';

describe('budget evaluation', () => {
  it('evaluates project day budgets from slices inside the natural day', () => {
    const snapshot = evaluateBudgets({
      sessions: [
        makeSession('C:\\repo', [
          sliceAt(2026, 6, 20, 900, 'gpt-test'),
          sliceAt(2026, 6, 19, 700, 'gpt-test'),
        ]),
      ],
      policies: [
        makePolicy({
          scope: 'project',
          projectPath: 'c:/REPO',
          period: 'day',
          tokenLimit: 1_000,
        }),
      ],
      thresholds: { warningPercent: 80, criticalPercent: 100 },
      pricing: [makePricing('gpt-test')],
      now: new Date(2026, 6, 20, 12, 0),
      dataState: 'fresh',
    });

    expect(snapshot.statuses[0].token).toEqual(
      expect.objectContaining({ used: 900, percent: 90, severity: 'warning' })
    );
    expect(snapshot.statuses[0].periodStart).toBe(new Date(2026, 6, 20, 0, 0).toISOString());
  });

  it('marks cost progress incomplete when any token cannot be priced', () => {
    const snapshot = evaluateBudgets(makeEvaluationInputWithUnknownModel());

    expect(snapshot.statuses[0].cost).toEqual(
      expect.objectContaining({ used: 0, incomplete: true })
    );
    expect(snapshot.statuses[0].unpricedTokens).toBe(900);
    expect(snapshot.unpricedModels).toEqual([{ modelId: undefined, totalTokens: 900 }]);
  });

  it('distinguishes warning, critical, and over-budget progress', () => {
    const baseInput = makeEvaluationInputWithTokens(85, {
      warningPercent: 80,
      criticalPercent: 90,
    });

    expect(evaluateBudgets(baseInput).statuses[0].token?.severity).toBe('warning');
    expect(
      evaluateBudgets(makeEvaluationInputWithTokens(95, baseInput.thresholds)).statuses[0].token
        ?.severity
    ).toBe('critical');
    expect(
      evaluateBudgets(makeEvaluationInputWithTokens(100, baseInput.thresholds)).statuses[0].token
        ?.severity
    ).toBe('over');
  });

  it('generates one alert for each reached threshold', () => {
    const snapshot = evaluateBudgets(
      makeEvaluationInputWithTokens(110, { warningPercent: 80, criticalPercent: 100 })
    );

    expect(snapshot.alerts.map(({ thresholdPercent }) => thresholdPercent)).toEqual([80, 100]);
    expect(snapshot.alerts[1]).toEqual(
      expect.objectContaining({
        metric: 'token',
        thresholdPercent: 100,
        period: 'day',
        severity: 'over',
      })
    );
    expect(snapshot.summary).toEqual({ warningCount: 0, overCount: 1, unpricedModelCount: 0 });
  });

  it('preserves stale scan details in the snapshot', () => {
    const snapshot = evaluateBudgets({
      ...makeEvaluationInputWithTokens(10, { warningPercent: 80, criticalPercent: 100 }),
      dataState: 'stale',
      staleReason: 'Session scan failed.',
    });

    expect(snapshot).toEqual(
      expect.objectContaining({ dataState: 'stale', staleReason: 'Session scan failed.' })
    );
  });
});

const sliceAt = (
  year: number,
  month: number,
  day: number,
  totalTokens: number,
  modelId?: string
): UsageSlice => ({
  occurredAt: new Date(year, month, day, 10, 0).toISOString(),
  modelId,
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
});

const makePolicy = (overrides: Partial<BudgetPolicy> = {}): BudgetPolicy => ({
  id: 'policy-1',
  scope: 'global',
  period: 'day',
  tokenLimit: 100,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  ...overrides,
});

const makePricing = (modelId: string): ModelPricingEntry => ({
  modelId,
  aliases: [],
  inputUsdPerMillion: 1,
  cachedInputUsdPerMillion: 0.1,
  outputUsdPerMillion: 5,
  effectiveAt: '2026-07-20',
  sourceKind: 'built-in',
});

const makeSession = (projectPath: string, usageSlices: UsageSlice[]): UsageSession => {
  const totals = usageSlices.reduce<TokenUsage>(
    (total, slice) => addTokenUsage(total, slice),
    emptyTokenUsage()
  );

  return {
    sessionId: 'session-1',
    startedAt: usageSlices[0]?.occurredAt ?? '2026-07-20T00:00:00.000Z',
    endedAt: usageSlices.at(-1)?.occurredAt ?? '2026-07-20T00:00:00.000Z',
    projectPath,
    projectName: getProjectName(projectPath),
    usageSlices,
    ...totals,
    eventCount: usageSlices.length,
    sourceFile: 'session-1.jsonl',
    warnings: [],
  };
};

const makeEvaluationInputWithUnknownModel = (): EvaluateBudgetsInput => ({
  sessions: [makeSession('C:\\repo', [sliceAt(2026, 6, 20, 900)])],
  policies: [makePolicy({ costLimitUsd: 1, tokenLimit: undefined })],
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  pricing: [],
  now: new Date(2026, 6, 20, 12, 0),
  dataState: 'fresh',
});

const makeEvaluationInputWithTokens = (
  totalTokens: number,
  thresholds: EvaluateBudgetsInput['thresholds']
): EvaluateBudgetsInput => ({
  sessions: [makeSession('C:\\repo', [sliceAt(2026, 6, 20, totalTokens, 'gpt-test')])],
  policies: [makePolicy()],
  thresholds,
  pricing: [makePricing('gpt-test')],
  now: new Date(2026, 6, 20, 12, 0),
  dataState: 'fresh',
});
