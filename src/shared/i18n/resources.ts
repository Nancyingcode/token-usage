/**
 * @file 国际化资源配置
 * @description 汇总静态翻译资源，并为主进程和渲染进程提供一致的 i18next 配置。
 */

import type { InitOptions } from 'i18next';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type SupportedLocale } from './locale';
import { en } from './locales/en';
import { zhCN } from './locales/zhCN';

export const DEFAULT_NAMESPACE = 'common';
export const I18N_NAMESPACES = [
  'common',
  'notifications',
  'settings',
  'warnings',
  'analytics',
  'budgets',
] as const;

export const I18N_RESOURCES = {
  en,
  'zh-CN': zhCN,
} as const;

export const createI18nOptions = (locale: SupportedLocale): InitOptions => ({
  resources: I18N_RESOURCES,
  lng: locale,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: [...SUPPORTED_LOCALES],
  load: 'currentOnly',
  ns: [...I18N_NAMESPACES],
  defaultNS: DEFAULT_NAMESPACE,
  returnNull: false,
  interpolation: {
    escapeValue: false,
  },
});
