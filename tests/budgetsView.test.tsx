import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import BudgetsView from '../src/renderer/components/BudgetsView';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';
import type { BudgetSnapshot } from '../src/shared/budgetTypes';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('BudgetsView', () => {
  it('renders actual percentages, incomplete cost, summaries, and alerts', () => {
    const markup = renderWithI18n(<BudgetsView snapshot={SNAPSHOT} actions={ACTIONS} />);

    expect(markup).toContain('112%');
    expect(markup).toContain('Pricing incomplete');
    expect(markup).toContain('Unpriced models');
    expect(markup).toContain('Token budget reached 100%');
    expect(markup).toContain('Global budgets');
    expect(markup).toContain('Project budgets');
    expect(markup).toContain('id="budget-tab-overview"');
    expect(markup).toContain('aria-controls="budget-panel-overview"');
    expect(markup).toContain('id="budget-panel-overview"');
    expect(markup).toContain('aria-labelledby="budget-tab-overview"');
  });

  it('renders budget alerts and rows in Chinese', () => {
    const markup = renderWithI18n(<BudgetsView snapshot={SNAPSHOT} actions={ACTIONS} />, 'zh-CN');

    expect(markup).toContain('预算中心');
    expect(markup).toContain('Token 预算已达到 100%');
    expect(markup).toContain('计价不完整');
    expect(markup).toContain('全局预算');
    expect(markup).toContain('项目预算');
  });
});

const SNAPSHOT: BudgetSnapshot = {
  generatedAt: '2026-07-20T12:00:00.000Z',
  dataState: 'stale',
  staleReason: 'disk unavailable',
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  statuses: [
    {
      policy: {
        id: 'global-day',
        scope: 'global',
        period: 'day',
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
  alerts: [
    {
      id: 'global-day:day:token:100:period',
      policyId: 'global-day',
      period: 'day',
      periodStart: '2026-07-20T00:00:00.000Z',
      metric: 'token',
      thresholdPercent: 100,
      severity: 'over',
    },
  ],
  summary: { warningCount: 1, overCount: 1, unpricedModelCount: 1 },
  pricing: [],
  unpricedModels: [{ modelId: 'future-model', totalTokens: 250 }],
};

const ACTIONS: BudgetActions = {
  savePolicy: vi.fn(async () => SNAPSHOT),
  deletePolicy: vi.fn(async () => SNAPSHOT),
  updateThresholds: vi.fn(async () => SNAPSHOT),
  savePricingOverride: vi.fn(async () => SNAPSHOT),
  resetPricingOverride: vi.fn(async () => SNAPSHOT),
};
