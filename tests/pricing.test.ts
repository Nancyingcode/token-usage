import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_PRICING } from '../src/main/defaultModelPricing';
import {
  buildDailyCostEstimates,
  calculateEstimatedCost,
  mergeModelPricing,
  normalizeModelId,
  calculateUsageCost,
  calculateUsageCostBreakdown,
} from '../src/shared/pricing';
import type { ModelPricingEntry, ModelPricingOverride } from '../src/shared/budgetTypes';
import type { UsageSlice } from '../src/shared/usageTypes';
import { getLatestModelSeriesIds } from '../src/shared/latestModelSeries';

const TEST_PRICING: ModelPricingEntry = {
  modelId: 'gpt-test',
  aliases: ['gpt-test-alias'],
  inputUsdPerMillion: 2,
  cachedInputUsdPerMillion: 0.5,
  outputUsdPerMillion: 10,
  effectiveAt: '2026-07-20',
  sourceKind: 'built-in',
  sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-test',
};

describe('pricing', () => {
  it('splits regular input, cached input, and output cost without changing the total', () => {
    const usage = makeSlice('2026-07-20T00:00:00.000Z', 'gpt-test', 100, 40, 20, 5, 120);
    const frozenUsage = Object.freeze({ ...usage });
    const frozenPricing = Object.freeze({ ...TEST_PRICING });

    const breakdown = calculateUsageCostBreakdown(frozenUsage, frozenPricing);

    expect(breakdown).toEqual({
      regularInputCostUsd: 0.00012,
      cachedInputCostUsd: 0.00002,
      outputCostUsd: 0.0002,
    });
    expect(
      breakdown.regularInputCostUsd + breakdown.cachedInputCostUsd + breakdown.outputCostUsd
    ).toBeCloseTo(calculateUsageCost(frozenUsage, frozenPricing), 12);
    expect(frozenUsage.reasoningOutputTokens).toBe(5);
    expect(frozenPricing.outputUsdPerMillion).toBe(10);
  });

  it('normalizes model ids for shared price matching', () => {
    expect(normalizeModelId('  GPT-Test  ')).toBe('gpt-test');
  });

  it('prices cached input separately and does not add reasoning twice', () => {
    const estimate = calculateEstimatedCost(
      [makeSlice('2026-07-20T00:00:00.000Z', 'gpt-test', 100, 40, 20, 5, 120)],
      [TEST_PRICING]
    );

    expect(estimate.pricedCostUsd).toBeCloseTo(0.00034, 8);
    expect(estimate.unpricedTokens).toBe(0);
  });

  it('matches model aliases without changing their canonical price entry', () => {
    const estimate = calculateEstimatedCost(
      [makeSlice('2026-07-20T00:00:00.000Z', 'GPT-TEST-ALIAS', 100, 0, 0, 0, 100)],
      [TEST_PRICING]
    );

    expect(estimate.pricedCostUsd).toBeCloseTo(0.0002, 8);
    expect(TEST_PRICING.modelId).toBe('gpt-test');
  });

  it('keeps unknown model tokens unpriced', () => {
    const estimate = calculateEstimatedCost(
      [makeSlice('2026-07-20T00:00:00.000Z', 'future-model', 10, 0, 2, 0, 12)],
      []
    );

    expect(estimate).toEqual({
      pricedCostUsd: 0,
      assumedCostUsd: 0,
      assumedTokens: 0,
      unpricedTokens: 12,
      unpricedModelIds: ['future-model'],
    });
  });

  it('uses fallback pricing only when the model id is missing or blank', () => {
    const fallback = {
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 10,
      updatedAt: '2026-08-03T00:00:00.000Z',
    };
    const estimate = calculateEstimatedCost(
      [
        makeSlice('2026-07-20T00:00:00.000Z', '', 100, 40, 20, 5, 120),
        makeSlice('2026-07-20T00:01:00.000Z', 'future-model', 50, 0, 0, 0, 50),
      ],
      [],
      fallback
    );

    expect(estimate).toEqual({
      pricedCostUsd: 0.00034,
      assumedCostUsd: 0.00034,
      assumedTokens: 120,
      unpricedTokens: 50,
      unpricedModelIds: ['future-model'],
    });
  });

  it('lets user overrides replace a built-in model case-insensitively', () => {
    const override: ModelPricingOverride = {
      modelId: 'GPT-TEST',
      aliases: ['custom-alias'],
      inputUsdPerMillion: 3,
      cachedInputUsdPerMillion: 1,
      outputUsdPerMillion: 12,
      updatedAt: '2026-07-20T10:00:00.000Z',
    };

    expect(mergeModelPricing([TEST_PRICING], [override])).toEqual([
      expect.objectContaining({
        modelId: 'GPT-TEST',
        aliases: ['custom-alias'],
        inputUsdPerMillion: 3,
        effectiveAt: override.updatedAt,
        sourceKind: 'override',
        sourceUrl: TEST_PRICING.sourceUrl,
      }),
    ]);
  });

  it('includes prices for models currently emitted by Codex logs', () => {
    const modelIds = DEFAULT_MODEL_PRICING.map(({ modelId }) => modelId);

    expect(modelIds).toEqual(
      expect.arrayContaining(['gpt-5.5', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'])
    );
    expect(
      DEFAULT_MODEL_PRICING.find(({ modelId }) => modelId === 'gpt-5.6-sol')?.aliases
    ).toContain('gpt-5.6');
  });

  it('limits the current optimization series to the built-in 5.6 variants', () => {
    expect(getLatestModelSeriesIds(DEFAULT_MODEL_PRICING)).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
  });

  it('keeps an overridden latest model in the latest optimization series', () => {
    const override: ModelPricingOverride = {
      modelId: 'GPT-5.6-SOL',
      aliases: ['gpt-5.6'],
      inputUsdPerMillion: 4,
      cachedInputUsdPerMillion: 0.4,
      outputUsdPerMillion: 24,
      updatedAt: '2026-08-10T00:00:00.000Z',
    };
    const pricing = mergeModelPricing(DEFAULT_MODEL_PRICING, [override]);

    expect(getLatestModelSeriesIds(pricing)).toEqual([
      'GPT-5.6-SOL',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
    ]);
  });

  it('groups cost estimates by the slice local day', () => {
    const firstDay = new Date(2026, 6, 19, 23, 30);
    const secondDay = new Date(2026, 6, 20, 0, 30);
    const estimates = buildDailyCostEstimates(
      [
        makeSession([
          makeSlice(firstDay.toISOString(), 'gpt-test', 100, 0, 0, 0, 100),
          makeSlice(secondDay.toISOString(), 'future-model', 50, 0, 0, 0, 50),
        ]),
      ],
      [TEST_PRICING]
    );

    expect(estimates).toEqual([
      expect.objectContaining({ date: '2026-07-19', unpricedTokens: 0 }),
      expect.objectContaining({ date: '2026-07-20', unpricedTokens: 50 }),
    ]);
  });
});

const makeSlice = (
  occurredAt: string,
  modelId: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningOutputTokens: number,
  totalTokens: number
): UsageSlice => ({
  occurredAt,
  modelId,
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens,
  totalTokens,
});

const makeSession = (usageSlices: UsageSlice[]) => ({
  sessionId: 'pricing-session',
  startedAt: usageSlices[0]?.occurredAt ?? new Date(0).toISOString(),
  endedAt: usageSlices.at(-1)?.occurredAt ?? new Date(0).toISOString(),
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
  sourceFile: 'pricing-session.jsonl',
  warnings: [],
});
