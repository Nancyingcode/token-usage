/**
 * @file Renderer 预加载桥接
 * @description 通过 contextBridge 暴露类型化 IPC API，不向 Renderer 提供直接文件系统访问能力。
 */
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
  THEME_GET_CHANNEL,
  THEME_SET_CHANNEL,
  THEME_UPDATED_CHANNEL,
  USAGE_GET_INITIAL_CHANNEL,
  USAGE_DATA_PATH_GET_CHANNEL,
  USAGE_DATA_PATH_RESET_CHANNEL,
  USAGE_DATA_PATH_SELECT_CHANNEL,
  USAGE_DATA_PATH_UPDATE_CHANNEL,
  USAGE_SCAN_CHANNEL,
  USAGE_UPDATED_CHANNEL,
  WINDOW_CLOSE_CHANNEL,
  WINDOW_GET_STATE_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_STATE_CHANGED_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
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
import {
  DEFAULT_LOCALE,
  INITIAL_LOCALE_ARGUMENT_PREFIX,
  isSupportedLocale,
  type SupportedLocale,
} from '../shared/i18n/locale';
import type { UsageScanResult } from '../shared/usageTypes';
import type {
  UsageDataPathIpcResponse,
  UsageDataPathSettings,
  UsageDataPathUpdateResult,
} from '../shared/usageDataPathTypes';
import type { WindowState } from '../shared/windowTypes';
import {
  DEFAULT_LIGHT_THEME,
  getThemeColorScheme,
  isThemeId,
  RESOLVED_THEME_ARGUMENT_PREFIX,
  type ThemeId,
  type ThemePreference,
  type ThemeSnapshot,
} from '../shared/theme';

const resolveInitialTheme = (args: readonly string[]): ThemeId => {
  const argument = args.find((value) => value.startsWith(RESOLVED_THEME_ARGUMENT_PREFIX));
  const candidate = argument?.slice(RESOLVED_THEME_ARGUMENT_PREFIX.length);
  return isThemeId(candidate) ? candidate : DEFAULT_LIGHT_THEME;
};

const resolveInitialLocale = (args: readonly string[]): SupportedLocale => {
  const argument = args.find((value) => value.startsWith(INITIAL_LOCALE_ARGUMENT_PREFIX));
  const candidate = argument?.slice(INITIAL_LOCALE_ARGUMENT_PREFIX.length);
  return isSupportedLocale(candidate) ? candidate : DEFAULT_LOCALE;
};

const initialTheme = resolveInitialTheme(process.argv);
const initialLocale = resolveInitialLocale(process.argv);
const applyInitialTheme = (): boolean => {
  const documentElement = document.documentElement;
  if (!documentElement) {
    return false;
  }

  documentElement.dataset.theme = initialTheme;
  documentElement.style.colorScheme = getThemeColorScheme(initialTheme);
  return true;
};

if (!applyInitialTheme()) {
  document.addEventListener('DOMContentLoaded', applyInitialTheme, { once: true });
}

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
  getInitialUsage: (): Promise<UsageScanResult> => ipcRenderer.invoke(USAGE_GET_INITIAL_CHANNEL),
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
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke(WINDOW_MINIMIZE_CHANNEL),
    toggleMaximize: (): Promise<WindowState> => ipcRenderer.invoke(WINDOW_TOGGLE_MAXIMIZE_CHANNEL),
    close: (): Promise<void> => ipcRenderer.invoke(WINDOW_CLOSE_CHANNEL),
    getState: (): Promise<WindowState> => ipcRenderer.invoke(WINDOW_GET_STATE_CHANNEL),
    onStateChanged: (listener: (state: WindowState) => void): (() => void) =>
      subscribe(WINDOW_STATE_CHANGED_CHANNEL, listener),
  },
  locale: {
    initial: initialLocale,
    get: (): Promise<SupportedLocale> => ipcRenderer.invoke(LOCALE_GET_CHANNEL),
    set: (locale: SupportedLocale): Promise<SupportedLocale> =>
      ipcRenderer.invoke(LOCALE_SET_CHANNEL, locale),
    onUpdated: (listener: (locale: SupportedLocale) => void): (() => void) =>
      subscribe(LOCALE_UPDATED_CHANNEL, listener),
  },
  theme: {
    get: (): Promise<ThemeSnapshot> => ipcRenderer.invoke(THEME_GET_CHANNEL),
    set: (preference: ThemePreference): Promise<ThemeSnapshot> =>
      ipcRenderer.invoke(THEME_SET_CHANNEL, preference),
    onUpdated: (listener: (snapshot: ThemeSnapshot) => void): (() => void) =>
      subscribe(THEME_UPDATED_CHANNEL, listener),
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
