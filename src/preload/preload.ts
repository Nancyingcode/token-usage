import { contextBridge, ipcRenderer } from 'electron';
import {
  BUDGET_DELETE_POLICY_CHANNEL,
  BUDGET_GET_SNAPSHOT_CHANNEL,
  BUDGET_NAVIGATE_CHANNEL,
  BUDGET_RESET_PRICING_CHANNEL,
  BUDGET_SAVE_POLICY_CHANNEL,
  BUDGET_SAVE_PRICING_CHANNEL,
  BUDGET_UPDATED_CHANNEL,
  BUDGET_UPDATE_THRESHOLDS_CHANNEL,
  LOCALE_GET_CHANNEL,
  LOCALE_SET_CHANNEL,
  LOCALE_UPDATED_CHANNEL,
  OPEN_EXTERNAL_CHANNEL,
  USAGE_SCAN_CHANNEL,
  USAGE_UPDATED_CHANNEL,
} from '../shared/ipcChannels';
import type {
  BudgetPolicyInput,
  BudgetSnapshot,
  BudgetThresholds,
  ModelPricingOverrideInput,
} from '../shared/budgetTypes';
import type { SupportedLocale } from '../shared/i18n/locale';
import type { UsageScanResult } from '../shared/usageTypes';

const subscribe = <Payload>(
  channel: string,
  listener: (payload: Payload) => void
): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: Payload): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('codexUsage', {
  scan: (): Promise<UsageScanResult> => ipcRenderer.invoke(USAGE_SCAN_CHANNEL),
  onUsageUpdated: (listener: (result: UsageScanResult) => void): (() => void) =>
    subscribe(USAGE_UPDATED_CHANNEL, listener),
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
    onUpdated: (listener: (snapshot: BudgetSnapshot) => void): (() => void) =>
      subscribe(BUDGET_UPDATED_CHANNEL, listener),
    onNavigate: (listener: (policyId: string) => void): (() => void) =>
      subscribe(BUDGET_NAVIGATE_CHANNEL, listener),
  },
});
