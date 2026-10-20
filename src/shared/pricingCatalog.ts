/**
 * @file 网络定价目录校验
 * @description 只接受明确来源的标准美元单价；任何歧义都拒绝整次更新，避免静默错价。
 */
import { decodePricingConditions } from './conditionalPricingValidation';
import { MODEL_PRICING_CONDITIONS } from './modelPricingConditions';
import type { ModelPricingEntry } from './budgetTypes';
import type { PricingCatalog, PricingCatalogVersion } from './pricingCatalogTypes';
import { isRecord } from './runtimeTypes';
import { normalizeModelId } from './pricing';

export const PRICING_CATALOG_URL =
  'https://raw.githubusercontent.com/Nancyingcode/token-usage/pricing/catalog.json';
export const CONDITIONAL_PRICING_CATALOG_URL = PRICING_CATALOG_URL.replace(
  'catalog.json',
  'catalog-v2.json'
);
export const PRICING_CATALOG_V3_URL = PRICING_CATALOG_URL.replace(
  'catalog.json',
  'catalog-v3.json'
);
export const NULLABLE_PRICING_CATALOG_VERSION = 3;
export const getPricingCatalogUrl = (version: PricingCatalogVersion): string => {
  if (version === 1) {
    return PRICING_CATALOG_URL;
  }
  return version === 2 ? CONDITIONAL_PRICING_CATALOG_URL : PRICING_CATALOG_V3_URL;
};
export const PRICING_REFRESH_INTERVAL_MS = 86_400_000;
export const PRICING_RETRY_INTERVAL_MS = 3_600_000;
export const PRICING_MAX_BYTES = 1_000_000;
export const PRICING_REQUEST_TIMEOUT_MS = 15_000;

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

const isPrice = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isModelId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9._:-]*$/i.test(value);

const isSource = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'developers.openai.com' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith('/api/docs/models/')
    );
  } catch {
    return false;
  }
};

const isCachedPrice = (value: unknown, version: PricingCatalogVersion): value is number | null =>
  isPrice(value) || (version === NULLABLE_PRICING_CATALOG_VERSION && value === null);

const decodeModel = (
  raw: unknown,
  version: PricingCatalogVersion
): PricingCatalog['models'][number] => {
  if (
    !isRecord(raw) ||
    !isModelId(raw.modelId) ||
    !Array.isArray(raw.aliases) ||
    !raw.aliases.every(isModelId) ||
    !isPrice(raw.inputUsdPerMillion) ||
    !isCachedPrice(raw.cachedInputUsdPerMillion, version) ||
    !isPrice(raw.outputUsdPerMillion) ||
    !isDate(raw.effectiveAt) ||
    !isSource(raw.sourceUrl)
  ) {
    throw new TypeError('Invalid pricing model.');
  }
  return {
    modelId: normalizeModelId(raw.modelId),
    aliases: raw.aliases.map(normalizeModelId),
    inputUsdPerMillion: raw.inputUsdPerMillion,
    cachedInputUsdPerMillion: raw.cachedInputUsdPerMillion,
    outputUsdPerMillion: raw.outputUsdPerMillion,
    effectiveAt: raw.effectiveAt,
    sourceUrl: raw.sourceUrl,
    ...(version !== 1 && raw.conditions !== undefined
      ? { conditions: decodePricingConditions(raw.conditions) }
      : {}),
  };
};

const validateAliases = (models: PricingCatalog['models']): void => {
  const ids = new Set<string>();
  models.forEach((entry) => {
    [entry.modelId, ...entry.aliases].forEach((id) => {
      const normalized = normalizeModelId(id);
      if (ids.has(normalized)) {
        throw new TypeError('Ambiguous pricing alias.');
      }
      ids.add(normalized);
    });
  });
};

export const decodePricingCatalog = (
  raw: unknown,
  expectedVersion?: PricingCatalogVersion
): PricingCatalog => {
  if (
    !isRecord(raw) ||
    (raw.schemaVersion !== 1 &&
      raw.schemaVersion !== 2 &&
      raw.schemaVersion !== NULLABLE_PRICING_CATALOG_VERSION) ||
    (expectedVersion !== undefined && raw.schemaVersion !== expectedVersion) ||
    raw.currency !== 'USD' ||
    raw.unit !== 'per-million-tokens' ||
    typeof raw.version !== 'string' ||
    !raw.version.trim() ||
    !isDate(raw.publishedAt) ||
    !Array.isArray(raw.models) ||
    raw.models.length === 0
  ) {
    throw new TypeError('Invalid pricing catalog.');
  }
  const version = raw.schemaVersion;
  const models = raw.models.map((model) => decodeModel(model, version));
  validateAliases(models);
  return {
    schemaVersion: version,
    version: raw.version,
    publishedAt: raw.publishedAt,
    currency: 'USD',
    unit: 'per-million-tokens',
    models,
  };
};

export const mergePricingCatalog = (
  builtIn: ModelPricingEntry[],
  catalog?: PricingCatalog
): ModelPricingEntry[] => {
  if (!catalog) {
    return builtIn;
  }
  const remote = catalog.models.map((entry): ModelPricingEntry => ({
    ...entry,
    sourceKind: 'remote',
    ...(!entry.conditions ? { rulesStatus: 'unavailable' } : {}),
  }));
  const remoteIds = new Set(remote.map((entry) => normalizeModelId(entry.modelId)));
  const result = [
    ...builtIn.filter((entry) => !remoteIds.has(normalizeModelId(entry.modelId))),
    ...remote,
  ];
  validateAliases(result);
  return result;
};

export const addCatalogConditions = (catalog: PricingCatalog): PricingCatalog =>
  decodePricingCatalog({
    ...catalog,
    schemaVersion:
      catalog.schemaVersion === NULLABLE_PRICING_CATALOG_VERSION ? catalog.schemaVersion : 2,
    models: catalog.models.map((entry) => ({
      ...entry,
      ...(MODEL_PRICING_CONDITIONS[entry.modelId]
        ? { conditions: MODEL_PRICING_CONDITIONS[entry.modelId] }
        : {}),
    })),
  });

export const assertCatalogProgression = (previous: PricingCatalog, next: PricingCatalog): void => {
  const nextById = new Map(next.models.map((entry) => [entry.modelId, entry]));
  // 已知价格和历史身份不能因源页面缺失而退化；空价补齐为数字则是正常更新。
  const lostHistory = previous.models.some((entry) => {
    const updated = nextById.get(entry.modelId);
    return (
      !updated ||
      entry.aliases.some((alias) => !updated.aliases.includes(alias)) ||
      (entry.cachedInputUsdPerMillion !== null && updated.cachedInputUsdPerMillion === null)
    );
  });
  if (
    next.schemaVersion < previous.schemaVersion ||
    Date.parse(next.publishedAt) < Date.parse(previous.publishedAt) ||
    lostHistory
  ) {
    throw new TypeError('Pricing catalog regressed.');
  }
};

export type PricingCatalogVersions = [PricingCatalog, PricingCatalog, PricingCatalog];

export const createCatalogVersions = (catalog: PricingCatalog): PricingCatalogVersions => {
  const complete = addCatalogConditions(
    decodePricingCatalog({ ...catalog, schemaVersion: NULLABLE_PRICING_CATALOG_VERSION })
  );
  const compatibleModels = complete.models.filter(
    (entry) => entry.cachedInputUsdPerMillion !== null
  );
  return [
    decodePricingCatalog({ ...complete, schemaVersion: 1, models: compatibleModels }),
    decodePricingCatalog({ ...complete, schemaVersion: 2, models: compatibleModels }),
    complete,
  ];
};

export const validateCatalogVersions = (catalogs: readonly unknown[]): PricingCatalogVersions => {
  const expectedVersions: PricingCatalogVersion[] = [1, 2, NULLABLE_PRICING_CATALOG_VERSION];
  if (catalogs.length !== expectedVersions.length) {
    throw new TypeError('All three pricing catalogs are required.');
  }
  const decoded = catalogs.map((catalog, index) =>
    decodePricingCatalog(catalog, expectedVersions[index])
  );
  const expected = createCatalogVersions(decoded[2]);
  if (
    decoded.some((catalog, index) => JSON.stringify(catalog) !== JSON.stringify(expected[index]))
  ) {
    throw new TypeError('Pricing catalogs must share the same base-price snapshot.');
  }
  return expected;
};
