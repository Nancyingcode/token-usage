/**
 * @file 网络价格缓存
 * @description 仅在应用数据目录原子保存已验证目录和偏好；损坏数据不作为价格使用。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { decodePricingCatalog, PRICING_MAX_BYTES } from '../shared/pricingCatalog';
import type { PricingCatalog } from '../shared/pricingCatalogTypes';
import { isRecord } from '../shared/runtimeTypes';

export interface PricingState {
  autoUpdate: boolean;
  catalog?: PricingCatalog;
  lastCheckedAt?: string;
}

export interface PricingStore {
  load: () => Promise<PricingState>;
  save: (state: PricingState) => Promise<void>;
}

const decodeState = (raw: unknown): PricingState => {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== 1 ||
    typeof raw.autoUpdate !== 'boolean' ||
    (raw.lastCheckedAt !== undefined &&
      (typeof raw.lastCheckedAt !== 'string' || !Number.isFinite(Date.parse(raw.lastCheckedAt))))
  ) {
    throw new TypeError('Invalid pricing cache.');
  }
  return {
    autoUpdate: raw.autoUpdate,
    ...(raw.catalog === undefined ? {} : { catalog: decodePricingCatalog(raw.catalog) }),
    ...(typeof raw.lastCheckedAt === 'string' ? { lastCheckedAt: raw.lastCheckedAt } : {}),
  };
};

export const createPricingStore = (path: string): PricingStore => ({
  load: async () => {
    try {
      const content = await readFile(path, 'utf8');
      if (Buffer.byteLength(content) > PRICING_MAX_BYTES) {
        throw new TypeError('Pricing cache is too large.');
      }
      return decodeState(JSON.parse(content));
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') {
        return { autoUpdate: true };
      }
      throw error;
    }
  },
  save: async (state) => {
    const validated = decodeState({ schemaVersion: 1, ...state });
    const content = `${JSON.stringify({ schemaVersion: 1, ...validated })}\n`;
    if (Buffer.byteLength(content) > PRICING_MAX_BYTES) {
      throw new TypeError('Pricing cache is too large.');
    }
    const temporary = `${path}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    try {
      await writeFile(temporary, content, 'utf8');
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  },
});
