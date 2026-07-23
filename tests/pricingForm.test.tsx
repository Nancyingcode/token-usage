import { describe, expect, it } from 'vitest';
import { getPricingFormIssues, toPricingOverride } from '../src/renderer/utils/pricingForm';

describe('pricing form', () => {
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
