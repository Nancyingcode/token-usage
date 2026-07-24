import i18next, { type i18n } from 'i18next';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import type { SupportedLocale } from '../../src/shared/i18n/locale';
import { createI18nOptions } from '../../src/shared/i18n/resources';

export const createTestI18n = (locale: SupportedLocale): i18n => {
  const instance = i18next.createInstance();
  instance.use(initReactI18next);
  void instance.init({
    ...createI18nOptions(locale),
    initAsync: false,
  });
  return instance;
};

export const renderWithI18n = (node: React.ReactNode, locale: SupportedLocale = 'en'): string => {
  const i18n = createTestI18n(locale);
  return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
};
