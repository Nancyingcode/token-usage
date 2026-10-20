import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { parseModelPricing, discoverModelIds, collectCatalog } =
  require('../scripts/update-pricing.cjs') as {
    parseModelPricing: (text: string) => {
      inputUsdPerMillion: number;
      cachedInputUsdPerMillion: number | null;
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
const OFFICIAL_MARKDOWN = readFileSync(
  new URL('./fixtures/pricing/codex-mini.md', import.meta.url),
  'utf8'
);
const NO_CACHE_MARKDOWN = readFileSync(
  new URL('./fixtures/pricing/gpt-5.5-pro.md', import.meta.url),
  'utf8'
);
describe('official pricing collector', () => {
  it('parses the official nested metric table without borrowing comparison prices', () => {
    expect(parseModelPricing(OFFICIAL_MARKDOWN)).toEqual({
      inputUsdPerMillion: 1.5,
      cachedInputUsdPerMillion: 0.375,
      outputUsdPerMillion: 6,
    });
    expect(parseModelPricing(NO_CACHE_MARKDOWN)).toEqual({
      inputUsdPerMillion: 30,
      cachedInputUsdPerMillion: null,
      outputUsdPerMillion: 180,
    });
  });
  it.each([
    [
      'cache row without separators',
      OFFICIAL_MARKDOWN.replace(
        '| Cached input | $0.375 | 1M tokens |',
        'Cached input $0.375 1M tokens'
      ),
    ],
    [
      'split cache row without separators',
      OFFICIAL_MARKDOWN.replace(
        '| Cached input | $0.375 | 1M tokens |',
        'Cached input\n$0.375\n1M tokens'
      ),
    ],
    [
      'cache label after the table',
      NO_CACHE_MARKDOWN.replace('## Endpoints', 'Cached input\n$0.375\n1M tokens\n\n## Endpoints'),
    ],
    ['separated table blocks', OFFICIAL_MARKDOWN.replace('| Cached input', '\n| Cached input')],
    ['wrong unit', OFFICIAL_MARKDOWN.replace('$0.375 | 1M tokens', '$0.375 | 1K tokens')],
    ['bad cache value', OFFICIAL_MARKDOWN.replace('$0.375', '-')],
    [
      'renamed cache metric',
      NO_CACHE_MARKDOWN.replace('| Output', '| Cached input (short) | $1 | 1M tokens |\n| Output'),
    ],
    ['malformed metric', NO_CACHE_MARKDOWN.replace('| Output', '| Cached input |\n| Output')],
    ['missing input', NO_CACHE_MARKDOWN.replace('| Input | $30 | 1M tokens |', '')],
    [
      'duplicate output',
      NO_CACHE_MARKDOWN.replace('| Output |', '| Output | $180 | 1M tokens |\n| Output |'),
    ],
    ['duplicate pricing section', `${OFFICIAL_MARKDOWN}\n${OFFICIAL_MARKDOWN}`],
    [
      'nested batch table',
      OFFICIAL_MARKDOWN.replace('### Text tokens', '### Text tokens\n#### Batch'),
    ],
  ])('rejects %s instead of interpreting it as absent cache pricing', (_reason, markdown) => {
    expect(() => parseModelPricing(markdown)).toThrow();
  });
  it('keeps adjacent audio prices out of the text table and validates cache-write rows', () => {
    const markdown = NO_CACHE_MARKDOWN.replace(
      '## Endpoints',
      '### Audio tokens\n| Metric | Price | Unit |\n| --- | --- | --- |\n| Cached input | $1 | 1M tokens |\n## Endpoints'
    );
    expect(parseModelPricing(markdown).cachedInputUsdPerMillion).toBeNull();
    expect(
      parseModelPricing(
        OFFICIAL_MARKDOWN.replace(
          '| Output | $6',
          '| Cache writes | $2 | 1M tokens |\n| Output | $6'
        )
      )
    ).toMatchObject({ outputUsdPerMillion: 6 });
    expect(() =>
      parseModelPricing(
        OFFICIAL_MARKDOWN.replace(
          '| Output | $6',
          '| Cache writes | invalid | 1M tokens |\n| Output | $6'
        )
      )
    ).toThrow();
  });
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
