import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import BudgetsView, {
  type BudgetContentModel,
  type BudgetTab,
} from '../src/renderer/components/BudgetsView';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';
import type { BudgetSnapshot } from '../src/shared/budgetTypes';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('BudgetsView', () => {
  const renderBudgetView = (
    activeTab: BudgetTab,
    locale: 'en' | 'zh-CN' = 'en',
    model: BudgetContentModel = { kind: 'ready', snapshot: SNAPSHOT }
  ): string =>
    renderWithI18n(
      <BudgetsView
        model={model}
        actions={ACTIONS}
        activeTab={activeTab}
        onActiveTabChange={vi.fn()}
      />,
      locale
    );

  it('renders actual percentages, incomplete cost, summaries, and alerts', () => {
    const markup = renderBudgetView('overview');

    expect(markup).toContain('Configured budgets');
    expect(markup).toContain('>3<');
    expect(markup).toContain('Unpriced models');
    expect(markup).toContain('Token budget reached 100%');
    expect(markup).toContain('id="budget-tab-overview"');
    expect(markup).toContain('aria-controls="budget-panel-overview"');
    expect(markup).toContain('id="budget-panel-overview"');
    expect(markup).toContain('aria-labelledby="budget-tab-overview"');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="accessible-tabs"');
    expect(markup).toContain('summary-card');
    expect(markup).toContain('future-model');
    expect(markup).not.toContain('Global budgets');
    expect(markup).not.toContain('budget-filter-bar');
  });

  it('renders policy filters and rows only in the policies tab', () => {
    const markup = renderBudgetView('policies');

    expect(markup).toContain('112%');
    expect(markup).toContain('Pricing incomplete');
    expect(markup).toContain('Includes 120 tokens priced by the unknown-model assumption');
    expect(markup).toContain('Global budgets');
    expect(markup).toContain('Project budgets');
    expect(markup).toContain('budget-status-label');
    expect(markup).toContain('On track');
    expect(markup).toContain('>Model<');
    expect(markup).toContain('All models');
    expect(markup).toContain('Unknown model');
    expect(markup).toContain('data-motion-key=');
    expect(markup).toContain('motion-list-item');
    expect(markup).toContain('--motion-delay:0ms');
    expect(markup).not.toContain('Configured budgets');
  });

  it('renders budget alerts and rows in Chinese', () => {
    const overviewMarkup = renderBudgetView('overview', 'zh-CN');
    const policiesMarkup = renderBudgetView('policies', 'zh-CN');

    expect(overviewMarkup).toContain('预算中心');
    expect(overviewMarkup).toContain('已配置预算');
    expect(overviewMarkup).toContain('Token 预算已达到 100%');
    expect(policiesMarkup).toContain('计价不完整');
    expect(policiesMarkup).toContain('包含 120 个按未知模型假设计价的 Token');
    expect(policiesMarkup).toContain('全局预算');
    expect(policiesMarkup).toContain('项目预算');
    expect(policiesMarkup).toContain('模型');
    expect(policiesMarkup).toContain('所有模型');
    expect(policiesMarkup).toContain('未知模型');
  });

  it('keeps the workspace header visible while loading or unavailable', () => {
    const loadingMarkup = renderBudgetView('overview', 'en', { kind: 'loading' });
    const errorMarkup = renderBudgetView('overview', 'en', {
      kind: 'error',
      message: 'budget unavailable',
    });

    expect(loadingMarkup).toContain('Budget center');
    expect(loadingMarkup).toContain('Loading budgets');
    expect(loadingMarkup).toContain('class="loading-skeleton"');
    expect(errorMarkup).toContain('Budget center');
    expect(errorMarkup).toContain('Budget data unavailable');
    expect(errorMarkup).toContain('budget unavailable');
  });

  it('renders all three controlled tabs with accessible selection state', () => {
    const markup = renderBudgetView('policies');

    expect(markup).toContain('Overview');
    expect(markup).toContain('Budget policies');
    expect(markup).toContain('Model pricing');
    expect(markup).toContain('id="budget-tab-policies"');
    expect(markup).toContain('aria-controls="budget-panel-policies"');
    expect(markup).toContain('id="budget-panel-policies"');
    expect(markup).toContain('aria-labelledby="budget-tab-policies"');
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
        id: 'global-month',
        scope: 'global',
        period: 'month',
        modelTarget: { kind: 'all' },
        tokenLimit: 1_000,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
      periodStart: '2026-07-01T00:00:00.000Z',
      periodEnd: '2026-07-20T12:00:00.000Z',
      assumedTokens: 0,
      token: { used: 100, limit: 1_000, percent: 10, severity: 'normal' },
      unpricedTokens: 0,
      unpricedModelIds: [],
    },
    {
      policy: {
        id: 'global-day',
        scope: 'global',
        period: 'day',
        modelTarget: { kind: 'unknown' },
        tokenLimit: 100,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
      periodStart: '2026-07-20T00:00:00.000Z',
      periodEnd: '2026-07-20T12:00:00.000Z',
      assumedTokens: 0,
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
        modelTarget: { kind: 'model', modelId: 'future-model' },
        costLimitUsd: 10,
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
      },
      periodStart: '2026-07-20T00:00:00.000Z',
      periodEnd: '2026-07-20T12:00:00.000Z',
      assumedTokens: 120,
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
  saveUnknownModelPricing: vi.fn(async () => SNAPSHOT),
  deleteUnknownModelPricing: vi.fn(async () => SNAPSHOT),
};
