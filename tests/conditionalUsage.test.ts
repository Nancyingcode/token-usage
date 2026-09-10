import { describe, expect, it } from 'vitest';
import { parseSessionJsonl } from '../src/main/sessionParser';
import { rebuildCostOptimizationIndex } from '../src/shared/costOptimizationIndex';
import {
  evaluateModelCosts,
  evaluateSubstitutionScenarios,
  getPricingCoverage,
  selectQueryBuckets,
} from '../src/shared/costOptimizationCost';
import { astraPricing, requestUsage } from './helpers/conditionalPricingFixture';

describe('conditional usage propagation', () => {
  it('preserves request granularity and cache writes without inventing service tier evidence', () => {
    const session = parseSessionJsonl(
      'fixture.jsonl',
      [
        { type: 'turn_context', payload: { model: 'gpt-6-astra', service_tier: 'fast' } },
        {
          type: 'event_msg',
          timestamp: '2026-09-10T00:00:00Z',
          payload: {
            type: 'token_count',
            info: {
              model_context_window: 1050000,
              last_token_usage: {
                input_tokens: 1000,
                cached_input_tokens: 100,
                cache_write_input_tokens: 200,
                output_tokens: 10,
                total_tokens: 1010,
              },
            },
          },
        },
      ]
        .map((value) => JSON.stringify(value))
        .join('\n')
    );
    expect(session.usageSlices[0].pricingContext).toEqual({
      granularity: 'request',
      mode: 'unknown',
      modeSource: 'missing',
      cacheWriteInputTokens: 200,
      cacheWriteSemantics: 'unverified',
    });
    expect(session.totalTokens).toBe(1010);
  });
  it('marks total-only usage as aggregate and retains missing writes', () => {
    const session = parseSessionJsonl(
      'fixture.jsonl',
      JSON.stringify({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: { total_token_usage: { input_tokens: 500000, total_tokens: 500000 } },
        },
      })
    );
    expect(session.usageSlices[0].pricingContext).toEqual({
      granularity: 'aggregate',
      mode: 'unknown',
      modeSource: 'missing',
    });
  });
  it('preserves individual requests through index buckets and model scenarios', () => {
    const slices = [requestUsage(200000), requestUsage(200000)];
    const index = rebuildCostOptimizationIndex('fixtures', [
      {
        sourceFile: 'fixture.jsonl',
        fingerprint: '1',
        session: {
          ...requestUsage(400000),
          totalTokens: 400200,
          outputTokens: 200,
          sessionId: 'test',
          startedAt: slices[0].occurredAt,
          endedAt: slices[0].occurredAt,
          projectPath: 'fixture',
          projectName: 'fixture',
          usageSlices: slices,
          turnOutcomes: [],
          eventCount: 2,
          sourceFile: 'fixture.jsonl',
          warnings: [],
        },
      },
    ]);
    const [row] = evaluateModelCosts(index, { period: 'total' }, [astraPricing]);
    expect(row.pricedCostUsd).toBeCloseTo(4.01, 8);
    expect(row.coverage.exactPricedTokens).toBe(400200);
    const cheaper = { ...astraPricing, modelId: 'target', inputUsdPerMillion: 5 };
    const [scenario] = evaluateSubstitutionScenarios(
      index,
      { period: 'total' },
      [astraPricing, cheaper],
      ['target'],
      0
    );
    expect(scenario.scenarioCostUsd).toBeCloseTo(2.01, 8);
    const unknown = {
      ...slices[0],
      pricingContext: {
        ...slices[0].pricingContext!,
        mode: 'unknown' as const,
        modeSource: 'missing' as const,
      },
    };
    const bucket = selectQueryBuckets(index, { period: 'total' })[0];
    const coverage = getPricingCoverage(
      [{ ...bucket, pricingRequests: { a: slices[0], b: unknown } }],
      [astraPricing]
    );
    expect(coverage.conditionAssumedTokens).toBe(200100);
    expect(coverage.conditionPercentage).toBe(50);
    expect(coverage.assumedTokens).toBe(0);
  });
});
