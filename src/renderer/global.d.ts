import type {
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingOverrideInput,
} from '../shared/budgetTypes';
import type {
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationSnapshot,
} from '../shared/costOptimizationTypes';
import type { SupportedLocale } from '../shared/i18n/locale';
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

interface LocaleApi {
  get: () => Promise<SupportedLocale>;
  set: (locale: SupportedLocale) => Promise<SupportedLocale>;
  onUpdated: (listener: (locale: SupportedLocale) => void) => () => void;
}

interface CostOptimizationApi {
  getSnapshot: (query: CostOptimizationQuery) => Promise<CostOptimizationSnapshot>;
  updateSettings: (settings: CostOptimizationSettings) => Promise<CostOptimizationSnapshot>;
  onUpdated: (listener: (snapshot: CostOptimizationSnapshot) => void) => () => void;
}

interface CodexUsageApi {
  scan: () => Promise<UsageScanResult>;
  onUsageUpdated: (listener: (result: UsageScanResult) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  locale: LocaleApi;
  budgets: BudgetApi;
  costOptimization: CostOptimizationApi;
}

declare global {
  interface Window {
    codexUsage: CodexUsageApi;
  }
}

export {};
