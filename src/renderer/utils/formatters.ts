import type { SupportedLocale } from '../../shared/i18n/locale';

const COMPACT_NUMBER_THRESHOLD = 1_000;
const PERCENT_BASE = 100;
const USD_MINIMUM_FRACTION_DIGITS = 2;
const USD_MAXIMUM_FRACTION_DIGITS = 4;

export const formatCompactNumber = (value: number, locale: SupportedLocale = 'en'): string =>
  new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: value >= COMPACT_NUMBER_THRESHOLD ? 1 : 0,
  }).format(value);

export const formatNumber = (value: number, locale: SupportedLocale = 'en'): string =>
  new Intl.NumberFormat(locale).format(value);

export const formatUsd = (value: number, locale: SupportedLocale = 'en'): string =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: USD_MINIMUM_FRACTION_DIGITS,
    maximumFractionDigits: USD_MAXIMUM_FRACTION_DIGITS,
  }).format(value);

export const formatPercent = (
  value: number,
  locale: SupportedLocale = 'en',
  fractionDigits = 0
): string =>
  new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / PERCENT_BASE);

export const formatShortDateTime = (
  value: string,
  locale: SupportedLocale = 'en',
  fallback = 'Unknown date'
): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
