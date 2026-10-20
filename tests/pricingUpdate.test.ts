import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as validators from '../src/shared/pricingCatalog';
import type { PricingCatalog } from '../src/shared/pricingCatalogTypes';
import { catalogFixture } from './helpers/pricingFixture';

const require = createRequire(import.meta.url);
const { collectCatalog, loadPreviousCatalog, updatePricing, validatePricingDirectory } =
  require('../scripts/update-pricing.cjs') as {
    collectCatalog: (
      previous: PricingCatalog,
      fetchText: (url: string) => Promise<string>,
      timestamp: string
    ) => Promise<PricingCatalog>;
    loadPreviousCatalog: (
      fetchText: (url: string) => Promise<string>,
      seedDirectory: string,
      validation: typeof validators
    ) => Promise<PricingCatalog>;
    updatePricing: (options: {
      outputDirectory: string;
      seedDirectory: string;
      fetchText: (url: string) => Promise<string>;
      timestamp: string;
      validators: typeof validators;
    }) => Promise<PricingCatalog[]>;
    validatePricingDirectory: (
      directory: string,
      validation: typeof validators
    ) => Promise<PricingCatalog[]>;
  };

const NEW_TIME = '2026-10-21T00:00:00.000Z';
const notFound = () => Object.assign(new Error('missing'), { status: 404 });
const table = (cached = '') =>
  `## Pricing\n### Text tokens\n| Metric | Price | Unit |\n| --- | --- | --- |\n| Input | $30 | 1M tokens |\n${cached}| Output | $180 | 1M tokens |`;

describe('pricing update lifecycle', () => {
  it('protects a known price when a newly discovered ID was already a historical alias', async () => {
    const previous = validators.decodePricingCatalog({
      ...catalogFixture(),
      models: [{ ...catalogFixture().models[0], aliases: ['gpt-5.5-pro'] }],
    });
    await expect(
      collectCatalog(
        previous,
        async (url) =>
          url.endsWith('/models.md') ? '[Pro](/api/docs/models/gpt-5.5-pro)' : table(),
        NEW_TIME
      )
    ).rejects.toThrow(/gpt-5.5-pro.*Previously published cached input price/);
  });
  it('fails a partial disk write and refuses to validate the remaining mixed files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pricing-write-failure-test-'));
    try {
      const seedDirectory = join(directory, 'seed');
      const outputDirectory = join(directory, 'output');
      await mkdir(seedDirectory);
      await mkdir(join(outputDirectory, 'catalog-v2.json'), { recursive: true });
      const seed = validators.createCatalogVersions(
        validators.decodePricingCatalog(catalogFixture())
      )[2];
      await writeFile(join(seedDirectory, 'catalog-v3.json'), JSON.stringify(seed));
      const fetchText = async (url: string) => {
        if (url.includes('raw.githubusercontent.com')) throw notFound();
        return url.endsWith('/models.md') ? '[Pro](/api/docs/models/gpt-5.5-pro)' : table();
      };
      await expect(
        updatePricing({
          outputDirectory,
          seedDirectory,
          fetchText,
          timestamp: NEW_TIME,
          validators,
        })
      ).rejects.toThrow();
      expect(
        JSON.parse(await readFile(join(outputDirectory, 'catalog.json'), 'utf8')).version
      ).toBe(NEW_TIME);
      await expect(
        readFile(join(outputDirectory, 'catalog-v3.json'), 'utf8')
      ).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(validatePricingDirectory(outputDirectory, validators)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('preserves nullable history and timestamps, accepts newly published cache rates and rejects lost known rates', async () => {
    const previous = validators.decodePricingCatalog({
      ...catalogFixture(),
      schemaVersion: 3,
      models: [
        {
          ...catalogFixture().models[0],
          inputUsdPerMillion: 30,
          outputUsdPerMillion: 180,
          cachedInputUsdPerMillion: null,
        },
      ],
    });
    const original = structuredClone(previous);
    const source = vi.fn(async (url: string) =>
      url.endsWith('/models.md') ? '[Astra](/api/docs/models/gpt-6-astra)' : table()
    );
    const next = await collectCatalog(previous, source, NEW_TIME);
    expect(next.schemaVersion).toBe(3);
    expect(next.models[0].effectiveAt).toBe(previous.models[0].effectiveAt);
    source.mockImplementation(async (url) =>
      url.endsWith('/models.md')
        ? '[Astra](/api/docs/models/gpt-6-astra)'
        : table('| Cached input | $3 | 1M tokens |\n')
    );
    const priced = await collectCatalog(previous, source, NEW_TIME);
    expect(priced.models[0]).toMatchObject({ cachedInputUsdPerMillion: 3, effectiveAt: NEW_TIME });
    source.mockImplementation(async (url) =>
      url.endsWith('/models.md') ? '[Astra](/api/docs/models/gpt-6-astra)' : table()
    );
    await expect(collectCatalog(priced, source, NEW_TIME)).rejects.toThrow(
      /gpt-6-astra.*https:\/\/developers\.openai\.com/
    );
    expect(previous).toEqual(original);
  });
  it('uses only 404 for v3 to v2 to v1 fallback and enforces the response version', async () => {
    const fetchText = vi
      .fn<(url: string) => Promise<string>>()
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce(JSON.stringify({ ...catalogFixture(), schemaVersion: 2 }));
    expect((await loadPreviousCatalog(fetchText, 'unused', validators)).schemaVersion).toBe(2);
    expect(fetchText.mock.calls.map(([url]) => url.split('/').at(-1))).toEqual([
      'catalog-v3.json',
      'catalog-v2.json',
    ]);
    fetchText
      .mockReset()
      .mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
    await expect(loadPreviousCatalog(fetchText, 'unused', validators)).rejects.toThrow(
      'unavailable'
    );
    expect(fetchText).toHaveBeenCalledTimes(1);
    fetchText.mockReset().mockResolvedValueOnce(JSON.stringify(catalogFixture()));
    await expect(loadPreviousCatalog(fetchText, 'unused', validators)).rejects.toThrow();
    expect(fetchText).toHaveBeenCalledTimes(1);
  });
  it('writes all three matching snapshots after collection and retains original files on later model failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pricing-update-test-'));
    try {
      const versions = validators.createCatalogVersions(
        validators.decodePricingCatalog(catalogFixture())
      );
      const filenames = ['catalog.json', 'catalog-v2.json', 'catalog-v3.json'];
      for (const [index, filename] of filenames.entries()) {
        await writeFile(join(directory, filename), JSON.stringify(versions[index]));
      }
      const fetchText = vi.fn(async (url: string) => {
        if (url.includes('raw.githubusercontent.com')) throw notFound();
        return url.endsWith('/models.md') ? '[New](/api/docs/models/gpt-5.5-pro)' : table();
      });
      const catalogs = await updatePricing({
        outputDirectory: directory,
        seedDirectory: directory,
        fetchText,
        timestamp: NEW_TIME,
        validators,
      });
      expect(catalogs.map((catalog) => catalog.models.length)).toEqual([1, 1, 2]);
      expect(await validatePricingDirectory(directory, validators)).toEqual(catalogs);
      const original = await Promise.all(
        filenames.map((filename) => readFile(join(directory, filename), 'utf8'))
      );
      fetchText.mockImplementation(async (url) => {
        if (url.includes('raw.githubusercontent.com')) throw notFound();
        if (url.endsWith('/models.md'))
          return '[New](/api/docs/models/gpt-5.5-pro) [Bad](/api/docs/models/gpt-9-bad)';
        return url.includes('gpt-9-bad') ? 'Forbidden' : table();
      });
      await expect(
        updatePricing({
          outputDirectory: directory,
          seedDirectory: directory,
          fetchText,
          timestamp: NEW_TIME,
          validators,
        })
      ).rejects.toThrow(/gpt-9-bad/);
      expect(
        await Promise.all(filenames.map((filename) => readFile(join(directory, filename), 'utf8')))
      ).toEqual(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
