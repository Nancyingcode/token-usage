import { contextBridge, ipcRenderer } from 'electron';
import {
  BUDGET_DELETE_POLICY_CHANNEL,
  BUDGET_DELETE_UNKNOWN_MODEL_PRICING_CHANNEL,
  BUDGET_GET_SNAPSHOT_CHANNEL,
  BUDGET_NAVIGATE_CHANNEL,
  BUDGET_RESET_PRICING_CHANNEL,
  BUDGET_SAVE_POLICY_CHANNEL,
  BUDGET_SAVE_PRICING_CHANNEL,
  BUDGET_SAVE_UNKNOWN_MODEL_PRICING_CHANNEL,
  BUDGET_UPDATED_CHANNEL,
  BUDGET_UPDATE_THRESHOLDS_CHANNEL,
  COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL,
  COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
  COST_OPTIMIZATION_UPDATED_CHANNEL,
  COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL,
  LOCALE_GET_CHANNEL,
  LOCALE_SET_CHANNEL,
  LOCALE_UPDATED_CHANNEL,
  OPEN_EXTERNAL_CHANNEL,
  USAGE_DATA_PATH_GET_CHANNEL,
  USAGE_DATA_PATH_RESET_CHANNEL,
  USAGE_DATA_PATH_SELECT_CHANNEL,
  USAGE_DATA_PATH_UPDATE_CHANNEL,
  USAGE_SCAN_CHANNEL,
  USAGE_UPDATED_CHANNEL,
} from '../shared/ipcChannels';
import type {
  CostOptimizationIpcResponse,
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  SessionDiagnosisDetailResult,
  SessionDiagnosisRequest,
} from '../shared/costOptimizationTypes';
import type {
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingOverrideInput,
  UnknownModelPricingInput,
} from '../shared/budgetTypes';
import type { SupportedLocale } from '../shared/i18n/locale';
import type { UsageScanResult } from '../shared/usageTypes';
import type {
  UsageDataPathIpcResponse,
  UsageDataPathSettings,
  UsageDataPathUpdateResult,
} from '../shared/usageDataPathTypes';

const subscribe = <Payload>(
  channel: string,
  listener: (payload: Payload) => void
): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: Payload): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

const invokeCostOptimization = async <Result>(
  channel: string,
  input: CostOptimizationQuery | CostOptimizationSettings | SessionDiagnosisRequest
): Promise<Result> => {
  const response = (await ipcRenderer.invoke(
    channel,
    input
  )) as CostOptimizationIpcResponse<Result>;

  if (!response.ok) {
    throw response.error;
  }

  return response.value;
};

const invokeUsageDataPath = async <Result>(channel: string, input?: string): Promise<Result> => {
  const response = (await ipcRenderer.invoke(channel, input)) as UsageDataPathIpcResponse<Result>;

  if (!response.ok) {
    throw response.error;
  }

  return response.value;
};

contextBridge.exposeInMainWorld('codexUsage', {
  scan: (): Promise<UsageScanResult> => ipcRenderer.invoke(USAGE_SCAN_CHANNEL),
  onUsageUpdated: (listener: (result: UsageScanResult) => void): (() => void) =>
    subscribe(USAGE_UPDATED_CHANNEL, listener),
  dataPath: {
    get: (): Promise<UsageDataPathSettings> => ipcRenderer.invoke(USAGE_DATA_PATH_GET_CHANNEL),
    select: (): Promise<string | null> => ipcRenderer.invoke(USAGE_DATA_PATH_SELECT_CHANNEL),
    update: (sessionsDir: string): Promise<UsageDataPathUpdateResult> =>
      invokeUsageDataPath(USAGE_DATA_PATH_UPDATE_CHANNEL, sessionsDir),
    reset: (): Promise<UsageDataPathUpdateResult> =>
      invokeUsageDataPath(USAGE_DATA_PATH_RESET_CHANNEL),
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  locale: {
    get: (): Promise<SupportedLocale> => ipcRenderer.invoke(LOCALE_GET_CHANNEL),
    set: (locale: SupportedLocale): Promise<SupportedLocale> =>
      ipcRenderer.invoke(LOCALE_SET_CHANNEL, locale),
    onUpdated: (listener: (locale: SupportedLocale) => void): (() => void) =>
      subscribe(LOCALE_UPDATED_CHANNEL, listener),
  },
  budgets: {
    getSnapshot: (): Promise<BudgetSnapshot> => ipcRenderer.invoke(BUDGET_GET_SNAPSHOT_CHANNEL),
    savePolicy: (input: BudgetPolicyInput): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_SAVE_POLICY_CHANNEL, input),
    deletePolicy: (id: string): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_DELETE_POLICY_CHANNEL, id),
    updateThresholds: (input: BudgetThresholds): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_UPDATE_THRESHOLDS_CHANNEL, input),
    savePricingOverride: (input: ModelPricingOverrideInput): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_SAVE_PRICING_CHANNEL, input),
    resetPricingOverride: (modelId: string): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_RESET_PRICING_CHANNEL, modelId),
    saveUnknownModelPricing: (input: UnknownModelPricingInput): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_SAVE_UNKNOWN_MODEL_PRICING_CHANNEL, input),
    deleteUnknownModelPricing: (): Promise<BudgetSnapshot> =>
      ipcRenderer.invoke(BUDGET_DELETE_UNKNOWN_MODEL_PRICING_CHANNEL),
    onUpdated: (listener: (snapshot: BudgetSnapshot) => void): (() => void) =>
      subscribe(BUDGET_UPDATED_CHANNEL, listener),
    onNavigate: (listener: (policyId: string) => void): (() => void) =>
      subscribe(BUDGET_NAVIGATE_CHANNEL, listener),
  },
  costOptimization: {
    getSnapshot: (query: CostOptimizationQuery): Promise<CostOptimizationSnapshot> =>
      invokeCostOptimization(COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL, query),
    getSessionDiagnosis: (
      request: SessionDiagnosisRequest
    ): Promise<SessionDiagnosisDetailResult> =>
      invokeCostOptimization(COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL, request),
    updateSettings: (settings: CostOptimizationSettings): Promise<CostOptimizationSnapshot> =>
      invokeCostOptimization(COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL, settings),
    onUpdated: (listener: (snapshot: CostOptimizationSnapshot) => void): (() => void) =>
      subscribe(COST_OPTIMIZATION_UPDATED_CHANNEL, listener),
  },
});
