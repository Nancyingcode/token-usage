import { describe, expect, it } from 'vitest';
import type { ModelPricingEntry } from '../src/shared/budgetTypes';
import {
  getLatestModelSeriesIds,
  selectLatestModelSeriesPricing,
} from '../src/shared/latestModelSeries';

describe('latest model series', () => {
  it('compares major and minor versions numerically while preserving price order', () => {
    const pricing = [
      makePricing('gpt-5.10-sol'),
      makePricing('gpt-5.9-luna'),
      makePricing('gpt-5.10-terra'),
      makePricing('gpt-6.0-sol'),
      makePricing('gpt-6.0-luna'),
    ];

    expect(getLatestModelSeriesIds(pricing)).toEqual(['gpt-6.0-sol', 'gpt-6.0-luna']);
  });

  it('ignores invalid canonical ids and version-looking aliases', () => {
    const pricing = [
      makePricing('gpt-5'),
      makePricing('gpt-test', ['gpt-99.0-sol']),
      makePricing('my-gpt-9.0'),
      makePricing(' GPT-5.6-SOL '),
      makePricing('gpt-5.6-luna'),
    ];

    expect(getLatestModelSeriesIds(pricing)).toEqual(['GPT-5.6-SOL', 'gpt-5.6-luna']);
  });

  it('returns new empty or selected arrays without modifying pricing entries', () => {
    const entry = Object.freeze(makePricing('gpt-5.6-sol'));
    const pricing = Object.freeze([entry]);

    const selected = selectLatestModelSeriesPricing(pricing);

    expect(selected).toEqual([entry]);
    expect(selected).not.toBe(pricing);
    expect(selectLatestModelSeriesPricing([])).toEqual([]);
    expect(selectLatestModelSeriesPricing([makePricing('custom-model')])).toEqual([]);
  });
});

const makePricing = (modelId: string, aliases: string[] = []): ModelPricingEntry => ({
  modelId: modelId.trim(),
  aliases,
  inputUsdPerMillion: 1,
  cachedInputUsdPerMillion: 0.1,
  outputUsdPerMillion: 6,
  effectiveAt: '2026-08-10',
  sourceKind: 'built-in',
});
