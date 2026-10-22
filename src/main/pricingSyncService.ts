/**
 * @file 网络价格同步服务
 * @description 管理缓存、后台刷新与偏好；价格验证并持久化成功后才能发布给预算运行时。
 */
import type { ModelPricingEntry } from '../shared/budgetTypes';
import {
  decodePricingCatalog,
  mergePricingCatalog,
  PRICING_CATALOG_V3_URL,
  getPricingCatalogUrl,
  assertCatalogProgression,
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
    sourceUrl: PRICING_CATALOG_V3_URL,
  };
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight: Promise<PricingSyncSnapshot> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastAttempt: number | undefined;
  let destroyed = false;
  // 更新安装准备仅暂停新任务；恢复时保留先前定时运行意图，在途保存由 drain 等待。
  let pauseDepth = 0;
  let runningRequested = false;
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
        sourceUrl: loaded.catalog
          ? getPricingCatalogUrl(loaded.catalog.schemaVersion)
          : PRICING_CATALOG_V3_URL,
        lastCheckedAt: loaded.lastCheckedAt,
      });
    } catch {
      applyPrices(builtIn);
      publish({ status: 'error', error: 'storage' });
    }
  };
  const refresh = (): Promise<PricingSyncSnapshot> => {
    if (pauseDepth > 0) {
      return Promise.reject(new Error('Pricing refresh is paused for application update.'));
    }
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
        if (state.catalog) {
          assertCatalogProgression(state.catalog, catalog);
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
          sourceUrl: getPricingCatalogUrl(catalog.schemaVersion),
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
    if (destroyed || pauseDepth > 0 || !state.autoUpdate) {
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
  const setAutoUpdate = (enabled: unknown): Promise<PricingSyncSnapshot> => {
    if (pauseDepth > 0) {
      return Promise.reject(new Error('Pricing preferences are paused for application update.'));
    }
    return enqueue(async () => {
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
  };
  const start = (): void => {
    runningRequested = true;
    if (timer || destroyed || pauseDepth > 0) {
      return;
    }
    void check();
    timer = setInterval(() => {
      void check();
    }, PRICING_RETRY_INTERVAL_MS);
  };
  const destroy = (): void => {
    destroyed = true;
    runningRequested = false;
    controller.abort();
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    listeners.clear();
  };
  const pause = (): (() => void) => {
    pauseDepth += 1;
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    let restored = false;
    return () => {
      if (restored) {
        return;
      }
      restored = true;
      pauseDepth -= 1;
      if (pauseDepth === 0 && runningRequested && !destroyed) {
        start();
      }
    };
  };
  const drain = async (): Promise<void> => {
    await queue;
    if (snapshot.status === 'error' && snapshot.error === 'storage') {
      throw new Error('Pricing persistence did not complete.');
    }
  };
  return {
    initialize,
    refresh,
    check,
    setAutoUpdate,
    start,
    pause,
    drain,
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
