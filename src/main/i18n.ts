/**
 * @file 主进程国际化实例
 * @description 为通知等主进程界面能力创建独立 i18next 实例，并在首选语言初始化失败时回退到英语。
 */

import i18next, { type i18n } from 'i18next';
import { DEFAULT_LOCALE, type SupportedLocale } from '../shared/i18n/locale';
import { createI18nOptions } from '../shared/i18n/resources';

export type I18nInstanceFactory = () => i18n;

const DEFAULT_INSTANCE_FACTORY: I18nInstanceFactory = () => i18next.createInstance();

const initializeInstance = async (
  locale: SupportedLocale,
  createInstance: I18nInstanceFactory
): Promise<i18n> => {
  const instance = createInstance();
  await instance.init(createI18nOptions(locale));
  return instance;
};

export const createMainI18n = async (
  locale: SupportedLocale,
  createInstance: I18nInstanceFactory = DEFAULT_INSTANCE_FACTORY
): Promise<i18n> => {
  try {
    return await initializeInstance(locale, createInstance);
  } catch {
    return initializeInstance(DEFAULT_LOCALE, createInstance);
  }
};
