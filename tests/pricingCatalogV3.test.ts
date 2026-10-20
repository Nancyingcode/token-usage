import { describe, expect, it } from 'vitest';
import {
  assertCatalogProgression,
  createCatalogVersions,
  decodePricingCatalog,
  getPricingCatalogUrl,
  validateCatalogVersions,
} from '../src/shared/pricingCatalog';
import { catalogFixture } from './helpers/pricingFixture';

const withPartialModel = () => {
  const fixture = catalogFixture();
  return {
    ...fixture,
    schemaVersion: 3,
    models: [
      fixture.models[0],
      { ...fixture.models[0], modelId: 'gpt-5.5-pro', cachedInputUsdPerMillion: null },
    ],
  };
};

describe('v3 pricing catalogs', () => {
  it('requires an explicit number or null and preserves zero separately', () => {
    expect(
      decodePricingCatalog(withPartialModel(), 3).models[1].cachedInputUsdPerMillion
    ).toBeNull();
    const raw = withPartialModel();
    expect(
      decodePricingCatalog({ ...raw, models: [{ ...raw.models[0], cachedInputUsdPerMillion: 0 }] })
        .models[0].cachedInputUsdPerMillion
    ).toBe(0);
    for (const value of [undefined, '0', -1, Infinity]) {
      expect(() =>
        decodePricingCatalog({
          ...raw,
          models: [{ ...raw.models[0], cachedInputUsdPerMillion: value }],
        })
      ).toThrow();
    }
    expect(() => decodePricingCatalog(raw, 2)).toThrow();
    expect(() => decodePricingCatalog({ ...raw, schemaVersion: 2 })).toThrow();
    expect(getPricingCatalogUrl(3)).toContain('/catalog-v3.json');
  });
  it('creates strict old-client projections sharing one version and validates their contents', () => {
    const versions = createCatalogVersions(decodePricingCatalog(withPartialModel()));
    expect(versions.map((catalog) => catalog.schemaVersion)).toEqual([1, 2, 3]);
    expect(versions.map((catalog) => catalog.models.length)).toEqual([1, 1, 2]);
    expect(versions[0].models[0].conditions).toBeUndefined();
    expect(versions[1].models[0].conditions).toBeDefined();
    expect(versions[2].models[0].conditions).toBeDefined();
    expect(() => validateCatalogVersions(versions)).not.toThrow();
    expect(() =>
      validateCatalogVersions([{ ...versions[0], version: 'mixed' }, versions[1], versions[2]])
    ).toThrow();
    const changed = structuredClone(versions);
    changed[1].models[0].inputUsdPerMillion += 1;
    expect(() => validateCatalogVersions(changed)).toThrow();
  });
  it('rejects historical deletion, alias loss, time/schema regression and known prices becoming null', () => {
    const previous = decodePricingCatalog(withPartialModel());
    expect(() => assertCatalogProgression(previous, previous)).not.toThrow();
    const regressions = [
      { ...previous, models: [previous.models[0]] },
      { ...previous, schemaVersion: 2 as const, models: [previous.models[0]] },
      { ...previous, publishedAt: '2020-01-01' },
      {
        ...previous,
        models: previous.models.map((model) => ({ ...model, cachedInputUsdPerMillion: null })),
      },
    ];
    for (const next of regressions) {
      expect(() => assertCatalogProgression(previous, next)).toThrow();
    }
    const withAlias = {
      ...previous,
      models: [{ ...previous.models[0], aliases: ['historical'] }, previous.models[1]],
    };
    expect(() => assertCatalogProgression(withAlias, previous)).toThrow();
    expect(() =>
      assertCatalogProgression(previous, {
        ...previous,
        models: previous.models.map((model) => ({ ...model, cachedInputUsdPerMillion: 1 })),
      })
    ).not.toThrow();
  });
});
