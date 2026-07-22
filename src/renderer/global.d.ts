import type {
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingOverrideInput,
} from '../shared/budgetTypes';
import type { UsageScanResult } from '../shared/usageTypes';

interface BudgetApi {
  getSnapshot: () => Promise<BudgetSnapshot>;
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  onUpdated: (listener: (snapshot: BudgetSnapshot) => void) => () => void;
  onNavigate: (listener: (policyId: string) => void) => () => void;
}

interface CodexUsageApi {
  scan: () => Promise<UsageScanResult>;
  onUsageUpdated: (listener: (result: UsageScanResult) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  budgets: BudgetApi;
}

declare global {
  interface Window {
    codexUsage: CodexUsageApi;
  }
}

export {};
