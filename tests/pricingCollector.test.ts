import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { parseModelPricing, discoverModelIds, collectCatalog } =
  require('../scripts/update-pricing.cjs') as {
    parseModelPricing: (text: string) => {
      inputUsdPerMillion: number;
      cachedInputUsdPerMillion: number;
      outputUsdPerMillion: number;
    };
    discoverModelIds: (text: string) => string[];
    collectCatalog: (
      previous: unknown,
      fetchText: (url: string) => Promise<string>,
      timestamp: string
    ) => Promise<{ models: Array<{ modelId: string; inputUsdPerMillion: number }> }>;
  };
import { catalogFixture } from './helpers/pricingFixture';

const MARKDOWN = `# GPT-6 Astra
## Pricing
Text tokens
Per 1M tokens
Input
$10.00
Cached input
$1.00
Cache writes
$12.50
Output
$50.00
Prompts with more than 272K input tokens are priced at 2x input.
## Endpoints
Responses
`;
describe('official pricing collector', () => {
  it('extracts standard text prices without interpreting surcharges as base prices', () => {
    expect(parseModelPricing(MARKDOWN)).toEqual({
      inputUsdPerMillion: 10,
      cachedInputUsdPerMillion: 1,
      outputUsdPerMillion: 50,
    });
  });
  it('accepts explicit tables and rejects missing cache prices or ambiguous units', () => {
    expect(
      parseModelPricing(
        '## Pricing\nText tokens per 1M tokens\n| Input | Cached input | Output |\n| --- | --- | --- |\n| $10 | $1 | $50 |'
      )
    ).toMatchObject({ cachedInputUsdPerMillion: 1 });
    expect(() =>
      parseModelPricing(MARKDOWN.replace('Cached input\n$1.00', 'Cached input\nNot available'))
    ).toThrow();
    expect(() => parseModelPricing(MARKDOWN.replace('Per 1M', 'Per 1K'))).toThrow();
    expect(() => parseModelPricing('Forbidden')).toThrow();
  });
  it('discovers exact text-model IDs without conflating model families', () => {
    expect(
      discoverModelIds(
        '[Astra](/api/docs/models/gpt-6-astra) [Next](/api/docs/models/gpt-7-new) [Image](/api/docs/models/gpt-image-1)'
      )
    ).toEqual(['gpt-6-astra', 'gpt-7-new']);
    expect(() => discoverModelIds('Forbidden')).toThrow();
  });
  it('preserves historical models, discovers new models and fails without partial publication', async () => {
    const fetchText = async (url: string) =>
      url.endsWith('/models.md') ? '[Next](/api/docs/models/gpt-7-new)' : MARKDOWN;
    const result = await collectCatalog(catalogFixture(), fetchText, '2026-09-11T00:00:00.000Z');
    expect(result.models.map((entry) => entry.modelId)).toEqual(['gpt-6-astra', 'gpt-7-new']);
    await expect(
      collectCatalog(
        catalogFixture(),
        async (url) =>
          url.endsWith('/models.md') ? '[Next](/api/docs/models/gpt-7-new)' : 'Forbidden',
        '2026-09-11T00:00:00.000Z'
      )
    ).rejects.toThrow();
  });
});
