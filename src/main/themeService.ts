/**
 * @file 应用主题服务
 * @description 持有主题真值，协调偏好持久化、系统明暗变化和 Renderer 更新订阅。
 */

import {
  isThemePreference,
  resolveThemePreference,
  type ThemePreference,
  type ThemeSnapshot,
} from '../shared/theme';
import type { ThemeStore } from './themeStore';

interface NativeThemeAdapter {
  readonly shouldUseDarkColors: boolean;
  on: (event: 'updated', listener: () => void) => unknown;
  removeListener: (event: 'updated', listener: () => void) => unknown;
}

type ThemeListener = (snapshot: ThemeSnapshot) => void;

export interface ThemeSystemSource {
  shouldUseDarkColors: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

export interface ThemeService {
  getSnapshot: () => ThemeSnapshot;
  setPreference: (preference: unknown) => Promise<ThemeSnapshot>;
  subscribe: (listener: ThemeListener) => () => void;
  destroy: () => void;
}

interface ThemeServiceDependencies {
  initialPreference: ThemePreference;
  store: Pick<ThemeStore, 'save'>;
  systemSource: ThemeSystemSource;
}

export const createNativeThemeSystemSource = (
  nativeTheme: NativeThemeAdapter
): ThemeSystemSource => ({
  shouldUseDarkColors: () => nativeTheme.shouldUseDarkColors,
  subscribe: (listener) => {
    nativeTheme.on('updated', listener);
    return () => {
      nativeTheme.removeListener('updated', listener);
    };
  },
});

const createSnapshot = (
  preference: ThemePreference,
  systemSource: ThemeSystemSource
): ThemeSnapshot => ({
  preference,
  resolvedTheme: resolveThemePreference(preference, systemSource.shouldUseDarkColors()),
});

export const createThemeService = ({
  initialPreference,
  store,
  systemSource,
}: ThemeServiceDependencies): ThemeService => {
  let currentSnapshot = createSnapshot(initialPreference, systemSource);
  // 监听者由服务拥有，仅存活于应用生命周期；unsubscribe 或 destroy 会释放引用。
  const listeners = new Set<ThemeListener>();

  const publish = (): void => {
    [...listeners].forEach((listener) => listener(currentSnapshot));
  };

  const handleSystemUpdated = (): void => {
    if (currentSnapshot.preference !== 'system') {
      return;
    }

    const nextSnapshot = createSnapshot(currentSnapshot.preference, systemSource);
    if (nextSnapshot.resolvedTheme === currentSnapshot.resolvedTheme) {
      return;
    }

    currentSnapshot = nextSnapshot;
    publish();
  };

  const unsubscribeSystem = systemSource.subscribe(handleSystemUpdated);

  const getSnapshot = (): ThemeSnapshot => currentSnapshot;

  const setPreference = async (preference: unknown): Promise<ThemeSnapshot> => {
    if (!isThemePreference(preference)) {
      throw new TypeError('Unsupported theme preference.');
    }

    if (preference === currentSnapshot.preference) {
      return currentSnapshot;
    }

    await store.save(preference);
    currentSnapshot = createSnapshot(preference, systemSource);
    publish();
    return currentSnapshot;
  };

  const subscribe = (listener: ThemeListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const destroy = (): void => {
    unsubscribeSystem();
    listeners.clear();
  };

  return { getSnapshot, setPreference, subscribe, destroy };
};
