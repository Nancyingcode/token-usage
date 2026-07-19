import type { BudgetPeriod, BudgetPolicyInput, NaturalPeriodRange } from './budgetTypes';

const DAYS_FROM_SUNDAY_TO_MONDAY = 6;
const DAYS_PER_WEEK = 7;
const FIRST_DAY_OF_MONTH = 1;

export const getNaturalPeriodRange = (
  period: BudgetPeriod,
  now: Date = new Date()
): NaturalPeriodRange => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const mondayOffset = (start.getDay() + DAYS_FROM_SUNDAY_TO_MONDAY) % DAYS_PER_WEEK;
    start.setDate(start.getDate() - mondayOffset);
  }

  if (period === 'month') {
    start.setDate(FIRST_DAY_OF_MONTH);
  }

  return { start, end: new Date(now) };
};

export const normalizeProjectPath = (projectPath: string): string =>
  projectPath.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase('en-US');

export const getBudgetBusinessKey = (input: BudgetPolicyInput): string => {
  const scopeKey =
    input.scope === 'global' ? 'global' : normalizeProjectPath(input.projectPath ?? '');

  return `${input.scope}:${scopeKey}:${input.period}`;
};
