import { describe, expect, it } from 'vitest';
import { createMainWindowOptions } from '../src/main/windowConfig';

describe('createMainWindowOptions', () => {
  it('creates a packaged frameless main window without weakening renderer isolation', () => {
    expect(
      createMainWindowOptions({
        preloadPath: 'C:\\app\\preload.mjs',
        autoHideMenuBar: true,
        useNativeFrame: false,
        resolvedTheme: 'mint-light',
      })
    ).toMatchObject({
      width: 1280,
      height: 820,
      minWidth: 1024,
      minHeight: 680,
      backgroundColor: '#f3f7f6',
      autoHideMenuBar: true,
      frame: false,
      webPreferences: {
        preload: 'C:\\app\\preload.mjs',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        additionalArguments: ['--codex-resolved-theme=mint-light'],
      },
    });
  });

  it('uses the native frame so the development menu bar is visible', () => {
    expect(
      createMainWindowOptions({
        preloadPath: 'C:\\app\\preload.mjs',
        autoHideMenuBar: false,
        useNativeFrame: true,
        resolvedTheme: 'emerald-dark',
      })
    ).toMatchObject({
      autoHideMenuBar: false,
      frame: true,
      backgroundColor: '#0d1714',
      webPreferences: {
        additionalArguments: ['--codex-resolved-theme=emerald-dark'],
      },
    });
  });
});
