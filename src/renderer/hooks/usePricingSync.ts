/**
 * @file 价格同步状态 Hook
 * @description 订阅主进程的价格状态，防止初始读取覆盖较新的事件，卸载时释放订阅。
 */
import { useEffect, useState } from 'react';
import type { PricingSyncSnapshot } from '../../shared/pricingCatalogTypes';

export const usePricingSync = () => {
  const [snapshot, setSnapshot] = useState<PricingSyncSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const api = window.codexUsage?.pricing;
    if (!api) {
      setUnavailable(true);
      return;
    }
    let active = true;
    let receivedEvent = false;
    const unsubscribe = api.onUpdated((next) => {
      receivedEvent = true;
      if (active) {
        setSnapshot(next);
        setUnavailable(false);
      }
    });
    void api
      .get()
      .then((next) => {
        if (active && !receivedEvent) {
          setSnapshot(next);
        }
      })
      .catch(() => {
        if (active && !receivedEvent) {
          setUnavailable(true);
        }
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const run = async (operation: () => Promise<PricingSyncSnapshot>): Promise<void> => {
    setPending(true);
    try {
      setSnapshot(await operation());
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setPending(false);
    }
  };
  return {
    snapshot,
    unavailable,
    pending,
    refresh: () => run(() => window.codexUsage.pricing.refresh()),
    setAutoUpdate: (enabled: boolean) =>
      run(() => window.codexUsage.pricing.setAutoUpdate(enabled)),
  };
};
