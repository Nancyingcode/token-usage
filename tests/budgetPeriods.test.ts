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
      modelTarget: { kind: 'all' },
    });
    const second = getBudgetBusinessKey({
      scope: 'project',
      projectPath: 'c:/repo/token-usage',
      period: 'week',
      modelTarget: { kind: 'all' },
    });

    expect(first).toBe(second);
  });

  it('includes normalized model targets in budget identity', () => {
    const base = { scope: 'global' as const, period: 'week' as const };

    expect(
      getBudgetBusinessKey({
        ...base,
        modelTarget: { kind: 'model', modelId: ' GPT-Test ' },
      })
    ).toBe(
      getBudgetBusinessKey({
        ...base,
        modelTarget: { kind: 'model', modelId: 'gpt-test' },
      })
    );
    expect(
      new Set([
        getBudgetBusinessKey({ ...base, modelTarget: { kind: 'all' } }),
        getBudgetBusinessKey({ ...base, modelTarget: { kind: 'unknown' } }),
        getBudgetBusinessKey({
          ...base,
          modelTarget: { kind: 'model', modelId: 'gpt-test' },
        }),
      ]).size
    ).toBe(3);
  });
});
