/**
 * @file 官方基础价格采集
 * @description 严格解析官方文本模型价格，保留历史条目；任何解析失败都禁止输出部分更新。
 */
const { readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const MODEL_ROOT = 'https://developers.openai.com/api/docs/models';
const CATALOG_URL =
  'https://raw.githubusercontent.com/Nancyingcode/token-usage/pricing/catalog.json';
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_000_000;
const PRICE_FIELDS = ['inputUsdPerMillion', 'cachedInputUsdPerMillion', 'outputUsdPerMillion'];
const LABELS = ['input', 'cached input', 'output'];

const parseModelPricing = (text) => {
  const section = text.split(/^#{1,6}\s+Pricing\s*$/im)[1]?.split(/^#{1,6}\s+/m)[0];
  if (!section || !/text tokens/i.test(section) || !/per\s+1m\s+tokens/i.test(section)) {
    throw new Error('Standard text pricing section or unit is missing.');
  }
  // Batch 单价与 Standard 单价不能混用；没有明确标准口径时交给维护者处理。
  if (/batch api price/i.test(section)) {
    throw new Error('Ambiguous pricing tier.');
  }
  const lines = section
    .replace(/[*`]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const prices = new Map();
  const record = (label, value) => {
    const normalized = label.trim().toLowerCase();
    if (!LABELS.includes(normalized)) {
      return;
    }
    const match = value.trim().match(/^\$([0-9]+(?:\.[0-9]+)?)$/);
    if (!match || prices.has(normalized)) {
      throw new Error(`Invalid or duplicate price: ${label}`);
    }
    prices.set(normalized, Number(match[1]));
  };
  lines.forEach((line, index) => {
    if (LABELS.includes(line.toLowerCase())) {
      record(line, lines[index + 1] ?? '');
    }
    if (!line.startsWith('|')) {
      return;
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length === 2) {
      record(cells[0], cells[1]);
    }
    if (LABELS.every((label) => cells.some((cell) => cell.toLowerCase() === label))) {
      const values = (lines[index + 2] ?? '').split('|').slice(1, -1);
      cells.forEach((label, position) => record(label, values[position] ?? ''));
    }
  });
  if (LABELS.some((label) => !prices.has(label))) {
    throw new Error('Incomplete standard pricing.');
  }
  return Object.fromEntries(PRICE_FIELDS.map((field, index) => [field, prices.get(LABELS[index])]));
};

const discoverModelIds = (text) => {
  const ids = [...text.matchAll(/\/api\/docs\/models\/((?:gpt-[0-9]|codex-)[a-z0-9._-]*)/g)]
    .map((match) => match[1].replace(/\.md$/, ''))
    .filter((id) => !/(?:audio|realtime|transcribe|tts|image|search)/.test(id));
  const unique = [...new Set(ids)].sort();
  if (unique.length === 0) {
    throw new Error('Official model discovery returned no text models.');
  }
  return unique;
};

const collectCatalog = async (previous, fetchText, timestamp) => {
  const ids = discoverModelIds(await fetchText(`${MODEL_ROOT}.md`));
  const entries = new Map(previous.models.map((entry) => [entry.modelId, entry]));
  for (const id of ids) {
    const rates = parseModelPricing(await fetchText(`${MODEL_ROOT}/${id}.md`));
    const existing = entries.get(id);
    const unchanged = existing && PRICE_FIELDS.every((field) => existing[field] === rates[field]);
    entries.set(id, {
      modelId: id,
      aliases: existing?.aliases ?? [],
      ...rates,
      effectiveAt: unchanged ? existing.effectiveAt : timestamp,
      sourceUrl: `${MODEL_ROOT}/${id}`,
    });
  }
  return {
    schemaVersion: 1,
    version: timestamp,
    publishedAt: timestamp,
    currency: 'USD',
    unit: 'per-million-tokens',
    models: [...entries.values()].sort((a, b) => a.modelId.localeCompare(b.modelId)),
  };
};

const fetchText = async (url) => {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`Public pricing source returned HTTP ${response.status}: ${url}`);
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    throw new Error('Source too large.');
  }
  let text = '';
  let size = 0;
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) {
      throw new Error('Source too large.');
    }
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
};

const main = async () => {
  const { decodePricingCatalog } = await require('./load-pricing-validator.cjs')();
  if (process.argv.includes('--validate')) {
    decodePricingCatalog(JSON.parse(await readFile(resolve('pricing/catalog.json'), 'utf8')));
    console.log('Pricing catalog is valid.');
    return;
  }
  let previous;
  try {
    previous = decodePricingCatalog(JSON.parse(await fetchText(CATALOG_URL)));
  } catch (error) {
    if (!String(error.message).includes('HTTP 404:')) {
      throw error;
    }
    previous = decodePricingCatalog(
      JSON.parse(await readFile(resolve('pricing/catalog.json'), 'utf8'))
    );
  }
  const next = decodePricingCatalog(
    await collectCatalog(previous, fetchText, new Date().toISOString())
  );
  await writeFile(resolve('pricing/catalog.json'), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
};

module.exports = { parseModelPricing, discoverModelIds, collectCatalog };
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
