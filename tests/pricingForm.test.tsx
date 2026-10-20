import { describe, expect, it } from 'vitest';
import {
  createPricingFormState,
  getPricingFormIssues,
  toPricingOverride,
} from '../src/renderer/utils/pricingForm';

describe('pricing form', () => {
  it('keeps an unpublished cache price blank without turning it into a free override', () => {
    const state = createPricingFormState({
      modelId: 'gpt-test',
      aliases: [],
      sourceKind: 'remote',
      effectiveAt: '2026-10-21',
      inputUsdPerMillion: 10,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 50,
    });
    expect(state.cachedInputUsdPerMillion).toBe('');
    expect(getPricingFormIssues(state)).toEqual([
      { field: 'cachedInputUsdPerMillion', code: 'cached-input-price-required' },
    ]);
    expect(toPricingOverride(state).cachedInputUsdPerMillion).toBeNaN();
    expect(
      toPricingOverride({ ...state, cachedInputUsdPerMillion: '0' }).cachedInputUsdPerMillion
    ).toBe(0);
  });
  it('converts the pricing form into a complete override', () => {
    expect(
      toPricingOverride({
        modelId: 'future-codex',
        aliases: '',
        inputUsdPerMillion: '2.50',
        cachedInputUsdPerMillion: '0.25',
        outputUsdPerMillion: '15.00',
      })
    ).toEqual({
      modelId: 'future-codex',
      aliases: [],
      inputUsdPerMillion: 2.5,
      cachedInputUsdPerMillion: 0.25,
      outputUsdPerMillion: 15,
    });
  });

  it('rejects blank, negative, and non-finite price fields while allowing zero', () => {
    expect(
      getPricingFormIssues({
        modelId: 'gpt-test',
        aliases: '',
        inputUsdPerMillion: '',
        cachedInputUsdPerMillion: '0',
        outputUsdPerMillion: '-1',
      }).map(({ field, code }) => ({ field, code }))
    ).toEqual([
      { field: 'inputUsdPerMillion', code: 'input-price-required' },
      { field: 'outputUsdPerMillion', code: 'output-price-non-negative' },
    ]);
  });
});
