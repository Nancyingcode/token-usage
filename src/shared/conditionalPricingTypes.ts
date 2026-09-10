import type { TokenUsage } from './usageTypes';

export type PricingMode = 'standard' | 'fast' | 'flex' | 'batch';
export type PricingIssue =
  | 'rules-unavailable'
  | 'request-granularity'
  | 'mode-unknown'
  | 'mode-unsupported'
  | 'cache-write-missing'
  | 'cache-write-unverified'
  | 'cache-partition-invalid'
  | 'manual-flat';

export interface UsagePricingContext {
  granularity: 'request' | 'aggregate';
  cacheWriteInputTokens?: number;
  cacheWriteInvalid?: boolean;
  cacheWriteSemantics?: 'included-in-input' | 'unverified';
  mode: PricingMode | 'unknown';
  modeSource: 'response' | 'request' | 'missing';
}

export interface PriceableUsage extends TokenUsage {
  pricingContext?: UsagePricingContext;
  pricingRequests?: Record<string, PriceableUsage>;
}

export interface PricingConditions {
  sourceUrl: string;
  verifiedAt: string;
  cacheWriteMultiplier?: number;
  longContext?: {
    inputTokenThreshold: number;
    inputMultiplier: number;
    cachedInputMultiplier: number;
    cacheWriteMultiplier: number;
    outputMultiplier: number;
  };
  modes: Partial<Record<PricingMode, number>> & { standard: 1 };
}

export interface ConditionalPricingFields {
  manualFlat?: boolean;
  conditions?: PricingConditions;
  availableConditions?: PricingConditions;
  rulesStatus?: 'unavailable';
}
