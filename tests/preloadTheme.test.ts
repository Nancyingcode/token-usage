// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_GET_CHANNEL,
  THEME_SET_CHANNEL,
  THEME_UPDATED_CHANNEL,
} from '../src/shared/ipcChannels';
import type { ThemePreference, ThemeSnapshot } from '../src/shared/theme';

type IpcListener = (event: unknown, payload: unknown) => void;

interface ExposedThemeApi {
  get: () => Promise<ThemeSnapshot>;
  set: (preference: ThemePreference) => Promise<ThemeSnapshot>;
  onUpdated: (listener: (snapshot: ThemeSnapshot) => void) => () => void;
}

interface ExposedApi {
  theme: ExposedThemeApi;
  locale: { initial: 'en' | 'zh-CN' };
}

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}));

const originalArgv = [...process.argv];

const loadPreload = async (
  ...argumentsToAppend: Array<string | undefined>
): Promise<ExposedApi> => {
  process.argv = [
    ...originalArgv,
    ...argumentsToAppend.filter((value): value is string => value !== undefined),
  ];
  vi.resetModules();
  await import('../src/preload/preload');
  const call = electronMocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'codexUsage');

  if (!call) {
    throw new Error('Preload API was not exposed.');
  }

  return call[1] as ExposedApi;
};

describe('preload theme bridge', () => {
  beforeEach(() => {
    electronMocks.exposeInMainWorld.mockClear();
    electronMocks.invoke.mockReset();
    electronMocks.on.mockClear();
    electronMocks.removeListener.mockClear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    process.argv = [...originalArgv];
  });

  it('applies a valid initial theme before exposing the IPC API', async () => {
    const api = await loadPreload(
      '--codex-resolved-theme=ocean-dark',
      '--codex-initial-locale=zh-CN'
    );

    expect(document.documentElement.dataset.theme).toBe('ocean-dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(api.locale.initial).toBe('zh-CN');

    electronMocks.invoke.mockResolvedValueOnce({
      preference: 'system',
      resolvedTheme: 'ocean-dark',
    });
    await api.theme.get();
    expect(electronMocks.invoke).toHaveBeenCalledWith(THEME_GET_CHANNEL);

    electronMocks.invoke.mockResolvedValueOnce({
      preference: 'sand-light',
      resolvedTheme: 'sand-light',
    });
    await api.theme.set('sand-light');
    expect(electronMocks.invoke).toHaveBeenCalledWith(THEME_SET_CHANNEL, 'sand-light');
  });

  it('exposes the IPC API when the preload runs before the document element exists', async () => {
    const documentElement = document.documentElement;
    const documentElementSpy = vi
      .spyOn(document, 'documentElement', 'get')
      // Electron can run preload before the DOM element exists despite the DOM library's type.
      .mockReturnValueOnce(null as unknown as HTMLElement)
      .mockReturnValue(documentElement);

    await expect(loadPreload('--codex-resolved-theme=ocean-dark')).resolves.toBeDefined();
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      'codexUsage',
      expect.objectContaining({ theme: expect.any(Object) })
    );

    document.dispatchEvent(new Event('DOMContentLoaded'));
    expect(documentElement.dataset.theme).toBe('ocean-dark');
    expect(documentElement.style.colorScheme).toBe('dark');

    documentElementSpy.mockRestore();
  });

  it.each([undefined, '--codex-resolved-theme=unknown'])(
    'falls back to the default light theme for an invalid argument',
    async (themeArgument) => {
      await loadPreload(themeArgument);

      expect(document.documentElement.dataset.theme).toBe('mint-light');
      expect(document.documentElement.style.colorScheme).toBe('light');
    }
  );

  it.each([undefined, '--codex-initial-locale=unknown'])(
    'falls back to English for an invalid initial locale argument',
    async (localeArgument) => {
      const api = await loadPreload('--codex-resolved-theme=mint-light', localeArgument);

      expect(api.locale.initial).toBe('en');
    }
  );

  it('subscribes to theme updates and removes the exact listener', async () => {
    const api = await loadPreload('--codex-resolved-theme=emerald-dark');
    const listener = vi.fn();
    const unsubscribe = api.theme.onUpdated(listener);
    const subscription = electronMocks.on.mock.calls.find(
      ([channel]) => channel === THEME_UPDATED_CHANNEL
    );
    const handler = subscription?.[1] as IpcListener | undefined;
    const snapshot: ThemeSnapshot = {
      preference: 'system',
      resolvedTheme: 'emerald-dark',
    };

    handler?.({}, snapshot);
    expect(listener).toHaveBeenCalledWith(snapshot);

    unsubscribe();
    expect(electronMocks.removeListener).toHaveBeenCalledWith(THEME_UPDATED_CHANNEL, handler);
  });
});
