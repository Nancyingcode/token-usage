import type { ModelPricingEntry } from './budgetTypes';

export interface PricingCatalog {
  schemaVersion: 1 | 2;
  version: string;
  publishedAt: string;
  currency: 'USD';
  unit: 'per-million-tokens';
  models: Omit<ModelPricingEntry, 'sourceKind'>[];
}

export interface PricingSyncSnapshot {
  autoUpdate: boolean;
  status: 'idle' | 'refreshing' | 'ready' | 'error';
  sourceUrl: string;
  version?: string;
  lastCheckedAt?: string;
  error?: 'network' | 'invalid-catalog' | 'storage';
}

export interface PricingSyncApi {
  get: () => Promise<PricingSyncSnapshot>;
  refresh: () => Promise<PricingSyncSnapshot>;
  setAutoUpdate: (enabled: boolean) => Promise<PricingSyncSnapshot>;
  onUpdated: (listener: (snapshot: PricingSyncSnapshot) => void) => () => void;
}
