/**
 * @file 网络价格同步服务
 * @description 管理缓存、后台刷新与偏好；价格验证并持久化成功后才能发布给预算运行时。
 */
import type { ModelPricingEntry } from '../shared/budgetTypes';
import {
  decodePricingCatalog,
  mergePricingCatalog,
  PRICING_CATALOG_URL,
  CONDITIONAL_PRICING_CATALOG_URL,
  PRICING_REFRESH_INTERVAL_MS,
  PRICING_RETRY_INTERVAL_MS,
} from '../shared/pricingCatalog';
import type { PricingCatalog, PricingSyncSnapshot } from '../shared/pricingCatalogTypes';
import type { PricingState, PricingStore } from './pricingStore';
import { fetchPricingCatalog } from './pricingTransport';

interface Dependencies {
  store: PricingStore;
  builtIn: ModelPricingEntry[];
  applyPrices: (entries: ModelPricingEntry[]) => void;
  download?: (signal: AbortSignal) => Promise<PricingCatalog>;
  now?: () => number;
}

export const createPricingSyncService = ({
  store,
  builtIn,
  applyPrices,
  download = fetchPricingCatalog,
  now = Date.now,
}: Dependencies) => {
  // 状态、请求和监听者由本服务实例拥有，destroy 终止请求、定时器和发布；写队列避免偏好与缓存互相覆盖。
  let state: PricingState = { autoUpdate: true };
  let snapshot: PricingSyncSnapshot = {
    autoUpdate: true,
    status: 'idle',
    sourceUrl: CONDITIONAL_PRICING_CATALOG_URL,
  };
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight: Promise<PricingSyncSnapshot> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastAttempt: number | undefined;
  let destroyed = false;
  const controller = new AbortController();
  const listeners = new Set<(value: PricingSyncSnapshot) => void>();

  const publish = (change: Partial<PricingSyncSnapshot>): PricingSyncSnapshot => {
    snapshot = { ...snapshot, ...change, autoUpdate: state.autoUpdate };
    if (!destroyed) {
      listeners.forEach((listener) => listener({ ...snapshot }));
    }
    return { ...snapshot };
  };
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  };
  const initialize = async (): Promise<void> => {
    try {
      const loaded = await store.load();
      const prices = mergePricingCatalog(builtIn, loaded.catalog);
      state = loaded;
      applyPrices(prices);
      publish({
        status: loaded.catalog ? 'ready' : 'idle',
        version: loaded.catalog?.version,
        sourceUrl:
          loaded.catalog?.schemaVersion === 1
            ? PRICING_CATALOG_URL
            : CONDITIONAL_PRICING_CATALOG_URL,
        lastCheckedAt: loaded.lastCheckedAt,
      });
    } catch {
      applyPrices(builtIn);
      publish({ status: 'error', error: 'storage' });
    }
  };
  const refresh = (): Promise<PricingSyncSnapshot> => {
    if (destroyed) {
      return Promise.resolve({ ...snapshot });
    }
    if (inFlight) {
      return inFlight;
    }
    inFlight = enqueue(async () => {
      if (destroyed) {
        return { ...snapshot };
      }
      lastAttempt = now();
      const lastCheckedAt = new Date(lastAttempt).toISOString();
      publish({ status: 'refreshing', error: undefined, lastCheckedAt });
      let errorKind: PricingSyncSnapshot['error'] = 'network';
      try {
        const downloaded = await download(controller.signal);
        if (destroyed) {
          return { ...snapshot };
        }
        errorKind = 'invalid-catalog';
        const catalog = decodePricingCatalog(downloaded);
        // 目录发布方必须保留历史模型；异常删减和时间倒退不能让已计价用量突然丢失。
        if (
          state.catalog &&
          (catalog.schemaVersion < state.catalog.schemaVersion ||
            Date.parse(catalog.publishedAt) < Date.parse(state.catalog.publishedAt) ||
            state.catalog.models.some(
              (entry) => !catalog.models.some((next) => next.modelId === entry.modelId)
            ))
        ) {
          throw new TypeError('Pricing catalog regressed.');
        }
        const prices = mergePricingCatalog(builtIn, catalog);
        const next = { ...state, catalog, lastCheckedAt };
        errorKind = 'storage';
        await store.save(next);
        if (destroyed) {
          return { ...snapshot };
        }
        state = next;
        applyPrices(prices);
        return publish({
          status: 'ready',
          version: catalog.version,
          error: undefined,
          sourceUrl:
            catalog.schemaVersion === 1 ? PRICING_CATALOG_URL : CONDITIONAL_PRICING_CATALOG_URL,
        });
      } catch {
        return publish({ status: 'error', error: errorKind });
      }
    }).finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
  const check = async (hasUnpricedModels = false): Promise<void> => {
    if (destroyed || !state.autoUpdate) {
      return;
    }
    const elapsed = now() - Date.parse(state.lastCheckedAt ?? '');
    const due =
      !state.lastCheckedAt ||
      elapsed >= PRICING_REFRESH_INTERVAL_MS ||
      elapsed < 0 ||
      hasUnpricedModels;
    const retryAllowed =
      lastAttempt === undefined || now() - lastAttempt >= PRICING_RETRY_INTERVAL_MS;
    if (due && retryAllowed) {
      await refresh();
    }
  };
  const setAutoUpdate = (enabled: unknown): Promise<PricingSyncSnapshot> =>
    enqueue(async () => {
      if (typeof enabled !== 'boolean') {
        throw new TypeError('Invalid automatic pricing preference.');
      }
      if (destroyed) {
        return { ...snapshot };
      }
      try {
        const next = { ...state, autoUpdate: enabled };
        await store.save(next);
        state = next;
        return publish({});
      } catch {
        return publish({ status: 'error', error: 'storage' });
      }
    });
  const start = (): void => {
    if (timer || destroyed) {
      return;
    }
    void check();
    timer = setInterval(() => {
      void check();
    }, PRICING_RETRY_INTERVAL_MS);
  };
  const destroy = (): void => {
    destroyed = true;
    controller.abort();
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    listeners.clear();
  };
  return {
    initialize,
    refresh,
    check,
    setAutoUpdate,
    start,
    destroy,
    getSnapshot: (): PricingSyncSnapshot => ({ ...snapshot }),
    subscribe: (listener: (value: PricingSyncSnapshot) => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export type PricingSyncService = ReturnType<typeof createPricingSyncService>;
