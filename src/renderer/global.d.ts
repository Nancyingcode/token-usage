import type { UsageScanResult } from '../shared/usageTypes';

declare global {
  interface Window {
    codexUsage: {
      scan: () => Promise<UsageScanResult>;
    };
  }
}

export {};
