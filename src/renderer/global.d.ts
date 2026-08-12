import type {
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingOverrideInput,
  UnknownModelPricingInput,
} from '../shared/budgetTypes';
import type {
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  SessionDiagnosisDetailResult,
  SessionDiagnosisRequest,
} from '../shared/costOptimizationTypes';
import type { SupportedLocale } from '../shared/i18n/locale';
import type { UsageScanResult } from '../shared/usageTypes';
import type {
  UsageDataPathSettings,
  UsageDataPathUpdateResult,
} from '../shared/usageDataPathTypes';
import type { WindowState } from '../shared/windowTypes';
import type { ThemePreference, ThemeSnapshot } from '../shared/theme';

interface BudgetApi {
  getSnapshot: () => Promise<BudgetSnapshot>;
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  saveUnknownModelPricing: (input: UnknownModelPricingInput) => Promise<BudgetSnapshot>;
  deleteUnknownModelPricing: () => Promise<BudgetSnapshot>;
  onUpdated: (listener: (snapshot: BudgetSnapshot) => void) => () => void;
  onNavigate: (listener: (policyId: string) => void) => () => void;
}

interface LocaleApi {
  initial: SupportedLocale;
  get: () => Promise<SupportedLocale>;
  set: (locale: SupportedLocale) => Promise<SupportedLocale>;
  onUpdated: (listener: (locale: SupportedLocale) => void) => () => void;
}

interface ThemeApi {
  get: () => Promise<ThemeSnapshot>;
  set: (preference: ThemePreference) => Promise<ThemeSnapshot>;
  onUpdated: (listener: (snapshot: ThemeSnapshot) => void) => () => void;
}

interface CostOptimizationApi {
  getSnapshot: (query: CostOptimizationQuery) => Promise<CostOptimizationSnapshot>;
  getSessionDiagnosis: (request: SessionDiagnosisRequest) => Promise<SessionDiagnosisDetailResult>;
  updateSettings: (settings: CostOptimizationSettings) => Promise<CostOptimizationSnapshot>;
  onUpdated: (listener: (snapshot: CostOptimizationSnapshot) => void) => () => void;
}

interface WindowControlApi {
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<WindowState>;
  close: () => Promise<void>;
  getState: () => Promise<WindowState>;
  onStateChanged: (listener: (state: WindowState) => void) => () => void;
}

interface CodexUsageApi {
  getInitialUsage: () => Promise<UsageScanResult>;
  scan: () => Promise<UsageScanResult>;
  onUsageUpdated: (listener: (result: UsageScanResult) => void) => () => void;
  dataPath: {
    get: () => Promise<UsageDataPathSettings>;
    select: () => Promise<string | null>;
    update: (sessionsDir: string) => Promise<UsageDataPathUpdateResult>;
    reset: () => Promise<UsageDataPathUpdateResult>;
  };
  openExternal: (url: string) => Promise<void>;
  window: WindowControlApi;
  locale: LocaleApi;
  theme: ThemeApi;
  budgets: BudgetApi;
  costOptimization: CostOptimizationApi;
}

declare global {
  interface Window {
    codexUsage: CodexUsageApi;
  }
}

export {};
