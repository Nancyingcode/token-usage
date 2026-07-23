/**
 * @file Electron 应用启动入口
 * @description
 * 初始化主窗口、用量扫描、预算运行时、通知和 IPC，并协调应用生命周期。
 */
import { app, BrowserWindow, Menu, Notification } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBudgetRuntime, type BudgetRuntime } from './budgetRuntime';
import { createBudgetStore } from './budgetStore';
import { DEFAULT_MODEL_PRICING } from './defaultModelPricing';
import registerUsageIpc from './ipc';
import { getApplicationMenuPolicy } from './menuPolicy';
import {
  createElectronNotificationAdapter,
  createNotificationService,
} from './notificationService';
import { createUsageScanner } from './usageScanner';

const CURRENT_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 820;
const MINIMUM_WINDOW_WIDTH = 1024;
const MINIMUM_WINDOW_HEIGHT = 680;
const WINDOW_BACKGROUND_COLOR = '#f8f7f4';
const BUDGET_CONFIG_FILENAME = 'budget-config.json';

let mainWindow: BrowserWindow | null = null;
let budgetRuntime: BudgetRuntime | undefined;
let unregisterIpc: (() => void) | undefined;

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

const createWindow = (runtime: BudgetRuntime): BrowserWindow => {
  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: MINIMUM_WINDOW_WIDTH,
    minHeight: MINIMUM_WINDOW_HEIGHT,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    autoHideMenuBar: menuPolicy.autoHideMenuBar,
    webPreferences: {
      preload: join(CURRENT_DIRECTORY, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on('focus', () => {
    void runtime.refreshOnFocus().catch(() => undefined);
  });
  window.on('closed', () => {
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
  const scanner = createUsageScanner();
  const store = createBudgetStore(join(app.getPath('userData'), BUDGET_CONFIG_FILENAME));
  const notificationService = createNotificationService((policyId) => {
    focusMainWindow();
    budgetRuntime?.navigateToPolicy(policyId);
  }, createElectronNotificationAdapter(Notification));
  const runtime = createBudgetRuntime({
    store,
    scan: () => scanner.scan(),
    defaultPricing: DEFAULT_MODEL_PRICING,
    notify: notificationService.notify,
  });
  budgetRuntime = runtime;

  await runtime.initialize();
  unregisterIpc = registerUsageIpc({ runtime, getWindow: () => mainWindow });

  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  if (menuPolicy.removeApplicationMenu) {
    Menu.setApplicationMenu(null);
  }

  createWindow(runtime);
  runtime.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(runtime);
    }
  });
};

void app.whenReady().then(initializeApplication);

app.on('before-quit', () => {
  budgetRuntime?.stop();
  unregisterIpc?.();
  unregisterIpc = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
