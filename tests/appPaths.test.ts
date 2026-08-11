import { win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { configureStableUserDataPath, resolveStableUserDataPath } from '../src/main/appPaths';

describe('application paths', () => {
  it('keeps persisted application data under the legacy directory name', () => {
    const appDataPath = String.raw`C:\Users\Example\AppData\Roaming`;

    expect(resolveStableUserDataPath(appDataPath, win32)).toBe(
      String.raw`C:\Users\Example\AppData\Roaming\codex-token-usage`
    );
  });

  it('does not derive persisted data from the branded product name or session paths', () => {
    const resolvedPath = resolveStableUserDataPath(String.raw`D:\Profile\AppData`, win32);

    expect(resolvedPath).toBe(String.raw`D:\Profile\AppData\codex-token-usage`);
    expect(resolvedPath).not.toContain('Codex Token Usage');
    expect(resolvedPath).not.toContain('.codex');
    expect(resolvedPath).not.toContain('sessions');
  });

  it('sets Electron userData from appData before stores request their paths', () => {
    const appDataPath = String.raw`C:\Users\Example\AppData\Roaming`;
    const getPath = vi.fn(() => appDataPath);
    const setPath = vi.fn();

    const userDataPath = configureStableUserDataPath({ getPath, setPath }, win32);

    expect(userDataPath).toBe(String.raw`C:\Users\Example\AppData\Roaming\codex-token-usage`);
    expect(getPath).toHaveBeenCalledWith('appData');
    expect(setPath).toHaveBeenCalledWith('userData', userDataPath);
  });
});
