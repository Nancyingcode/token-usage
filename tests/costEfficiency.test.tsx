import { describe, expect, it } from 'vitest';
import { buildCostEfficiency } from '../src/renderer/utils/costEfficiency';
import type { ModelPricingEntry, UnknownModelPricing } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession, UsageSlice } from '../src/shared/usageTypes';

const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-test',
    aliases: [],
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 10,
    effectiveAt: '2026-08-04',
    sourceKind: 'built-in',
  },
];

const FALLBACK: UnknownModelPricing = {
  inputUsdPerMillion: 4,
  cachedInputUsdPerMillion: 1,
  outputUsdPerMillion: 12,
  updatedAt: '2026-08-04T00:00:00.000Z',
};

describe('buildCostEfficiency', () => {
  it('builds cost, unit cost, session average, coverage, and component breakdown', () => {
    const summary = buildUsageSummary([
      makeSession('exact', [
        makeSlice('2026-08-01T08:00:00.000Z', 'gpt-test', 1_000_000, 400_000, 200_000),
      ]),
    ]);

    const efficiency = buildCostEfficiency(summary, PRICING);

    expect(efficiency.pricedCostUsd).toBeCloseTo(3.4, 8);
    expect(efficiency.unitCostUsdPerMillion).toBeCloseTo(3.4 / 1.2, 8);
    expect(efficiency.averageSessionCostUsd).toBeCloseTo(3.4, 8);
    expect(efficiency.coverage).toEqual({
      totalTokens: 1_200_000,
      pricedTokens: 1_200_000,
      exactPricedTokens: 1_200_000,
      assumedTokens: 0,
      unpricedTokens: 0,
      percentage: 100,
      exactPercentage: 100,
      assumedPercentage: 0,
      unpricedPercentage: 0,
      unpricedModelIds: [],
    });
    expect(efficiency.breakdown).toEqual([
      { kind: 'regular-input', costUsd: 1.2, percentage: expect.closeTo(35.2941176471) },
      { kind: 'cached-input', costUsd: 0.2, percentage: expect.closeTo(5.8823529412) },
      { kind: 'output', costUsd: 2, percentage: expect.closeTo(58.8235294118) },
    ]);
  });

  it('separates exact, assumed, and unpriced tokens without understating unit cost', () => {
    const summary = buildUsageSummary([
      makeSession('mixed', [
        makeSlice('2026-08-02T08:00:00.000Z', 'gpt-test', 100, 0, 0),
        makeSlice('2026-08-02T09:00:00.000Z', undefined, 50, 0, 0),
        makeSlice('2026-08-02T10:00:00.000Z', 'future-model', 25, 0, 0),
      ]),
    ]);

    const efficiency = buildCostEfficiency(summary, PRICING, FALLBACK);

    expect(efficiency.coverage).toMatchObject({
      totalTokens: 175,
      pricedTokens: 150,
      exactPricedTokens: 100,
      assumedTokens: 50,
      unpricedTokens: 25,
      unpricedModelIds: ['future-model'],
    });
    expect(efficiency.coverage.percentage).toBeCloseTo((150 / 175) * 100, 8);
    expect(efficiency.coverage.exactPercentage).toBeCloseTo((100 / 175) * 100, 8);
    expect(efficiency.coverage.assumedPercentage).toBeCloseTo((50 / 175) * 100, 8);
    expect(efficiency.coverage.unpricedPercentage).toBeCloseTo((25 / 175) * 100, 8);
    expect(efficiency.pricedCostUsd).toBeCloseTo(0.0004, 10);
    expect(efficiency.unitCostUsdPerMillion).toBeCloseTo((0.0004 / 150) * 1_000_000, 8);
  });

  it('distinguishes no priced tokens from a real zero priced cost', () => {
    const unpriced = buildCostEfficiency(
      buildUsageSummary([
        makeSession('unpriced', [makeSlice('2026-08-03T08:00:00.000Z', 'future-model', 20, 0, 0)]),
      ]),
      PRICING
    );
    const empty = buildCostEfficiency(buildUsageSummary([]), PRICING);

    expect(unpriced.pricedCostUsd).toBe(0);
    expect(unpriced.unitCostUsdPerMillion).toBeNull();
    expect(unpriced.coverage.percentage).toBe(0);
    expect(unpriced.days[0]).toMatchObject({
      pricedCostUsd: 0,
      unitCostUsdPerMillion: null,
    });
    expect(empty.coverage.percentage).toBeNull();
    expect(empty.averageSessionCostUsd).toBeNull();
    expect(empty.days).toEqual([]);
  });

  it('uses slice-local dates, keeps the latest thirty days, and does not mutate inputs', () => {
    const sessions = Array.from({ length: 31 }, (_, index) => {
      const occurredAt = new Date(2026, 6, index + 1, 12).toISOString();
      return makeSession(`day-${index + 1}`, [makeSlice(occurredAt, 'gpt-test', index + 1, 0, 0)]);
    });
    const summary = buildUsageSummary(sessions);
    Object.freeze(summary.sessions);
    Object.freeze(summary.byDay);
    Object.freeze(summary.totals);
    const pricing = PRICING.map((entry) => Object.freeze({ ...entry }));
    Object.freeze(pricing);

    const efficiency = buildCostEfficiency(summary, pricing);

    expect(efficiency.days).toHaveLength(30);
    expect(efficiency.days[0]?.date).toBe('2026-07-02');
    expect(efficiency.days.at(-1)?.date).toBe('2026-07-31');
    expect(efficiency.days.at(-1)?.pricedCostUsd).toBeCloseTo((31 * 2) / 1_000_000, 12);
    expect(summary.sessions).toHaveLength(31);
    expect(pricing[0]?.modelId).toBe('gpt-test');
  });
});

const makeSlice = (
  occurredAt: string,
  modelId: string | undefined,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): UsageSlice => ({
  occurredAt,
  ...(modelId === undefined ? {} : { modelId }),
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens: 0,
  totalTokens: inputTokens + outputTokens,
});

const makeSession = (sessionId: string, usageSlices: UsageSlice[]): UsageSession => ({
  sessionId,
  startedAt: usageSlices[0]?.occurredAt ?? '2026-08-04T00:00:00.000Z',
  endedAt: usageSlices.at(-1)?.occurredAt ?? '2026-08-04T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  turnOutcomes: [],
  usageSlices,
  inputTokens: usageSlices.reduce((total, slice) => total + slice.inputTokens, 0),
  cachedInputTokens: usageSlices.reduce((total, slice) => total + slice.cachedInputTokens, 0),
  outputTokens: usageSlices.reduce((total, slice) => total + slice.outputTokens, 0),
  reasoningOutputTokens: usageSlices.reduce(
    (total, slice) => total + slice.reasoningOutputTokens,
    0
  ),
  totalTokens: usageSlices.reduce((total, slice) => total + slice.totalTokens, 0),
  eventCount: usageSlices.length,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});
