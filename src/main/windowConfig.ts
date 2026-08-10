import type { BrowserWindowConstructorOptions } from 'electron';

const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 820;
const MINIMUM_WINDOW_WIDTH = 1024;
const MINIMUM_WINDOW_HEIGHT = 680;
const WINDOW_BACKGROUND_COLOR = '#f8f7f4';

interface MainWindowOptionsInput {
  preloadPath: string;
  autoHideMenuBar: boolean;
  useNativeFrame: boolean;
}

export const createMainWindowOptions = ({
  preloadPath,
  autoHideMenuBar,
  useNativeFrame,
}: MainWindowOptionsInput): BrowserWindowConstructorOptions => ({
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
  minWidth: MINIMUM_WINDOW_WIDTH,
  minHeight: MINIMUM_WINDOW_HEIGHT,
  backgroundColor: WINDOW_BACKGROUND_COLOR,
  autoHideMenuBar,
  frame: useNativeFrame,
  webPreferences: {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  },
});
