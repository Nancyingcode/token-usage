import { describe, expect, it } from 'vitest';
import { buildBudgetViewModel } from '../src/renderer/utils/budgetViewModel';
import type { BudgetSnapshot } from '../src/shared/budgetTypes';

describe('budget view model', () => {
  it('groups global and project rows and preserves summary counts', () => {
    const model = buildBudgetViewModel(SNAPSHOT, { scope: 'all', period: 'all' });

    expect(model.summary).toEqual({ warningCount: 1, overCount: 1, unpricedModelCount: 1 });
    expect(model.groups.map((group) => group.key)).toEqual(['global', 'project']);
  });

  it('filters by scope and period before grouping', () => {
    const model = buildBudgetViewModel(SNAPSHOT, { scope: 'project', period: 'week' });

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].statuses.map(({ policy }) => policy.id)).toEqual(['project-week']);
  });
});

const SNAPSHOT: BudgetSnapshot = {
  generatedAt: '2026-07-20T12:00:00.000Z',
  dataState: 'fresh',
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  statuses: [
    {
      policy: {
        id: 'global-day',
        scope: 'global',
        period: 'day',
        modelTarget: { kind: 'all' },
        tokenLimit: 100,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
      periodStart: '2026-07-20T00:00:00.000Z',
      periodEnd: '2026-07-20T12:00:00.000Z',
      token: { used: 112, limit: 100, percent: 112, severity: 'over' },
      unpricedTokens: 0,
      unpricedModelIds: [],
    },
    {
      policy: {
        id: 'project-week',
        scope: 'project',
        projectPath: 'C:\\repo',
        period: 'week',
        modelTarget: { kind: 'all' },
        costLimitUsd: 10,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
      periodStart: '2026-07-20T00:00:00.000Z',
      periodEnd: '2026-07-20T12:00:00.000Z',
      cost: { used: 8.5, limit: 10, percent: 85, severity: 'warning', incomplete: true },
      unpricedTokens: 250,
      unpricedModelIds: ['future-model'],
    },
  ],
  alerts: [],
  summary: { warningCount: 1, overCount: 1, unpricedModelCount: 1 },
  pricing: [],
  unpricedModels: [{ modelId: 'future-model', totalTokens: 250 }],
};
