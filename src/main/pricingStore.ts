/**
 * @file 网络价格缓存
 * @description 仅在应用数据目录原子保存已验证目录和偏好；损坏数据不作为价格使用。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  decodePricingCatalog,
  NULLABLE_PRICING_CATALOG_VERSION,
  PRICING_MAX_BYTES,
} from '../shared/pricingCatalog';
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

const readState = async (path: string): Promise<PricingState | undefined> => {
  try {
    const content = await readFile(path, 'utf8');
    if (Buffer.byteLength(content) > PRICING_MAX_BYTES) {
      throw new TypeError('Pricing cache is too large.');
    }
    return decodeState(JSON.parse(content));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

export const createPricingStore = (path: string, legacyPath?: string): PricingStore => {
  const save = async (state: PricingState): Promise<void> => {
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
  };
  return {
    load: async () => {
      const state = await readState(path);
      if (state) {
        return state;
      }
      const legacy = legacyPath ? await readState(legacyPath) : undefined;
      if (!legacy) {
        return { autoUpdate: true };
      }
      if (legacy.catalog?.schemaVersion === NULLABLE_PRICING_CATALOG_VERSION) {
        throw new TypeError('Legacy pricing cache must contain a v1 or v2 catalog.');
      }
      // 只迁移不存在的新缓存；保留旧文件，让回滚后的客户端仍可读取原价格与偏好。
      await save(legacy);
      return legacy;
    },
    save,
  };
};
