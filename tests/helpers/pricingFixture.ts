export const catalogFixture = () => ({
  schemaVersion: 1,
  version: '2026-09-10T00:00:00.000Z',
  publishedAt: '2026-09-10T00:00:00.000Z',
  currency: 'USD',
  unit: 'per-million-tokens',
  models: [
    {
      modelId: 'gpt-6-astra',
      aliases: [],
      inputUsdPerMillion: 10,
      cachedInputUsdPerMillion: 1,
      outputUsdPerMillion: 50,
      effectiveAt: '2026-09-10T00:00:00.000Z',
      sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-6-astra',
    },
  ],
});
