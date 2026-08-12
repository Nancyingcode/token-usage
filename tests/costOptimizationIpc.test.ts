import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationRuntime } from '../src/main/applicationRuntime';
import type { BudgetRuntime } from '../src/main/budgetRuntime';
import {
  CostOptimizationRuntimeValidationError,
  type CostOptimizationRuntime,
} from '../src/main/costOptimizationRuntime';
import type { LocaleService } from '../src/main/localeService';
import type { ThemeService } from '../src/main/themeService';
import type { UsageRuntime } from '../src/main/usageRuntime';
import type { UsageDataPathService } from '../src/main/usageDataPathService';
import {
  BUDGET_DELETE_UNKNOWN_MODEL_PRICING_CHANNEL,
  BUDGET_SAVE_UNKNOWN_MODEL_PRICING_CHANNEL,
  COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
  COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL,
  COST_OPTIMIZATION_UPDATED_CHANNEL,
  COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL,
  THEME_GET_CHANNEL,
  THEME_SET_CHANNEL,
  THEME_UPDATED_CHANNEL,
  USAGE_GET_INITIAL_CHANNEL,
  USAGE_DATA_PATH_GET_CHANNEL,
  USAGE_DATA_PATH_RESET_CHANNEL,
  USAGE_DATA_PATH_SELECT_CHANNEL,
  USAGE_DATA_PATH_UPDATE_CHANNEL,
} from '../src/shared/ipcChannels';
import type { SessionDiagnosisRequest } from '../src/shared/costOptimizationTypes';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../src/shared/costOptimizationValidation';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';

type IpcHandler = (...args: unknown[]) => unknown;

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  handle: vi.fn((channel: string, handler: IpcHandler) => {
    electronMocks.handlers.set(channel, handler);
  }),
  removeHandler: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler,
  },
  shell: {
    openExternal: electronMocks.openExternal,
  },
}));

import registerUsageIpc from '../src/main/ipc';

describe('cost optimization IPC', () => {
  beforeEach(() => {
    electronMocks.handlers.clear();
    electronMocks.handle.mockClear();
    electronMocks.removeHandler.mockClear();
  });

  it('registers cost handlers and unregisters every channel', async () => {
    const harness = makeIpcHarness();
    const unregister = registerUsageIpc(harness.dependencies);
    const query = { period: 'month' as const };

    await expect(invokeHandler(COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL, query)).resolves.toEqual({
      ok: true,
      value: SNAPSHOT,
    });
    await expect(
      invokeHandler(COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL, DEFAULT_COST_OPTIMIZATION_SETTINGS)
    ).resolves.toEqual({ ok: true, value: SNAPSHOT });
    await expect(
      invokeHandler(COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL, {
        query: { period: 'total' },
        diagnosisId: 'missing',
      })
    ).resolves.toEqual({
      ok: true,
      value: { kind: 'not-found', diagnosisId: 'missing' },
    });

    expect(harness.costRuntime.getSnapshot).toHaveBeenCalledWith(query);
    expect(harness.costRuntime.updateSettings).toHaveBeenCalledWith(
      DEFAULT_COST_OPTIMIZATION_SETTINGS
    );
    expect(harness.costRuntime.getSessionDiagnosis).toHaveBeenCalledWith({
      query: { period: 'total' },
      diagnosisId: 'missing',
    });

    unregister();
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(
      COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL
    );
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(
      COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL
    );
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(
      COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL
    );
  });

  it('returns structured validation issues without exposing an arbitrary error', async () => {
    const harness = makeIpcHarness();
    const issues = [{ field: 'anomalyHistoryWindow', code: 'history-window-range' as const }];
    harness.costRuntime.updateSettings.mockRejectedValueOnce(
      new CostOptimizationRuntimeValidationError(issues)
    );
    registerUsageIpc(harness.dependencies);

    await expect(
      invokeHandler(COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL, DEFAULT_COST_OPTIMIZATION_SETTINGS)
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: 'validation',
        message: 'Cost optimization input is invalid.',
        issues,
      },
    });
  });

  it('pushes updated snapshots to the renderer subscription', () => {
    const harness = makeIpcHarness();
    registerUsageIpc(harness.dependencies);

    harness.emitSnapshot(SNAPSHOT);

    expect(harness.send).toHaveBeenCalledWith(COST_OPTIMIZATION_UPDATED_CHANNEL, SNAPSHOT);
  });

  it('redacts unexpected main-process error details', async () => {
    const harness = makeIpcHarness();
    harness.costRuntime.updateSettings.mockRejectedValueOnce(
      new Error('Failed to write C:\\private\\cost-config.json')
    );
    registerUsageIpc(harness.dependencies);

    await expect(
      invokeHandler(COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL, DEFAULT_COST_OPTIMIZATION_SETTINGS)
    ).resolves.toEqual({
      ok: false,
      error: {
        kind: 'unexpected',
        message: 'Cost optimization operation failed.',
        issues: [],
      },
    });
  });

  it('routes unknown-model fallback pricing through dedicated budget handlers', async () => {
    const harness = makeIpcHarness();
    registerUsageIpc(harness.dependencies);
    const input = {
      inputUsdPerMillion: 2,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 10,
    };

    await invokeHandler(BUDGET_SAVE_UNKNOWN_MODEL_PRICING_CHANNEL, input);
    await invokeHandler(BUDGET_DELETE_UNKNOWN_MODEL_PRICING_CHANNEL, undefined);

    expect(harness.budgetRuntime.saveUnknownModelPricing).toHaveBeenCalledWith(input);
    expect(harness.budgetRuntime.deleteUnknownModelPricing).toHaveBeenCalledOnce();
  });

  it('routes data path reads, updates and resets through the main-process service', async () => {
    const harness = makeIpcHarness();
    registerUsageIpc(harness.dependencies);

    await expect(invokeHandler(USAGE_DATA_PATH_GET_CHANNEL, undefined)).resolves.toEqual({
      sessionsDir: 'C:\\sessions',
      defaultSessionsDir: 'C:\\sessions',
      usingDefault: true,
    });
    await invokeHandler(USAGE_DATA_PATH_UPDATE_CHANNEL, 'D:\\sessions');
    await invokeHandler(USAGE_DATA_PATH_RESET_CHANNEL, undefined);
    await expect(invokeHandler(USAGE_DATA_PATH_SELECT_CHANNEL, undefined)).resolves.toBe(
      'E:\\selected'
    );

    expect(harness.usageDataPathService.update).toHaveBeenCalledWith('D:\\sessions');
    expect(harness.usageDataPathService.reset).toHaveBeenCalledOnce();
    expect(harness.selectUsageDataDirectory).toHaveBeenCalledWith('C:\\sessions');
  });

  it('waits for cost initialization before reading a snapshot', async () => {
    const ready = deferred<void>();
    const harness = makeIpcHarness();
    harness.applicationRuntime.waitForCostOptimization.mockReturnValueOnce(ready.promise);
    registerUsageIpc(harness.dependencies);

    const response = invokeHandler(COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL, { period: 'month' });
    expect(harness.costRuntime.getSnapshot).not.toHaveBeenCalled();

    ready.resolve();
    await expect(response).resolves.toEqual({ ok: true, value: SNAPSHOT });
    expect(harness.costRuntime.getSnapshot).toHaveBeenCalledOnce();
  });

  it('routes initial usage separately from an explicit refresh', async () => {
    const harness = makeIpcHarness();
    registerUsageIpc(harness.dependencies);

    await expect(invokeHandler(USAGE_GET_INITIAL_CHANNEL, undefined)).resolves.toBe(
      SNAPSHOT_USAGE_RESULT
    );
    expect(harness.applicationRuntime.getInitialUsage).toHaveBeenCalledOnce();
    expect(harness.applicationRuntime.refresh).not.toHaveBeenCalled();
  });

  it('routes theme reads and writes and publishes updated snapshots', async () => {
    const harness = makeIpcHarness();
    const unregister = registerUsageIpc(harness.dependencies);

    await expect(invokeHandler(THEME_GET_CHANNEL, undefined)).resolves.toEqual({
      preference: 'system',
      resolvedTheme: 'mint-light',
    });
    await expect(invokeHandler(THEME_SET_CHANNEL, 'ocean-dark')).resolves.toEqual({
      preference: 'ocean-dark',
      resolvedTheme: 'ocean-dark',
    });
    expect(harness.themeService.setPreference).toHaveBeenCalledWith('ocean-dark');

    harness.emitTheme({ preference: 'system', resolvedTheme: 'emerald-dark' });
    expect(harness.send).toHaveBeenCalledWith(THEME_UPDATED_CHANNEL, {
      preference: 'system',
      resolvedTheme: 'emerald-dark',
    });

    unregister();
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(THEME_GET_CHANNEL);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(THEME_SET_CHANNEL);
  });
});

interface CostRuntimeMock extends Pick<
  CostOptimizationRuntime,
  'getSnapshot' | 'getSessionDiagnosis' | 'updateSettings' | 'subscribe'
> {
  getSnapshot: ReturnType<typeof vi.fn>;
  getSessionDiagnosis: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
}

interface IpcHarness {
  dependencies: Parameters<typeof registerUsageIpc>[0];
  applicationRuntime: {
    getInitialUsage: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    waitForCostOptimization: ReturnType<typeof vi.fn>;
  };
  costRuntime: CostRuntimeMock;
  budgetRuntime: {
    saveUnknownModelPricing: ReturnType<typeof vi.fn>;
    deleteUnknownModelPricing: ReturnType<typeof vi.fn>;
  };
  send: ReturnType<typeof vi.fn>;
  emitSnapshot: Parameters<CostOptimizationRuntime['subscribe']>[0];
  usageDataPathService: UsageDataPathService;
  selectUsageDataDirectory: ReturnType<
    typeof vi.fn<(defaultPath: string) => Promise<string | null>>
  >;
  themeService: {
    setPreference: ReturnType<typeof vi.fn>;
  };
  emitTheme: Parameters<ThemeService['subscribe']>[0];
}

const makeIpcHarness = (): IpcHarness => {
  let snapshotListener: Parameters<CostOptimizationRuntime['subscribe']>[0] | undefined;
  const costRuntime: CostRuntimeMock = {
    getSnapshot: vi.fn(() => SNAPSHOT),
    getSessionDiagnosis: vi.fn(({ diagnosisId }: SessionDiagnosisRequest) => ({
      kind: 'not-found',
      diagnosisId,
    })),
    updateSettings: vi.fn(async () => SNAPSHOT),
    subscribe: vi.fn((listener) => {
      snapshotListener = listener;
      return () => undefined;
    }),
  };
  const send = vi.fn();
  const budgetRuntime = {
    subscribe: () => () => undefined,
    subscribeNavigation: () => () => undefined,
    saveUnknownModelPricing: vi.fn(async () => undefined),
    deleteUnknownModelPricing: vi.fn(async () => undefined),
  };
  const dataPathSettings = {
    sessionsDir: 'C:\\sessions',
    defaultSessionsDir: 'C:\\sessions',
    usingDefault: true,
  };
  const usageDataPathService: UsageDataPathService = {
    getSettings: vi.fn(() => dataPathSettings),
    update: vi.fn(async () => ({ settings: dataPathSettings, result: SNAPSHOT_USAGE_RESULT })),
    reset: vi.fn(async () => ({ settings: dataPathSettings, result: SNAPSHOT_USAGE_RESULT })),
  };
  const selectUsageDataDirectory = vi.fn(async (_defaultPath: string) => 'E:\\selected');
  let themeListener: Parameters<ThemeService['subscribe']>[0] | undefined;
  const themeService = {
    getSnapshot: vi.fn(() => ({
      preference: 'system' as const,
      resolvedTheme: 'mint-light' as const,
    })),
    setPreference: vi.fn(async () => ({
      preference: 'ocean-dark' as const,
      resolvedTheme: 'ocean-dark' as const,
    })),
    subscribe: vi.fn((listener: Parameters<ThemeService['subscribe']>[0]) => {
      themeListener = listener;
      return () => undefined;
    }),
  };
  const applicationRuntime = {
    getInitialUsage: vi.fn(async () => SNAPSHOT_USAGE_RESULT),
    refresh: vi.fn(async () => SNAPSHOT_USAGE_RESULT),
    waitForCostOptimization: vi.fn(async () => undefined),
  };
  const dependencies: Parameters<typeof registerUsageIpc>[0] = {
    applicationRuntime: applicationRuntime as unknown as ApplicationRuntime,
    budgetRuntime: budgetRuntime as unknown as BudgetRuntime,
    usageRuntime: {
      subscribe: () => () => undefined,
    } as unknown as UsageRuntime,
    costRuntime,
    localeService: {
      subscribe: () => () => undefined,
    } as unknown as LocaleService,
    themeService: themeService as unknown as ThemeService,
    usageDataPathService,
    selectUsageDataDirectory,
    getWindow: () =>
      ({
        isDestroyed: () => false,
        webContents: { send },
      }) as unknown as Electron.BrowserWindow,
  };

  return {
    dependencies,
    applicationRuntime,
    costRuntime,
    budgetRuntime,
    send,
    emitSnapshot: (snapshot) => snapshotListener?.(snapshot),
    usageDataPathService,
    selectUsageDataDirectory,
    themeService,
    emitTheme: (snapshot) => themeListener?.(snapshot),
  };
};

const SNAPSHOT_USAGE_RESULT = {
  sessionsDir: 'C:\\sessions',
  scannedAt: '2026-08-04T00:00:00.000Z',
  summary: {
    totals: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
    byDay: [],
    byProject: [],
    sessions: [],
  },
  warnings: [],
};

const invokeHandler = async (channel: string, input: unknown): Promise<unknown> => {
  const handler = electronMocks.handlers.get(channel);

  if (!handler) {
    throw new Error(`Missing IPC handler for ${channel}.`);
  }

  return handler({}, input);
};

const deferred = <Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} => {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
};
