import { describe, expect, it } from 'vitest';
import { createMainWindowOptions } from '../src/main/windowConfig';

describe('createMainWindowOptions', () => {
  it('creates a packaged frameless main window without weakening renderer isolation', () => {
    expect(
      createMainWindowOptions({
        preloadPath: 'C:\\app\\preload.mjs',
        autoHideMenuBar: true,
        useNativeFrame: false,
      })
    ).toMatchObject({
      width: 1280,
      height: 820,
      minWidth: 1024,
      minHeight: 680,
      backgroundColor: '#f8f7f4',
      autoHideMenuBar: true,
      frame: false,
      webPreferences: {
        preload: 'C:\\app\\preload.mjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
  });

  it('uses the native frame so the development menu bar is visible', () => {
    expect(
      createMainWindowOptions({
        preloadPath: 'C:\\app\\preload.mjs',
        autoHideMenuBar: false,
        useNativeFrame: true,
      })
    ).toMatchObject({
      autoHideMenuBar: false,
      frame: true,
    });
  });
});
