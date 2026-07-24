import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { createI18nOptions, I18N_NAMESPACES, I18N_RESOURCES } from '../src/shared/i18n/resources';
import { isSupportedLocale, resolveSystemLocale } from '../src/shared/i18n/locale';

const collectLeafKeys = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof child === 'string' ? [path] : collectLeafKeys(child as object, path);
  });

describe('shared i18n', () => {
  it.each(['zh', 'zh-CN', 'zh-HK', 'ZH-tw'])('maps %s to Simplified Chinese', (locale) =>
    expect(resolveSystemLocale(locale)).toBe('zh-CN')
  );

  it.each([undefined, '', 'en', 'en-US', 'fr-FR', 'zhbad', 'not a locale'])(
    'maps %s to English',
    (locale) => expect(resolveSystemLocale(locale)).toBe('en')
  );

  it('accepts only supported locale values', () => {
    expect(isSupportedLocale('en')).toBe(true);
    expect(isSupportedLocale('zh-CN')).toBe(true);
    expect(isSupportedLocale('zh-HK')).toBe(false);
  });

  it('keeps namespace and leaf-key parity between locales', () => {
    expect(Object.keys(I18N_RESOURCES.en)).toEqual([...I18N_NAMESPACES]);
    expect(Object.keys(I18N_RESOURCES['zh-CN'])).toEqual([...I18N_NAMESPACES]);

    I18N_NAMESPACES.forEach((namespace) => {
      expect(collectLeafKeys(I18N_RESOURCES['zh-CN'][namespace]).sort()).toEqual(
        collectLeafKeys(I18N_RESOURCES.en[namespace]).sort()
      );
    });
  });

  it('uses interpolation, English plurals, Chinese copy, and English fallback', async () => {
    const instance = i18next.createInstance();
    await instance.init(createI18nOptions('en'));

    expect(instance.t('common:item.sessions', { count: 1 })).toBe('1 session');
    expect(instance.t('common:item.sessions', { count: 2 })).toBe('2 sessions');

    await instance.changeLanguage('zh-CN');
    expect(instance.t('common:item.sessions', { count: 2 })).toBe('2 个会话');
    expect(instance.t('common:navigation.overview')).toBe('概览');
  });
});
