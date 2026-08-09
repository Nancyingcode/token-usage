/**
 * @file Electron 应用启动入口
 * @description
 * 初始化主窗口、用量扫描、预算运行时、通知和 IPC，并协调应用生命周期。
 */
import { app, BrowserWindow, dialog, Menu, Notification, type OpenDialogOptions } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplicationRuntime, type ApplicationRuntime } from './applicationRuntime';
import { createBudgetRuntime, type BudgetRuntime } from './budgetRuntime';
import { createBudgetStore } from './budgetStore';
import { getDefaultCodexSessionsDir, getSessionIndexPathForSessionsDir } from './codexPaths';
import { createCostOptimizationCacheStore } from './costOptimizationCacheStore';
import { createCostOptimizationConfigStore } from './costOptimizationConfigStore';
import { createCostOptimizationRuntime } from './costOptimizationRuntime';
import { DEFAULT_MODEL_PRICING } from './defaultModelPricing';
import { createMainI18n } from './i18n';
import registerUsageIpc from './ipc';
import { createLocaleService } from './localeService';
import { createLocaleStore } from './localeStore';
import { getApplicationMenuPolicy } from './menuPolicy';
import {
  createElectronNotificationAdapter,
  createNotificationService,
} from './notificationService';
import { createUsageScanner } from './usageScanner';
import { createUsageRuntime } from './usageRuntime';
import { createUsageDataPathService } from './usageDataPathService';
import { createUsageDataPathStore } from './usageDataPathStore';
import { createMainWindowOptions } from './windowConfig';
import { registerWindowControlIpc, registerWindowStateEvents } from './windowControls';

const CURRENT_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const BUDGET_CONFIG_FILENAME = 'budget-config.json';
const COST_OPTIMIZATION_CONFIG_FILENAME = 'cost-optimization-config.json';
const COST_OPTIMIZATION_CACHE_FILENAME = 'cost-optimization-cache.json';
const LOCALE_PREFERENCES_FILENAME = 'locale-preferences.json';
const USAGE_DATA_PATH_FILENAME = 'usage-data-path.json';

let mainWindow: BrowserWindow | null = null;
let budgetRuntime: BudgetRuntime | undefined;
let applicationRuntime: ApplicationRuntime | undefined;
let unregisterIpc: (() => void) | undefined;
let unregisterWindowControls: (() => void) | undefined;

const focusMainWindow = (): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

const selectUsageDataDirectory = async (defaultPath: string): Promise<string | null> => {
  const options: OpenDialogOptions = {
    defaultPath,
    properties: ['openDirectory'],
  };
  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

  return result.canceled ? null : (result.filePaths[0] ?? null);
};

const createWindow = (runtime: ApplicationRuntime): BrowserWindow => {
  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  const window = new BrowserWindow(
    createMainWindowOptions({
      preloadPath: join(CURRENT_DIRECTORY, '../preload/preload.mjs'),
      autoHideMenuBar: menuPolicy.autoHideMenuBar,
    })
  );
  const unregisterWindowStateListeners = registerWindowStateEvents(window);

  window.on('focus', () => {
    void runtime.refreshOnFocus().catch(() => undefined);
  });
  window.on('closed', () => {
    unregisterWindowStateListeners();
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(CURRENT_DIRECTORY, '../renderer/index.html'));
  }

  mainWindow = window;
  return window;
};

const initializeApplication = async (): Promise<void> => {
  const userDataPath = app.getPath('userData');
  const localeStore = createLocaleStore(join(userDataPath, LOCALE_PREFERENCES_FILENAME));
  const initialLocale = await localeStore.load(app.getLocale());
  const mainI18n = await createMainI18n(initialLocale);
  const localeService = createLocaleService({
    initialLocale,
    i18n: mainI18n,
    store: localeStore,
  });
  const scanner = createUsageScanner();
  const defaultSessionsDir = getDefaultCodexSessionsDir();
  const usageDataPathStore = createUsageDataPathStore(join(userDataPath, USAGE_DATA_PATH_FILENAME));
  const initialSessionsDir = (await usageDataPathStore.load()) ?? defaultSessionsDir;
  const budgetStore = createBudgetStore(join(userDataPath, BUDGET_CONFIG_FILENAME));
  const costConfigStore = createCostOptimizationConfigStore(
    join(userDataPath, COST_OPTIMIZATION_CONFIG_FILENAME)
  );
  const costCacheStore = createCostOptimizationCacheStore(
    join(userDataPath, COST_OPTIMIZATION_CACHE_FILENAME)
  );
  const notificationService = createNotificationService(
    (policyId) => {
      focusMainWindow();
      budgetRuntime?.navigateToPolicy(policyId);
    },
    createElectronNotificationAdapter(Notification),
    mainI18n
  );
  const usageRuntime = createUsageRuntime({
    scanCycle: (sessionsDir) =>
      scanner.scanCycle({
        sessionsDir,
        sessionIndexPath: getSessionIndexPathForSessionsDir(sessionsDir),
      }),
    initialSessionsDir,
    now: Date.now,
    setIntervalFn: (callback, delay) => setInterval(callback, delay),
    clearIntervalFn: (intervalId) => clearInterval(intervalId),
  });
  const currentBudgetRuntime = createBudgetRuntime({
    store: budgetStore,
    defaultPricing: DEFAULT_MODEL_PRICING,
    notify: notificationService.notify,
  });
  const costRuntime = createCostOptimizationRuntime({
    configStore: costConfigStore,
    cacheStore: costCacheStore,
    sessionsDir: initialSessionsDir,
    defaultPricing: DEFAULT_MODEL_PRICING,
  });
  const currentApplicationRuntime = createApplicationRuntime({
    usageRuntime,
    budgetRuntime: currentBudgetRuntime,
    costRuntime,
  });
  const usageDataPathService = createUsageDataPathService({
    defaultSessionsDir,
    initialSessionsDir,
    store: usageDataPathStore,
    updateSessionsDir: usageRuntime.updateSessionsDir,
  });
  budgetRuntime = currentBudgetRuntime;
  applicationRuntime = currentApplicationRuntime;

  await currentApplicationRuntime.initialize();
  unregisterIpc = registerUsageIpc({
    applicationRuntime: currentApplicationRuntime,
    usageRuntime,
    budgetRuntime: currentBudgetRuntime,
    costRuntime,
    localeService,
    usageDataPathService,
    selectUsageDataDirectory,
    getWindow: () => mainWindow,
  });
  unregisterWindowControls = registerWindowControlIpc();

  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  if (menuPolicy.removeApplicationMenu) {
    Menu.setApplicationMenu(null);
  }

  createWindow(currentApplicationRuntime);
  currentApplicationRuntime.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(currentApplicationRuntime);
    }
  });
};

void app.whenReady().then(initializeApplication);

app.on('before-quit', () => {
  applicationRuntime?.stop();
  unregisterIpc?.();
  unregisterIpc = undefined;
  unregisterWindowControls?.();
  unregisterWindowControls = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
