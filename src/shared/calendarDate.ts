/**
 * @file 自然日日期键
 * @description 使用 UTC 表示自然日，避免日期校验和日数计算受本地夏令时影响。
 */

const CALENDAR_DATE_PATTERN = /^(?!0000)\d{4}-\d{2}-\d{2}$/;
const YEAR_DIGITS = 4;
const DATE_PART_DIGITS = 2;
export const MILLISECONDS_PER_DAY = 86_400_000;

export const formatCalendarDateKey = (date: Date): string => date.toISOString().split('T')[0];

export const parseCalendarDate = (value: string): Date | undefined => {
  if (!CALENDAR_DATE_PATTERN.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  const isValid = Number.isFinite(date.getTime()) && formatCalendarDateKey(date) === value;
  return isValid ? date : undefined;
};

export const formatLocalDateKey = (date: Date): string => {
  const year = String(date.getFullYear()).padStart(YEAR_DIGITS, '0');
  const month = String(date.getMonth() + 1).padStart(DATE_PART_DIGITS, '0');
  const day = String(date.getDate()).padStart(DATE_PART_DIGITS, '0');
  return `${year}-${month}-${day}`;
};
