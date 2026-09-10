import { describe, expect, it } from 'vitest';
import { decodePricingCatalog, mergePricingCatalog } from '../src/shared/pricingCatalog';
import { mergeModelPricing, createPricingContext, priceTokenUsage } from '../src/shared/pricing';
import { DEFAULT_MODEL_PRICING } from '../src/main/defaultModelPricing';

import { catalogFixture } from './helpers/pricingFixture';

describe('pricing catalog', () => {
  it('loads explicit model prices and preserves built-in models', () => {
    const catalog = decodePricingCatalog(catalogFixture());
    const merged = mergePricingCatalog(DEFAULT_MODEL_PRICING, catalog);
    expect(merged.find((entry) => entry.modelId === 'gpt-6-astra')).toMatchObject({
      sourceKind: 'remote',
      inputUsdPerMillion: 10,
    });
    expect(merged.some((entry) => entry.modelId === 'gpt-5.5')).toBe(true);
  });
  it.each([
    { schemaVersion: 3 },
    { currency: 'CNY' },
    { unit: 'per-token' },
    { models: [] },
    { publishedAt: 'invalid' },
    { version: '' },
  ])('rejects invalid envelopes %j', (change) => {
    expect(() => decodePricingCatalog({ ...catalogFixture(), ...change })).toThrow();
  });
  it.each([
    { inputUsdPerMillion: -1 },
    { outputUsdPerMillion: Infinity },
    { cachedInputUsdPerMillion: null },
    { aliases: ['gpt-6-astra'] },
    { sourceUrl: 'https://evil.example/pricing' },
    { modelId: '' },
  ])('rejects invalid model data %j', (change) => {
    const raw = catalogFixture();
    expect(() =>
      decodePricingCatalog({ ...raw, models: [{ ...raw.models[0], ...change }] })
    ).toThrow();
  });
  it('rejects cross-model aliases including built-in collisions', () => {
    const raw = catalogFixture();
    const model = { ...raw.models[0], modelId: 'other', aliases: ['GPT-6-ASTRA'] };
    expect(() => decodePricingCatalog({ ...raw, models: [...raw.models, model] })).toThrow();
    const catalog = decodePricingCatalog({ ...raw, models: [{ ...model, aliases: ['gpt-5.5'] }] });
    expect(() => mergePricingCatalog(DEFAULT_MODEL_PRICING, catalog)).toThrow();
  });
  it('keeps manual alias overrides ahead of new remote canonical IDs', () => {
    const entries = mergeModelPricing(
      mergePricingCatalog(DEFAULT_MODEL_PRICING, decodePricingCatalog(catalogFixture())),
      [
        {
          modelId: 'my-model',
          aliases: ['gpt-6-astra'],
          inputUsdPerMillion: 3,
          cachedInputUsdPerMillion: 1,
          outputUsdPerMillion: 5,
          updatedAt: '2026-09-10',
        },
      ]
    );
    const usage = {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 1_000_000,
    };
    expect(priceTokenUsage(usage, 'gpt-6-astra', createPricingContext(entries))).toMatchObject({
      costUsd: 3,
    });
    expect(priceTokenUsage(usage, 'gpt-7-unknown', createPricingContext(entries))).toMatchObject({
      kind: 'unpriced',
    });
  });
});
