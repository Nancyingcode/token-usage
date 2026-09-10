import { describe, expect, it, vi } from 'vitest';
import { decodePricingCatalog, mergePricingCatalog } from '../src/shared/pricingCatalog';
import { fetchPricingCatalog } from '../src/main/pricingTransport';
import { catalogFixture } from './helpers/pricingFixture';
import { astraPricing } from './helpers/conditionalPricingFixture';

describe('conditional catalog compatibility', () => {
  it('loads v2 declarative rules, rejects unsupported modes and marks v1 prices incomplete', () => {
    const raw = catalogFixture();
    const model = { ...raw.models[0], conditions: astraPricing.conditions };
    const decoded = decodePricingCatalog({ ...raw, schemaVersion: 2, models: [model] });
    expect(mergePricingCatalog([], decoded)[0].conditions).toEqual(astraPricing.conditions);
    expect(mergePricingCatalog([], decodePricingCatalog(raw))[0].rulesStatus).toBe('unavailable');
    expect(() =>
      decodePricingCatalog({
        ...raw,
        schemaVersion: 2,
        models: [
          { ...model, conditions: { ...model.conditions, modes: { standard: 1, bogus: 9 } } },
        ],
      })
    ).toThrow();
  });
  it('falls back to v1 only when v2 is absent, not on transient failures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(catalogFixture())));
    await fetchPricingCatalog(new AbortController().signal, fetcher);
    expect(String(fetcher.mock.calls[0][0])).toContain('catalog-v2.json');
    expect(String(fetcher.mock.calls[1][0])).toContain('/catalog.json');
    fetcher.mockClear().mockResolvedValueOnce(new Response('', { status: 503 }));
    await expect(fetchPricingCatalog(new AbortController().signal, fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
