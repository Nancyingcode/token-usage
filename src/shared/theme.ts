/**
 * @file 主题共享模型
 * @description 定义稳定的主题偏好、解析规则和主窗口首帧所需的外观元数据。
 */

export const THEME_IDS = ['mint-light', 'emerald-dark', 'ocean-dark', 'sand-light'] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_PREFERENCES = ['system', ...THEME_IDS] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ThemeColorScheme = 'light' | 'dark';

export interface ThemeSnapshot {
  preference: ThemePreference;
  resolvedTheme: ThemeId;
}

interface ThemeMetadata {
  colorScheme: ThemeColorScheme;
  windowBackgroundColor: `#${string}`;
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';
export const DEFAULT_LIGHT_THEME: ThemeId = 'mint-light';
export const DEFAULT_DARK_THEME: ThemeId = 'emerald-dark';
export const RESOLVED_THEME_ARGUMENT_PREFIX = '--codex-resolved-theme=';

const THEME_METADATA: Readonly<Record<ThemeId, ThemeMetadata>> = {
  'mint-light': {
    colorScheme: 'light',
    windowBackgroundColor: '#f3f7f6',
  },
  'emerald-dark': {
    colorScheme: 'dark',
    windowBackgroundColor: '#0d1714',
  },
  'ocean-dark': {
    colorScheme: 'dark',
    windowBackgroundColor: '#0b1420',
  },
  'sand-light': {
    colorScheme: 'light',
    windowBackgroundColor: '#f6f0e5',
  },
};

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && THEME_IDS.some((themeId) => themeId === value);

export const isThemePreference = (value: unknown): value is ThemePreference =>
  value === DEFAULT_THEME_PREFERENCE || isThemeId(value);

export const resolveThemePreference = (
  preference: ThemePreference,
  shouldUseDarkColors: boolean
): ThemeId => {
  if (preference !== DEFAULT_THEME_PREFERENCE) {
    return preference;
  }

  return shouldUseDarkColors ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
};

export const getThemeColorScheme = (themeId: ThemeId): ThemeColorScheme =>
  THEME_METADATA[themeId].colorScheme;

export const getThemeWindowBackgroundColor = (themeId: ThemeId): `#${string}` =>
  THEME_METADATA[themeId].windowBackgroundColor;
