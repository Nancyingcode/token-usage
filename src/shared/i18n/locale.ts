/**
 * @file 国际化语言模型
 * @description 定义应用支持的语言，并将系统区域值解析为稳定的应用语言。
 */

export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

const CHINESE_LOCALE_PATTERN = /^zh(?:-|$)/i;

export const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  value === 'en' || value === 'zh-CN';

export const resolveSystemLocale = (value: string | undefined): SupportedLocale =>
  value && CHINESE_LOCALE_PATTERN.test(value.trim()) ? 'zh-CN' : DEFAULT_LOCALE;
