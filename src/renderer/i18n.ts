/**
 * @file 渲染进程国际化实例
 * @description 创建启用 React 绑定的独立 i18next 实例，并在首选语言初始化失败时回退到英语。
 */

import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from '@/shared/i18n/locale';
import { createI18nOptions } from '@/shared/i18n/resources';

export type RendererI18nInstanceFactory = () => i18n;

const DEFAULT_INSTANCE_FACTORY: RendererI18nInstanceFactory = () => i18next.createInstance();

const initializeInstance = async (
  locale: SupportedLocale,
  createInstance: RendererI18nInstanceFactory
): Promise<i18n> => {
  const instance = createInstance();
  instance.use(initReactI18next);
  await instance.init(createI18nOptions(locale));
  return instance;
};

export const createRendererI18n = async (
  locale: SupportedLocale,
  createInstance: RendererI18nInstanceFactory = DEFAULT_INSTANCE_FACTORY
): Promise<i18n> => {
  try {
    return await initializeInstance(locale, createInstance);
  } catch {
    return initializeInstance(DEFAULT_LOCALE, createInstance);
  }
};

export const resolveRendererLocale = (language: string | undefined): SupportedLocale =>
  isSupportedLocale(language) ? language : DEFAULT_LOCALE;
