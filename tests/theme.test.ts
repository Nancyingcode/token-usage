import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_PREFERENCE,
  getThemeColorScheme,
  getThemeWindowBackgroundColor,
  isThemeId,
  isThemePreference,
  resolveThemePreference,
  THEME_IDS,
  THEME_PREFERENCES,
} from '../src/shared/theme';

describe('theme model', () => {
  it('recognizes the supported preferences and concrete themes', () => {
    expect(THEME_IDS).toEqual(['mint-light', 'emerald-dark', 'ocean-dark', 'sand-light']);
    expect(THEME_PREFERENCES).toEqual(['system', ...THEME_IDS]);
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');

    THEME_IDS.forEach((themeId) => expect(isThemeId(themeId)).toBe(true));
    THEME_PREFERENCES.forEach((preference) => expect(isThemePreference(preference)).toBe(true));
    expect(isThemeId('system')).toBe(false);
    expect(isThemePreference('unknown')).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });

  it('resolves the system preference without changing explicit themes', () => {
    expect(resolveThemePreference('system', false)).toBe('mint-light');
    expect(resolveThemePreference('system', true)).toBe('emerald-dark');
    expect(resolveThemePreference('ocean-dark', false)).toBe('ocean-dark');
    expect(resolveThemePreference('sand-light', true)).toBe('sand-light');
  });

  it('provides stable color scheme and window background metadata', () => {
    expect(getThemeColorScheme('mint-light')).toBe('light');
    expect(getThemeColorScheme('sand-light')).toBe('light');
    expect(getThemeColorScheme('emerald-dark')).toBe('dark');
    expect(getThemeColorScheme('ocean-dark')).toBe('dark');

    THEME_IDS.forEach((themeId) => {
      expect(getThemeWindowBackgroundColor(themeId)).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});
