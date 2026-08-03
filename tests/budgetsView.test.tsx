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
    expect(markup).toContain('Includes 120 tokens priced by the unknown-model assumption');
    expect(markup).toContain('Unpriced models');
    expect(markup).toContain('Token budget reached 100%');
    expect(markup).toContain('Global budgets');
    expect(markup).toContain('Project budgets');
    expect(markup).toContain('id="budget-tab-overview"');
    expect(markup).toContain('aria-controls="budget-panel-overview"');
    expect(markup).toContain('id="budget-panel-overview"');
    expect(markup).toContain('aria-labelledby="budget-tab-overview"');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="accessible-tabs"');
    expect(markup).toContain('summary-card');
    expect(markup).toContain('budget-status-label');
    expect(markup).toContain('On track');
    expect(markup).toContain('>Model<');
    expect(markup).toContain('All models');
    expect(markup).toContain('Unknown model');
    expect(markup).toContain('future-model');
  });

  it('renders budget alerts and rows in Chinese', () => {
    const markup = renderWithI18n(<BudgetsView snapshot={SNAPSHOT} actions={ACTIONS} />, 'zh-CN');

    expect(markup).toContain('预算中心');
    expect(markup).toContain('Token 预算已达到 100%');
    expect(markup).toContain('计价不完整');
    expect(markup).toContain('包含 120 个按未知模型假设计价的 Token');
    expect(markup).toContain('全局预算');
    expect(markup).toContain('项目预算');
    expect(markup).toContain('模型');
    expect(markup).toContain('所有模型');
    expect(markup).toContain('未知模型');
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
