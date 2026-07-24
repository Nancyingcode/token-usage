/**
 * @file 应用语言服务
 * @description 维护主进程语言真值，协调 i18next、持久化和语言变更订阅。
 */

import type { i18n } from 'i18next';
import { isSupportedLocale, type SupportedLocale } from '../shared/i18n/locale';
import type { LocaleStore } from './localeStore';

type LocaleListener = (locale: SupportedLocale) => void;

export interface LocaleService {
  getLocale: () => SupportedLocale;
  setLocale: (locale: unknown) => Promise<SupportedLocale>;
  subscribe: (listener: LocaleListener) => () => void;
}

interface LocaleServiceDependencies {
  initialLocale: SupportedLocale;
  i18n: Pick<i18n, 'changeLanguage'>;
  store: Pick<LocaleStore, 'save'>;
}

export const createLocaleService = ({
  initialLocale,
  i18n,
  store,
}: LocaleServiceDependencies): LocaleService => {
  let currentLocale = initialLocale;
  const listeners = new Set<LocaleListener>();

  const getLocale = (): SupportedLocale => currentLocale;

  const setLocale = async (locale: unknown): Promise<SupportedLocale> => {
    if (!isSupportedLocale(locale)) {
      throw new TypeError('Unsupported locale.');
    }

    if (locale === currentLocale) {
      return currentLocale;
    }

    const previousLocale = currentLocale;
    await i18n.changeLanguage(locale);

    try {
      await store.save(locale);
    } catch (error) {
      await i18n.changeLanguage(previousLocale);
      throw error;
    }

    currentLocale = locale;
    [...listeners].forEach((listener) => listener(locale));
    return currentLocale;
  };

  const subscribe = (listener: LocaleListener): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getLocale, setLocale, subscribe };
};
