import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WINDOW_CLOSE_CHANNEL,
  WINDOW_GET_STATE_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_STATE_CHANGED_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
} from '../src/shared/ipcChannels';

type IpcHandler = (event: { sender: unknown }) => unknown;

const electronMocks = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  handle: vi.fn((channel: string, handler: IpcHandler) => {
    electronMocks.handlers.set(channel, handler);
  }),
  removeHandler: vi.fn(),
  fromWebContents: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: electronMocks.fromWebContents,
  },
  ipcMain: {
    handle: electronMocks.handle,
    removeHandler: electronMocks.removeHandler,
  },
}));

import { registerWindowControlIpc, registerWindowStateEvents } from '../src/main/windowControls';

describe('window controls', () => {
  beforeEach(() => {
    electronMocks.handlers.clear();
    electronMocks.handle.mockClear();
    electronMocks.removeHandler.mockClear();
    electronMocks.fromWebContents.mockReset();
  });

  it('controls only the window associated with the requesting renderer', () => {
    const window = createWindowStub();
    electronMocks.fromWebContents.mockReturnValue(window);
    const unregister = registerWindowControlIpc();
    const event = { sender: {} };

    electronMocks.handlers.get(WINDOW_MINIMIZE_CHANNEL)?.(event);
    expect(window.minimize).toHaveBeenCalledOnce();

    window.isMaximized.mockReturnValueOnce(false);
    expect(electronMocks.handlers.get(WINDOW_TOGGLE_MAXIMIZE_CHANNEL)?.(event)).toEqual({
      isMaximized: true,
    });
    expect(window.maximize).toHaveBeenCalledOnce();

    window.isMaximized.mockReturnValueOnce(true);
    expect(electronMocks.handlers.get(WINDOW_TOGGLE_MAXIMIZE_CHANNEL)?.(event)).toEqual({
      isMaximized: false,
    });
    expect(window.unmaximize).toHaveBeenCalledOnce();

    window.isMaximized.mockReturnValueOnce(true);
    expect(electronMocks.handlers.get(WINDOW_GET_STATE_CHANNEL)?.(event)).toEqual({
      isMaximized: true,
    });

    electronMocks.handlers.get(WINDOW_CLOSE_CHANNEL)?.(event);
    expect(window.close).toHaveBeenCalledOnce();

    unregister();
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(WINDOW_MINIMIZE_CHANNEL);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(WINDOW_TOGGLE_MAXIMIZE_CHANNEL);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(WINDOW_GET_STATE_CHANNEL);
    expect(electronMocks.removeHandler).toHaveBeenCalledWith(WINDOW_CLOSE_CHANNEL);
  });

  it('broadcasts maximize state changes and removes window listeners', () => {
    const window = createWindowStub();
    const listeners = new Map<string, () => void>();
    window.on.mockImplementation((event: string, listener: () => void) => {
      listeners.set(event, listener);
      return window;
    });
    const unregister = registerWindowStateEvents(window as unknown as Electron.BrowserWindow);

    window.isMaximized.mockReturnValueOnce(true);
    listeners.get('maximize')?.();
    expect(window.webContents.send).toHaveBeenLastCalledWith(WINDOW_STATE_CHANGED_CHANNEL, {
      isMaximized: true,
    });

    window.isMaximized.mockReturnValueOnce(false);
    listeners.get('unmaximize')?.();
    expect(window.webContents.send).toHaveBeenLastCalledWith(WINDOW_STATE_CHANGED_CHANNEL, {
      isMaximized: false,
    });

    unregister();
    expect(window.removeListener).toHaveBeenCalledWith('maximize', listeners.get('maximize'));
    expect(window.removeListener).toHaveBeenCalledWith('unmaximize', listeners.get('unmaximize'));
  });
});

const createWindowStub = () => ({
  minimize: vi.fn(),
  maximize: vi.fn(),
  unmaximize: vi.fn(),
  close: vi.fn(),
  isMaximized: vi.fn(() => false),
  isDestroyed: vi.fn(() => false),
  on: vi.fn(),
  removeListener: vi.fn(),
  webContents: {
    send: vi.fn(),
  },
});
