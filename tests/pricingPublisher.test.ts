import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import * as validators from '../src/shared/pricingCatalog';
import type { PricingCatalog } from '../src/shared/pricingCatalogTypes';
import { catalogFixture } from './helpers/pricingFixture';

const require = createRequire(import.meta.url);
const { publishCatalog } = require('../scripts/publish-pricing.cjs') as {
  publishCatalog: (
    catalogs: PricingCatalog[],
    request: (...args: unknown[]) => Promise<unknown>,
    validation: typeof validators
  ) => Promise<void>;
};

const versions = () =>
  validators.createCatalogVersions(validators.decodePricingCatalog(catalogFixture()));
const encode = (catalog: unknown) => ({
  encoding: 'base64',
  content: Buffer.from(JSON.stringify(catalog)).toString('base64'),
});

describe('pricing publication', () => {
  it('creates the pricing branch with all three validated catalogs in one tree', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sha: 'tree' })
      .mockResolvedValueOnce({ sha: 'commit' })
      .mockResolvedValueOnce({});
    await publishCatalog(versions(), request, validators);
    expect(request.mock.calls[1][1].tree.map((entry: { path: string }) => entry.path)).toEqual([
      'catalog.json',
      'catalog-v2.json',
      'catalog-v3.json',
    ]);
    expect(JSON.parse(request.mock.calls[1][1].tree[2].content).schemaVersion).toBe(3);
    expect(request.mock.calls[2][1].parents).toEqual([]);
    expect(request.mock.calls[3]).toEqual([
      '/git/refs',
      { ref: 'refs/heads/pricing', sha: 'commit' },
    ]);
  });
  it('checks the exact parent catalogs and rejects a competing non-forced publication', async () => {
    const catalogs = versions();
    const request = vi.fn(async (path: unknown) => {
      if (path === '/git/ref/heads/pricing') return { object: { sha: 'parent' } };
      if (path === '/contents/catalog.json?ref=parent') return encode(catalogs[0]);
      if (path === '/contents/catalog-v2.json?ref=parent') return encode(catalogs[1]);
      if (path === '/contents/catalog-v3.json?ref=parent') return null;
      if (path === '/git/trees') return { sha: 'tree' };
      if (path === '/git/commits') return { sha: 'commit' };
      throw new Error('conflict');
    });
    await expect(publishCatalog(catalogs, request, validators)).rejects.toThrow('conflict');
    expect(request).toHaveBeenCalledWith('/contents/catalog-v3.json?ref=parent', undefined, true);
    expect(request).toHaveBeenCalledWith(
      '/git/commits',
      expect.objectContaining({ parents: ['parent'] })
    );
    expect(request).toHaveBeenLastCalledWith(
      '/git/refs/heads/pricing',
      { sha: 'commit', force: false },
      false,
      'PATCH'
    );
  });
  it('rejects mixed or altered snapshots before making any GitHub request', async () => {
    const request = vi.fn();
    const catalogs = versions();
    catalogs[1].models[0].outputUsdPerMillion += 1;
    await expect(publishCatalog(catalogs, request, validators)).rejects.toThrow(/snapshot/);
    expect(request).not.toHaveBeenCalled();
  });
  it.each(['deleted history', 'newer publication', 'lost cached price', 'invalid encoding'])(
    'rejects %s in the parent before creating a tree',
    async (scenario) => {
      const catalogs = versions();
      const historical = structuredClone(catalogs[2]);
      if (scenario === 'deleted history') {
        historical.models.push({
          ...historical.models[0],
          modelId: 'gpt-history',
          cachedInputUsdPerMillion: null,
        });
      }
      if (scenario === 'newer publication') historical.publishedAt = '2099-01-01';
      if (scenario === 'lost cached price') {
        catalogs[2].models.push({
          ...catalogs[2].models[0],
          modelId: 'gpt-partial',
          cachedInputUsdPerMillion: null,
        });
        historical.models.push({
          ...historical.models[0],
          modelId: 'gpt-partial',
          cachedInputUsdPerMillion: 1,
        });
      }
      const request = vi.fn(async (path: unknown) => {
        if (path === '/git/ref/heads/pricing') return { object: { sha: 'parent' } };
        if (path === '/contents/catalog-v3.json?ref=parent')
          return scenario === 'invalid encoding' ? { content: '{}' } : encode(historical);
        return null;
      });
      await expect(publishCatalog(catalogs, request, validators)).rejects.toThrow(
        scenario === 'invalid encoding' ? /parent catalog/ : /regressed/
      );
      expect(request.mock.calls.some(([path]) => path === '/git/trees')).toBe(false);
    }
  );
});
