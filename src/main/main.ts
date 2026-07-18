import { app, BrowserWindow, Menu } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import registerUsageIpc from './ipc';
import { getApplicationMenuPolicy } from './menuPolicy';

const CURRENT_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 820;
const MINIMUM_WINDOW_WIDTH = 1024;
const MINIMUM_WINDOW_HEIGHT = 680;
const WINDOW_BACKGROUND_COLOR = '#f8f7f4';

const createWindow = (): void => {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(CURRENT_DIRECTORY, '../renderer/index.html'));
  }
};

app.whenReady().then(() => {
  registerUsageIpc();

  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  if (menuPolicy.removeApplicationMenu) {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
