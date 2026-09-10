import type { ModelPricingEntry } from '../../src/shared/budgetTypes';
import type { UsageSlice } from '../../src/shared/usageTypes';
export const astraPricing: ModelPricingEntry = {
  modelId: 'gpt-6-astra',
  aliases: [],
  inputUsdPerMillion: 10,
  cachedInputUsdPerMillion: 1,
  outputUsdPerMillion: 50,
  effectiveAt: '2026-09-10',
  sourceKind: 'remote',
  conditions: {
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
    verifiedAt: '2026-09-10',
    cacheWriteMultiplier: 1.25,
    longContext: {
      inputTokenThreshold: 272000,
      inputMultiplier: 2,
      cachedInputMultiplier: 2,
      cacheWriteMultiplier: 2,
      outputMultiplier: 1.5,
    },
    modes: { standard: 1, fast: 2, flex: 0.5, batch: 0.5 },
  },
};
export const requestUsage = (inputTokens = 1000): UsageSlice => ({
  occurredAt: '2026-09-10T00:00:00.000Z',
  modelId: 'gpt-6-astra',
  inputTokens,
  cachedInputTokens: 0,
  outputTokens: 100,
  reasoningOutputTokens: 50,
  totalTokens: inputTokens + 100,
  pricingContext: {
    granularity: 'request',
    cacheWriteInputTokens: 0,
    cacheWriteSemantics: 'included-in-input',
    mode: 'standard',
    modeSource: 'response',
  },
});
