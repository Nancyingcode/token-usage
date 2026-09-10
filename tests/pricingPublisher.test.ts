import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { addCatalogConditions, decodePricingCatalog } from '../src/shared/pricingCatalog';
import { catalogFixture } from './helpers/pricingFixture';
const require = createRequire(import.meta.url);
const { publishCatalog } = require('../scripts/publish-pricing.cjs') as {
  publishCatalog: (
    catalog: unknown,
    conditionalCatalog: unknown,
    request: (...args: unknown[]) => Promise<unknown>
  ) => Promise<void>;
};

describe('pricing publication', () => {
  it('creates the pricing branch with only the validated catalog', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sha: 'tree' })
      .mockResolvedValueOnce({ sha: 'commit' })
      .mockResolvedValueOnce({});
    await publishCatalog(
      catalogFixture(),
      addCatalogConditions(decodePricingCatalog(catalogFixture())),
      request
    );
    expect(request.mock.calls[1][1].tree).toHaveLength(2);
    expect(request.mock.calls[1][1].tree.map((entry: { path: string }) => entry.path)).toEqual([
      'catalog.json',
      'catalog-v2.json',
    ]);
    expect(JSON.parse(request.mock.calls[1][1].tree[1].content).models[0].conditions).toBeDefined();
    expect(request.mock.calls[2][1].parents).toEqual([]);
    expect(request.mock.calls[3]).toEqual([
      '/git/refs',
      { ref: 'refs/heads/pricing', sha: 'commit' },
    ]);
  });
  it('uses a non-forced update and propagates a competing publication failure', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ object: { sha: 'parent' } })
      .mockResolvedValueOnce({ sha: 'tree' })
      .mockResolvedValueOnce({ sha: 'commit' })
      .mockRejectedValueOnce(new Error('conflict'));
    await expect(
      publishCatalog(
        catalogFixture(),
        addCatalogConditions(decodePricingCatalog(catalogFixture())),
        request
      )
    ).rejects.toThrow('conflict');
    expect(request.mock.calls[2][1].parents).toEqual(['parent']);
    expect(request.mock.calls[3]).toEqual([
      '/git/refs/heads/pricing',
      { sha: 'commit', force: false },
      false,
      'PATCH',
    ]);
  });
});
