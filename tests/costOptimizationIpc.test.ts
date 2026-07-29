import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationRuntime } from '../src/main/applicationRuntime';
import type { BudgetRuntime } from '../src/main/budgetRuntime';
import {
  CostOptimizationRuntimeValidationError,
  type CostOptimizationRuntime,
} from '../src/main/costOptimizationRuntime';
import type { LocaleService } from '../src/main/localeService';
import type { UsageRuntime } from '../src/main/usageRuntime';
import {
  COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
  COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL,
  COST_OPTIMIZATION_UPDATED_CHANNEL,
  COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL,
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
  costRuntime: CostRuntimeMock;
  send: ReturnType<typeof vi.fn>;
  emitSnapshot: Parameters<CostOptimizationRuntime['subscribe']>[0];
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
  const dependencies: Parameters<typeof registerUsageIpc>[0] = {
    applicationRuntime: {
      refresh: vi.fn(),
    } as unknown as ApplicationRuntime,
    budgetRuntime: {
      subscribe: () => () => undefined,
      subscribeNavigation: () => () => undefined,
    } as unknown as BudgetRuntime,
    usageRuntime: {
      subscribe: () => () => undefined,
    } as unknown as UsageRuntime,
    costRuntime,
    localeService: {
      subscribe: () => () => undefined,
    } as unknown as LocaleService,
    getWindow: () =>
      ({
        isDestroyed: () => false,
        webContents: { send },
      }) as unknown as Electron.BrowserWindow,
  };

  return {
    dependencies,
    costRuntime,
    send,
    emitSnapshot: (snapshot) => snapshotListener?.(snapshot),
  };
};

const invokeHandler = async (channel: string, input: unknown): Promise<unknown> => {
  const handler = electronMocks.handlers.get(channel);

  if (!handler) {
    throw new Error(`Missing IPC handler for ${channel}.`);
  }

  return handler({}, input);
};
