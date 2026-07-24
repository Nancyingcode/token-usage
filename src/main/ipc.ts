import { ipcMain, shell, type BrowserWindow } from 'electron';
import type {
  BudgetPolicyInput,
  BudgetThresholds,
  ModelPricingOverrideInput,
} from '../shared/budgetTypes';
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
import type { BudgetRuntime } from './budgetRuntime';
import { isAllowedExternalUrl } from './externalUrlPolicy';
import type { LocaleService } from './localeService';

export interface UsageIpcDependencies {
  runtime: BudgetRuntime;
  localeService: LocaleService;
  getWindow: () => BrowserWindow | null;
}

const HANDLED_CHANNELS = [
  USAGE_SCAN_CHANNEL,
  BUDGET_GET_SNAPSHOT_CHANNEL,
  BUDGET_SAVE_POLICY_CHANNEL,
  BUDGET_DELETE_POLICY_CHANNEL,
  BUDGET_UPDATE_THRESHOLDS_CHANNEL,
  BUDGET_SAVE_PRICING_CHANNEL,
  BUDGET_RESET_PRICING_CHANNEL,
  LOCALE_GET_CHANNEL,
  LOCALE_SET_CHANNEL,
  OPEN_EXTERNAL_CHANNEL,
] as const;

const sendToRenderer = (
  getWindow: UsageIpcDependencies['getWindow'],
  channel: string,
  payload: unknown
): void => {
  const window = getWindow();

  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, payload);
  }
};

const registerUsageIpc = ({
  runtime,
  localeService,
  getWindow,
}: UsageIpcDependencies): (() => void) => {
  ipcMain.handle(USAGE_SCAN_CHANNEL, () => runtime.refresh());
  ipcMain.handle(BUDGET_GET_SNAPSHOT_CHANNEL, () => runtime.getSnapshot());
  ipcMain.handle(BUDGET_SAVE_POLICY_CHANNEL, (_event, input: BudgetPolicyInput) =>
    runtime.savePolicy(input)
  );
  ipcMain.handle(BUDGET_DELETE_POLICY_CHANNEL, (_event, id: string) => runtime.deletePolicy(id));
  ipcMain.handle(BUDGET_UPDATE_THRESHOLDS_CHANNEL, (_event, input: BudgetThresholds) =>
    runtime.updateThresholds(input)
  );
  ipcMain.handle(BUDGET_SAVE_PRICING_CHANNEL, (_event, input: ModelPricingOverrideInput) =>
    runtime.savePricingOverride(input)
  );
  ipcMain.handle(BUDGET_RESET_PRICING_CHANNEL, (_event, modelId: string) =>
    runtime.resetPricingOverride(modelId)
  );
  ipcMain.handle(LOCALE_GET_CHANNEL, () => localeService.getLocale());
  ipcMain.handle(LOCALE_SET_CHANNEL, (_event, locale: unknown) => localeService.setLocale(locale));
  ipcMain.handle(OPEN_EXTERNAL_CHANNEL, async (_event, url: string) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
      throw new TypeError('External URL is not allowed.');
    }

    await shell.openExternal(url);
  });

  const unsubscribeBudget = runtime.subscribe((snapshot) =>
    sendToRenderer(getWindow, BUDGET_UPDATED_CHANNEL, snapshot)
  );
  const unsubscribeUsage = runtime.subscribeUsage((result) =>
    sendToRenderer(getWindow, USAGE_UPDATED_CHANNEL, result)
  );
  const unsubscribeNavigation = runtime.subscribeNavigation((policyId) =>
    sendToRenderer(getWindow, BUDGET_NAVIGATE_CHANNEL, policyId)
  );
  const unsubscribeLocale = localeService.subscribe((locale) =>
    sendToRenderer(getWindow, LOCALE_UPDATED_CHANNEL, locale)
  );

  return () => {
    unsubscribeBudget();
    unsubscribeUsage();
    unsubscribeNavigation();
    unsubscribeLocale();
    HANDLED_CHANNELS.forEach((channel) => ipcMain.removeHandler(channel));
  };
};

export default registerUsageIpc;
