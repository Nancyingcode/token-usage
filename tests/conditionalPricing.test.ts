import { describe, expect, it } from 'vitest';
import {
  calculateEstimatedCost,
  calculateUsageCost,
  mergeModelPricing,
} from '../src/shared/pricing';
import { evaluateConditionalUsage } from '../src/shared/conditionalPricing';

import { astraPricing, requestUsage } from './helpers/conditionalPricingFixture';

describe('conditional pricing', () => {
  it('keeps invalid cache partitions nonnegative and does not charge reasoning twice', () => {
    const usage = requestUsage(1000);
    usage.cachedInputTokens = 900;
    usage.pricingContext = { ...usage.pricingContext!, cacheWriteInputTokens: 200 };
    const result = evaluateConditionalUsage(usage, astraPricing);
    expect(result.issues).toContain('cache-partition-invalid');
    expect(result.costUsd).toBeCloseTo(0.0069, 8);
    expect(result.breakdown.outputCostUsd).toBeCloseTo(0.005, 8);
    expect(usage.pricingContext.cacheWriteInputTokens).toBe(200);
  });
  it('retains unknown model tokens as unpriced and custom rates as a flat assumption', () => {
    const usage = { ...requestUsage(), modelId: 'future-model' };
    expect(calculateEstimatedCost([usage], [astraPricing])).toMatchObject({
      pricedCostUsd: 0,
      unpricedTokens: usage.totalTokens,
    });
    const custom = mergeModelPricing(
      [],
      [
        {
          modelId: 'future-model',
          aliases: [],
          inputUsdPerMillion: 1,
          cachedInputUsdPerMillion: 0,
          outputUsdPerMillion: 1,
          updatedAt: '2026-09-10',
        },
      ]
    );
    expect(calculateEstimatedCost([usage], custom)).toMatchObject({
      conditionAssumedTokens: usage.totalTokens,
      pricingIssues: ['manual-flat'],
      assumedTokens: 0,
    });
  });
  it('applies the strict long-context boundary to each request, not accumulated tokens', () => {
    expect(calculateUsageCost(requestUsage(272000), astraPricing)).toBeCloseTo(2.725, 8);
    expect(calculateUsageCost(requestUsage(272001), astraPricing)).toBeCloseTo(5.44752, 8);
    expect(
      calculateEstimatedCost([requestUsage(200000), requestUsage(200000)], [astraPricing])
        .pricedCostUsd
    ).toBeCloseTo(4.01, 8);
  });
  it('partitions cache writes without counting them twice, then applies mode rates', () => {
    const usage = requestUsage(1000);
    usage.cachedInputTokens = 200;
    usage.pricingContext = { ...usage.pricingContext!, cacheWriteInputTokens: 300, mode: 'fast' };
    const result = evaluateConditionalUsage(usage, astraPricing);
    expect(result.costUsd).toBeCloseTo(((500 * 10 + 200 + 300 * 12.5 + 100 * 50) * 2) / 1e6, 8);
    expect(result.issues).toEqual([]);
    expect(result.breakdown.cacheWriteCostUsd).toBeCloseTo(0.0075, 8);
  });
  it.each(['flex', 'batch'] as const)('supports explicit %s mode', (mode) => {
    const usage = requestUsage();
    usage.pricingContext = { ...usage.pricingContext!, mode };
    expect(calculateUsageCost(usage, astraPricing)).toBeCloseTo(0.0075, 8);
  });
  it('marks unknown modes, aggregate input and unverified cache partitions as assumptions', () => {
    const usage = requestUsage(300000);
    usage.pricingContext = {
      granularity: 'aggregate',
      mode: 'unknown',
      modeSource: 'missing',
      cacheWriteInputTokens: 10,
      cacheWriteSemantics: 'unverified',
    };
    const result = evaluateConditionalUsage(usage, astraPricing);
    expect(result.costUsd).toBeCloseTo(3.005, 8);
    expect(result.issues).toEqual(
      expect.arrayContaining(['request-granularity', 'mode-unknown', 'cache-write-unverified'])
    );
    const estimate = calculateEstimatedCost([usage], [astraPricing]);
    expect(estimate.conditionAssumedTokens).toBe(usage.totalTokens);
    expect(estimate.assumedTokens).toBe(0);
  });
  it('does not treat request-tier intent as response evidence or missing writes as zero', () => {
    const usage = requestUsage();
    usage.pricingContext = { granularity: 'request', mode: 'fast', modeSource: 'request' };
    const result = evaluateConditionalUsage(usage, astraPricing);
    expect(result.costUsd).toBeCloseTo(0.015, 8);
    expect(result.issues).toContain('mode-unknown');
    expect(result.issues).toContain('cache-write-missing');
  });
  it('keeps manual overrides flat unless explicitly opting into catalog conditions', () => {
    const override = {
      modelId: astraPricing.modelId,
      aliases: [],
      inputUsdPerMillion: 20,
      cachedInputUsdPerMillion: 2,
      outputUsdPerMillion: 100,
      updatedAt: '2026-09-10',
    };
    const flat = mergeModelPricing([astraPricing], [override])[0];
    expect(calculateUsageCost(requestUsage(300000), flat)).toBeCloseTo(6.01, 8);
    const inherited = mergeModelPricing(
      [astraPricing],
      [{ ...override, useCatalogConditions: true }]
    )[0];
    expect(calculateUsageCost(requestUsage(300000), inherited)).toBeCloseTo(12.015, 8);
  });
});
