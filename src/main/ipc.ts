import { ipcMain, shell, type BrowserWindow } from 'electron';
import type {
  BudgetPolicyInput,
  BudgetThresholds,
  ModelPricingOverrideInput,
} from '../shared/budgetTypes';
import type {
  CostOptimizationIpcResponse,
  CostOptimizationQuery,
  CostOptimizationSettings,
  SessionDiagnosisRequest,
} from '../shared/costOptimizationTypes';
import {
  BUDGET_DELETE_POLICY_CHANNEL,
  BUDGET_GET_SNAPSHOT_CHANNEL,
  BUDGET_NAVIGATE_CHANNEL,
  BUDGET_RESET_PRICING_CHANNEL,
  BUDGET_SAVE_POLICY_CHANNEL,
  BUDGET_SAVE_PRICING_CHANNEL,
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
  USAGE_SCAN_CHANNEL,
  USAGE_UPDATED_CHANNEL,
} from '../shared/ipcChannels';
import type { ApplicationRuntime } from './applicationRuntime';
import type { BudgetRuntime } from './budgetRuntime';
import {
  CostOptimizationRuntimeValidationError,
  type CostOptimizationRuntime,
} from './costOptimizationRuntime';
import { isAllowedExternalUrl } from './externalUrlPolicy';
import type { LocaleService } from './localeService';
import type { UsageRuntime } from './usageRuntime';

export interface UsageIpcDependencies {
  applicationRuntime: ApplicationRuntime;
  usageRuntime: UsageRuntime;
  budgetRuntime: BudgetRuntime;
  costRuntime: Pick<
    CostOptimizationRuntime,
    'getSnapshot' | 'getSessionDiagnosis' | 'updateSettings' | 'subscribe'
  >;
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
  COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL,
  COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
  COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL,
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

const runCostOptimizationOperation = async <Result>(
  operation: () => Result | Promise<Result>
): Promise<CostOptimizationIpcResponse<Result>> => {
  try {
    return {
      ok: true,
      value: await operation(),
    };
  } catch (error) {
    if (error instanceof CostOptimizationRuntimeValidationError) {
      return {
        ok: false,
        error: {
          kind: 'validation',
          message: 'Cost optimization input is invalid.',
          issues: error.issues,
        },
      };
    }

    return {
      ok: false,
      error: {
        kind: 'unexpected',
        message: 'Cost optimization operation failed.',
        issues: [],
      },
    };
  }
};

const registerUsageIpc = ({
  applicationRuntime,
  usageRuntime,
  budgetRuntime,
  costRuntime,
  localeService,
  getWindow,
}: UsageIpcDependencies): (() => void) => {
  ipcMain.handle(USAGE_SCAN_CHANNEL, () => applicationRuntime.refresh());
  ipcMain.handle(BUDGET_GET_SNAPSHOT_CHANNEL, () => budgetRuntime.getSnapshot());
  ipcMain.handle(BUDGET_SAVE_POLICY_CHANNEL, (_event, input: BudgetPolicyInput) =>
    budgetRuntime.savePolicy(input)
  );
  ipcMain.handle(BUDGET_DELETE_POLICY_CHANNEL, (_event, id: string) =>
    budgetRuntime.deletePolicy(id)
  );
  ipcMain.handle(BUDGET_UPDATE_THRESHOLDS_CHANNEL, (_event, input: BudgetThresholds) =>
    budgetRuntime.updateThresholds(input)
  );
  ipcMain.handle(BUDGET_SAVE_PRICING_CHANNEL, (_event, input: ModelPricingOverrideInput) =>
    budgetRuntime.savePricingOverride(input)
  );
  ipcMain.handle(BUDGET_RESET_PRICING_CHANNEL, (_event, modelId: string) =>
    budgetRuntime.resetPricingOverride(modelId)
  );
  ipcMain.handle(COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL, (_event, query: CostOptimizationQuery) =>
    runCostOptimizationOperation(() => costRuntime.getSnapshot(query))
  );
  ipcMain.handle(
    COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
    (_event, request: SessionDiagnosisRequest) =>
      runCostOptimizationOperation(() => costRuntime.getSessionDiagnosis(request))
  );
  ipcMain.handle(
    COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL,
    (_event, settings: CostOptimizationSettings) =>
      runCostOptimizationOperation(() => costRuntime.updateSettings(settings))
  );
  ipcMain.handle(LOCALE_GET_CHANNEL, () => localeService.getLocale());
  ipcMain.handle(LOCALE_SET_CHANNEL, (_event, locale: unknown) => localeService.setLocale(locale));
  ipcMain.handle(OPEN_EXTERNAL_CHANNEL, async (_event, url: string) => {
    if (typeof url !== 'string' || !isAllowedExternalUrl(url)) {
      throw new TypeError('External URL is not allowed.');
    }

    await shell.openExternal(url);
  });

  const unsubscribeBudget = budgetRuntime.subscribe((snapshot) =>
    sendToRenderer(getWindow, BUDGET_UPDATED_CHANNEL, snapshot)
  );
  const unsubscribeUsage = usageRuntime.subscribe((result) =>
    sendToRenderer(getWindow, USAGE_UPDATED_CHANNEL, result)
  );
  const unsubscribeNavigation = budgetRuntime.subscribeNavigation((policyId) =>
    sendToRenderer(getWindow, BUDGET_NAVIGATE_CHANNEL, policyId)
  );
  const unsubscribeCostOptimization = costRuntime.subscribe((snapshot) =>
    sendToRenderer(getWindow, COST_OPTIMIZATION_UPDATED_CHANNEL, snapshot)
  );
  const unsubscribeLocale = localeService.subscribe((locale) =>
    sendToRenderer(getWindow, LOCALE_UPDATED_CHANNEL, locale)
  );

  return () => {
    unsubscribeBudget();
    unsubscribeUsage();
    unsubscribeNavigation();
    unsubscribeCostOptimization();
    unsubscribeLocale();
    HANDLED_CHANNELS.forEach((channel) => ipcMain.removeHandler(channel));
  };
};

export default registerUsageIpc;
