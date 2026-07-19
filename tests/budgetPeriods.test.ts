import { describe, expect, it } from 'vitest';
import {
  getBudgetBusinessKey,
  getNaturalPeriodRange,
  normalizeProjectPath,
} from '../src/shared/budgetPeriods';

describe('budget periods', () => {
  it('starts the natural week on Monday in local time', () => {
    const now = new Date(2026, 6, 22, 15, 30);
    const range = getNaturalPeriodRange('week', now);

    expect(range.start).toEqual(new Date(2026, 6, 20, 0, 0, 0, 0));
    expect(range.end).toEqual(now);
  });

  it('starts natural days and months in local time', () => {
    const now = new Date(2026, 6, 22, 15, 30);

    expect(getNaturalPeriodRange('day', now).start).toEqual(new Date(2026, 6, 22, 0, 0, 0, 0));
    expect(getNaturalPeriodRange('month', now).start).toEqual(new Date(2026, 6, 1, 0, 0, 0, 0));
  });

  it('normalizes Windows project paths for identity', () => {
    expect(normalizeProjectPath('C:\\Repo\\Token-Usage\\')).toBe('c:/repo/token-usage');
  });

  it('builds the same project business key for equivalent paths', () => {
    const first = getBudgetBusinessKey({
      scope: 'project',
      projectPath: 'C:\\Repo\\Token-Usage\\',
      period: 'week',
    });
    const second = getBudgetBusinessKey({
      scope: 'project',
      projectPath: 'c:/repo/token-usage',
      period: 'week',
    });

    expect(first).toBe(second);
  });
});
