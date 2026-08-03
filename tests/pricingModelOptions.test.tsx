import { describe, expect, it } from 'vitest';
import { buildPricingModelOptions } from '../src/renderer/utils/pricingModelOptions';
import type { ModelPricingEntry, UnpricedModelSummary } from '../src/shared/budgetTypes';

const makePricing = (modelId: string): ModelPricingEntry => ({
  modelId,
  aliases: [],
  inputUsdPerMillion: 1,
  cachedInputUsdPerMillion: 0.1,
  outputUsdPerMillion: 5,
  effectiveAt: '2026-08-03',
  sourceKind: 'built-in',
});

describe('pricing model options', () => {
  it('builds priced and unpriced model options with stable grouping and normalization', () => {
    const pricing = [makePricing('gpt-z'), makePricing('GPT-A')];
    const unpricedModels: UnpricedModelSummary[] = [
      { modelId: 'future-z', totalTokens: 10 },
      { modelId: ' gpt-a ', totalTokens: 20 },
      { modelId: 'future-a', totalTokens: 30 },
    ];

    expect(buildPricingModelOptions(pricing, unpricedModels)).toEqual([
      { kind: 'model', key: 'model:gpt-a', modelId: 'GPT-A', pricingState: 'priced' },
      { kind: 'model', key: 'model:gpt-z', modelId: 'gpt-z', pricingState: 'priced' },
      {
        kind: 'model',
        key: 'model:future-a',
        modelId: 'future-a',
        pricingState: 'unpriced',
      },
      {
        kind: 'model',
        key: 'model:future-z',
        modelId: 'future-z',
        pricingState: 'unpriced',
      },
    ]);
  });

  it('collapses missing and blank model IDs into one disabled unknown option', () => {
    expect(
      buildPricingModelOptions(
        [],
        [
          { modelId: undefined, totalTokens: 10 },
          { modelId: '', totalTokens: 20 },
          { modelId: '  ', totalTokens: 30 },
        ]
      )
    ).toEqual([{ kind: 'unknown', key: 'unknown', disabled: true }]);
  });

  it('omits the unknown option when every unpriced model has a concrete ID', () => {
    expect(buildPricingModelOptions([], [{ modelId: 'future-model', totalTokens: 10 }])).toEqual([
      {
        kind: 'model',
        key: 'model:future-model',
        modelId: 'future-model',
        pricingState: 'unpriced',
      },
    ]);
  });

  it('does not mutate pricing or unpriced model inputs', () => {
    const pricing = [makePricing('gpt-z'), makePricing('gpt-a')];
    const unpricedModels = [
      { modelId: 'future-z', totalTokens: 10 },
      { modelId: 'future-a', totalTokens: 20 },
    ];
    const originalPricing = structuredClone(pricing);
    const originalUnpricedModels = structuredClone(unpricedModels);

    buildPricingModelOptions(pricing, unpricedModels);

    expect(pricing).toEqual(originalPricing);
    expect(unpricedModels).toEqual(originalUnpricedModels);
  });
});
