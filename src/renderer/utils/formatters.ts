const COMPACT_NUMBER_THRESHOLD = 1_000;
const DATE_FALLBACK = 'Unknown date';
const NUMBER_LOCALE = 'en';
const USD_MINIMUM_FRACTION_DIGITS = 2;
const USD_MAXIMUM_FRACTION_DIGITS = 4;

export const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat(NUMBER_LOCALE, {
    notation: 'compact',
    maximumFractionDigits: value >= COMPACT_NUMBER_THRESHOLD ? 1 : 0,
  }).format(value);

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat(NUMBER_LOCALE).format(value);

export const formatUsd = (value: number): string =>
  new Intl.NumberFormat(NUMBER_LOCALE, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: USD_MINIMUM_FRACTION_DIGITS,
    maximumFractionDigits: USD_MAXIMUM_FRACTION_DIGITS,
  }).format(value);

export const formatPercent = (value: number): string => `${Math.round(value)}%`;

export const formatShortDateTime = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return DATE_FALLBACK;
  }

  return new Intl.DateTimeFormat(NUMBER_LOCALE, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
