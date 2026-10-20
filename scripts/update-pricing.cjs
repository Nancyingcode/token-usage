/**
 * @file 官方基础价格采集
 * @description 严格解析官方文本模型价格，保留历史条目；任何解析失败都禁止输出部分更新。
 */
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve } = require('node:path');

const MODEL_ROOT = 'https://developers.openai.com/api/docs/models';
const CATALOG_URL =
  'https://raw.githubusercontent.com/Nancyingcode/token-usage/pricing/catalog.json';
const CATALOG_SCHEMA_VERSION = 3;
const CATALOG_FILES = ['catalog.json', 'catalog-v2.json', 'catalog-v3.json'];
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 1_000_000;
const PRICE_FIELDS = ['inputUsdPerMillion', 'cachedInputUsdPerMillion', 'outputUsdPerMillion'];
const LABELS = ['input', 'cached input', 'output'];
const TABLE_LABELS = [...LABELS, 'cache writes'];

const getSection = (text, title) => {
  const lines = text.split(/\r?\n/);
  const headings = lines.flatMap((line, index) => {
    const match = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*$/);
    return match ? [{ index, level: match[1].length, title: match[2].toLowerCase() }] : [];
  });
  const matches = headings.filter((heading) => heading.title === title.toLowerCase());
  if (matches.length > 1) {
    throw new Error(`Duplicate ${title} section.`);
  }
  const heading = matches[0];
  if (!heading) {
    return undefined;
  }
  const end = headings.find((next) => next.index > heading.index && next.level <= heading.level);
  return { level: heading.level, text: lines.slice(heading.index + 1, end?.index).join('\n') };
};

const parsePrice = (value) => {
  const match = value.trim().match(/^\$([0-9]+(?:\.[0-9]+)?)$/);
  const price = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(price)) {
    throw new Error(`Invalid price: ${value}`);
  }
  return price;
};

const parseMetricTable = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const start = lines.findIndex((line) => line.startsWith('|'));
  let end = start;
  while (end >= 0 && end < lines.length && lines[end]) {
    end += 1;
  }
  // 损坏的缓存行不能被丢弃后变成空价；完整表格外只允许说明文字，不借用其他价格块。
  const outsideTable = [...lines.slice(0, start), ...lines.slice(end)];
  if (
    start < 0 ||
    outsideTable.some(
      (line) =>
        line.includes('|') ||
        /^(?:input|cached\s+input|output|cache\s+writes)(?:\s|:|$)/i.test(line) ||
        /^\$[0-9]/.test(line) ||
        /^1m tokens$/i.test(line)
    )
  ) {
    throw new Error('Unconsumed pricing table content.');
  }
  const tableLines = lines.slice(start, end);
  const rows = tableLines.map((line) => {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (!line.startsWith('|') || !line.endsWith('|') || cells.length !== 3) {
      throw new Error('Invalid pricing table row.');
    }
    return cells;
  });
  if (
    rows[0]?.map((cell) => cell.toLowerCase()).join('|') !== 'metric|price|unit' ||
    !rows[1]?.every((cell) => /^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error('Invalid metric pricing table.');
  }
  const prices = new Map();
  rows.slice(2).forEach(([metric, value, unit]) => {
    const label = metric.toLowerCase();
    if (!TABLE_LABELS.includes(label) || prices.has(label) || !/^1m tokens$/i.test(unit)) {
      throw new Error(`Invalid pricing metric or unit: ${metric}`);
    }
    prices.set(label, parsePrice(value));
  });
  if (!prices.has('input') || !prices.has('output')) {
    throw new Error('Incomplete standard pricing.');
  }
  // 仅完整、已识别的官方表格允许缺少缓存行；缺值或改名不能静默变成未提供。
  return {
    inputUsdPerMillion: prices.get('input'),
    cachedInputUsdPerMillion: prices.get('cached input') ?? null,
    outputUsdPerMillion: prices.get('output'),
  };
};

const parseModelPricing = (text) => {
  const pricing = getSection(text, 'Pricing');
  if (!pricing) {
    throw new Error('Standard text pricing section or unit is missing.');
  }
  const tokens = getSection(pricing.text, 'Text tokens');
  const section = tokens?.text ?? pricing.text;
  // Batch 单价与 Standard 单价不能混用；没有明确标准口径时交给维护者处理。
  if (
    /batch api price/i.test(pricing.text) ||
    (tokens && tokens.level !== pricing.level + 1) ||
    /^#{1,6}[ \t]+/m.test(section)
  ) {
    throw new Error('Ambiguous pricing tier.');
  }
  if (tokens && /^\|[ \t]*Metric[ \t]*\|/im.test(section)) {
    return parseMetricTable(section);
  }
  if ((!tokens && !/text tokens/i.test(section)) || !/per\s+1m\s+tokens/i.test(section)) {
    throw new Error('Standard text pricing section or unit is missing.');
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
    if (prices.has(normalized)) {
      throw new Error(`Invalid or duplicate price: ${label}`);
    }
    prices.set(normalized, parsePrice(value));
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
    const url = `${MODEL_ROOT}/${id}.md`;
    try {
      const rates = parseModelPricing(await fetchText(url));
      const historical = previous.models.find((entry) =>
        [entry.modelId, ...entry.aliases].some((identity) => identity.trim().toLowerCase() === id)
      );
      if (
        historical &&
        historical.cachedInputUsdPerMillion !== null &&
        rates.cachedInputUsdPerMillion === null
      ) {
        throw new Error('Previously published cached input price is missing.');
      }
      const existing = entries.get(id);
      const unchanged = existing && PRICE_FIELDS.every((field) => existing[field] === rates[field]);
      entries.set(id, {
        modelId: id,
        aliases: existing?.aliases ?? [],
        ...rates,
        effectiveAt: unchanged ? existing.effectiveAt : timestamp,
        sourceUrl: `${MODEL_ROOT}/${id}`,
        ...(existing?.conditions ? { conditions: existing.conditions } : {}),
      });
    } catch (error) {
      throw new Error(`Pricing collection failed for ${id} (${url}): ${error.message}`, {
        cause: error,
      });
    }
  }
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
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
    const error = new Error(`Public pricing source returned HTTP ${response.status}: ${url}`);
    error.status = response.status;
    throw error;
  }
  if (!response.body) {
    throw new Error(`Public pricing source returned no body: ${url}`);
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

const loadPreviousCatalog = async (download, seedDirectory, validators) => {
  for (const version of [CATALOG_SCHEMA_VERSION, 2, 1]) {
    const url = CATALOG_URL.replace('catalog.json', CATALOG_FILES[version - 1]);
    try {
      return validators.decodePricingCatalog(JSON.parse(await download(url)), version);
    } catch (error) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }
  return validators.decodePricingCatalog(
    JSON.parse(await readFile(resolve(seedDirectory, 'catalog-v3.json'), 'utf8')),
    CATALOG_SCHEMA_VERSION
  );
};

const validatePricingDirectory = async (directory, validators) =>
  validators.validateCatalogVersions(
    await Promise.all(
      CATALOG_FILES.map(async (filename) =>
        JSON.parse(await readFile(resolve(directory, filename), 'utf8'))
      )
    )
  );

const updatePricing = async ({
  outputDirectory = resolve('pricing'),
  seedDirectory = resolve(__dirname, '../pricing'),
  fetchText: download = fetchText,
  timestamp = new Date().toISOString(),
  validators,
} = {}) => {
  const validation = validators ?? (await require('./load-pricing-validator.cjs')());
  const previous = await loadPreviousCatalog(download, seedDirectory, validation);
  const next = validation.decodePricingCatalog(await collectCatalog(previous, download, timestamp));
  validation.assertCatalogProgression(previous, next);
  const versions = validation.validateCatalogVersions(validation.createCatalogVersions(next));
  // 所有采集和校验完成后才触碰输出目录；跨文件写入失败由发布前的一致性校验阻断。
  await mkdir(outputDirectory, { recursive: true });
  for (const [index, catalog] of versions.entries()) {
    await writeFile(
      resolve(outputDirectory, CATALOG_FILES[index]),
      `${JSON.stringify(catalog, null, 2)}\n`,
      'utf8'
    );
  }
  return versions;
};

const main = async () => {
  const outputIndex = process.argv.indexOf('--output-dir');
  if (outputIndex !== -1 && !process.argv[outputIndex + 1]) {
    throw new Error('--output-dir requires a directory.');
  }
  const outputDirectory =
    outputIndex === -1 ? resolve('pricing') : resolve(process.argv[outputIndex + 1]);
  if (process.argv.includes('--validate')) {
    await validatePricingDirectory(
      outputDirectory,
      await require('./load-pricing-validator.cjs')()
    );
    console.log('Pricing catalogs are valid.');
    return;
  }
  const catalogs = await updatePricing({ outputDirectory });
  console.log(
    `Collected ${catalogs[2].models.length} models; ${catalogs[0].models.length} have complete legacy pricing.`
  );
};

module.exports = {
  CATALOG_FILES,
  parseModelPricing,
  discoverModelIds,
  collectCatalog,
  fetchText,
  loadPreviousCatalog,
  updatePricing,
  validatePricingDirectory,
};
if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
