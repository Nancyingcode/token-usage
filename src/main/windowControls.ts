/**
 * @file 窗口控制 IPC
 * @description 将最小化、最大化和关闭操作限制到发起请求的有效 BrowserWindow。
 */
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  WINDOW_CLOSE_CHANNEL,
  WINDOW_GET_STATE_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_STATE_CHANGED_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
} from '../shared/ipcChannels';
import type { WindowState } from '../shared/windowTypes';

const WINDOW_CONTROL_CHANNELS = [
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
  WINDOW_CLOSE_CHANNEL,
  WINDOW_GET_STATE_CHANNEL,
] as const;

const EMPTY_WINDOW_STATE: WindowState = { isMaximized: false };

const getRequestWindow = (event: IpcMainInvokeEvent): BrowserWindow | null => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window && !window.isDestroyed() ? window : null;
};

const getWindowState = (window: BrowserWindow): WindowState => ({
  isMaximized: window.isMaximized(),
});

export const registerWindowControlIpc = (): (() => void) => {
  ipcMain.handle(WINDOW_MINIMIZE_CHANNEL, (event) => {
    getRequestWindow(event)?.minimize();
  });
  ipcMain.handle(WINDOW_TOGGLE_MAXIMIZE_CHANNEL, (event): WindowState => {
    const window = getRequestWindow(event);

    if (!window) {
      return EMPTY_WINDOW_STATE;
    }

    const shouldMaximize = !window.isMaximized();
    if (shouldMaximize) {
      window.maximize();
    } else {
      window.unmaximize();
    }

    return { isMaximized: shouldMaximize };
  });
  ipcMain.handle(WINDOW_CLOSE_CHANNEL, (event) => {
    getRequestWindow(event)?.close();
  });
  ipcMain.handle(WINDOW_GET_STATE_CHANNEL, (event): WindowState => {
    const window = getRequestWindow(event);
    return window ? getWindowState(window) : EMPTY_WINDOW_STATE;
  });

  return () => WINDOW_CONTROL_CHANNELS.forEach((channel) => ipcMain.removeHandler(channel));
};

export const registerWindowStateEvents = (window: BrowserWindow): (() => void) => {
  const sendState = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(WINDOW_STATE_CHANGED_CHANNEL, getWindowState(window));
    }
  };

  window.on('maximize', sendState);
  window.on('unmaximize', sendState);

  return () => {
    window.removeListener('maximize', sendState);
    window.removeListener('unmaximize', sendState);
  };
};
