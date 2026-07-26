import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationRuntime } from '../src/main/applicationRuntime';
import type { BudgetRuntime } from '../src/main/budgetRuntime';
import type { CostOptimizationRuntime } from '../src/main/costOptimizationRuntime';
import type { LocaleService } from '../src/main/localeService';
import type { UsageRuntime } from '../src/main/usageRuntime';
import type { SupportedLocale } from '../src/shared/i18n/locale';
import {
  LOCALE_GET_CHANNEL,
  LOCALE_SET_CHANNEL,
  LOCALE_UPDATED_CHANNEL,
} from '../src/shared/ipcChannels';

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

describe('locale IPC', () => {
  beforeEach(() => {
    electronMocks.handlers.clear();
    electronMocks.handle.mockClear();
    electronMocks.removeHandler.mockClear();
  });

  it('gets, sets, broadcasts, and unregisters the main-process locale', async () => {
    let currentLocale: SupportedLocale = 'en';
    let localeListener: ((locale: SupportedLocale) => void) | undefined;
    const unsubscribeLocale = vi.fn();
    const localeService: LocaleService = {
      getLocale: vi.fn(() => currentLocale),
      setLocale: vi.fn(async (locale: unknown) => {
        currentLocale = locale as SupportedLocale;
        return currentLocale;
      }),
      subscribe: vi.fn((listener) => {
        localeListener = listener;
        return unsubscribeLocale;
      }),
    };
    const send = vi.fn();
    const unregister = registerUsageIpc({
      applicationRuntime: createApplicationRuntimeStub(),
      budgetRuntime: createBudgetRuntimeStub(),
      costRuntime: createCostRuntimeStub(),
      usageRuntime: createUsageRuntimeStub(),
      localeService,
      getWindow: () =>
        ({
          isDestroyed: () => false,
          webContents: { send },
        }) as unknown as Electron.BrowserWindow,
    });

    const getHandler = electronMocks.handlers.get(LOCALE_GET_CHANNEL);
    const setHandler = electronMocks.handlers.get(LOCALE_SET_CHANNEL);

    expect(getHandler?.({})).toBe('en');
    await expect(setHandler?.({}, 'zh-CN')).resolves.toBe('zh-CN');
    expect(localeService.setLocale).toHaveBeenCalledWith('zh-CN');

    localeListener?.('zh-CN');
    expect(send).toHaveBeenCalledWith(LOCALE_UPDATED_CHANNEL, 'zh-CN');

    unregister();
    expect(unsubscribeLocale).toHaveBeenCalledOnce();
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(LOCALE_GET_CHANNEL);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(LOCALE_SET_CHANNEL);
  });
});

const createApplicationRuntimeStub = (): ApplicationRuntime =>
  ({
    refresh: vi.fn(),
  }) as unknown as ApplicationRuntime;

const createBudgetRuntimeStub = (): BudgetRuntime =>
  ({
    subscribe: () => () => undefined,
    subscribeNavigation: () => () => undefined,
  }) as unknown as BudgetRuntime;

const createUsageRuntimeStub = (): UsageRuntime =>
  ({
    subscribe: () => () => undefined,
  }) as unknown as UsageRuntime;

const createCostRuntimeStub = (): CostOptimizationRuntime =>
  ({
    subscribe: () => () => undefined,
  }) as unknown as CostOptimizationRuntime;
