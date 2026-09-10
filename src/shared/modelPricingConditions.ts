/**
 * @file 已核对的模型条件规则
 * @description 仅为明确核对的模型记录规则；新模型不得继承其他模型的价格倍率。
 */
import type { PricingConditions } from './conditionalPricingTypes';

export const MODEL_PRICING_CONDITIONS: Readonly<Record<string, PricingConditions>> = {
  'gpt-6-astra': {
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
    verifiedAt: '2026-09-10',
    cacheWriteMultiplier: 1.25,
    longContext: {
      inputTokenThreshold: 272_000,
      inputMultiplier: 2,
      cachedInputMultiplier: 2,
      cacheWriteMultiplier: 2,
      outputMultiplier: 1.5,
    },
    modes: { standard: 1, fast: 2, flex: 0.5, batch: 0.5 },
  },
};
