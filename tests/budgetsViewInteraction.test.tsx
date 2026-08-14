// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import BudgetsView from '../src/renderer/components/BudgetsView';
import type { BudgetTab } from '../src/renderer/components/BudgetsView';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';
import type { BudgetSnapshot } from '../src/shared/budgetTypes';
import { createTestI18n } from './helpers/renderWithI18n';

const ACTIONS: BudgetActions = {
  savePolicy: vi.fn(),
  deletePolicy: vi.fn(),
  updateThresholds: vi.fn(),
  savePricingOverride: vi.fn(),
  resetPricingOverride: vi.fn(),
  saveUnknownModelPricing: vi.fn(),
  deleteUnknownModelPricing: vi.fn(),
};

const SNAPSHOT: BudgetSnapshot = {
  generatedAt: '2026-08-03T00:00:00.000Z',
  dataState: 'fresh',
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  statuses: [],
  alerts: [],
  summary: { warningCount: 0, overCount: 0, unpricedModelCount: 2 },
  pricing: [
    {
      modelId: 'gpt-test',
      aliases: ['gpt-alias'],
      inputUsdPerMillion: 1,
      cachedInputUsdPerMillion: 0.1,
      outputUsdPerMillion: 5,
      effectiveAt: '2026-08-03',
      sourceKind: 'built-in',
    },
  ],
  unpricedModels: [
    { modelId: 'future-model', totalTokens: 20 },
    { modelId: undefined, totalTokens: 30 },
  ],
};

describe('BudgetsView model options', () => {
  it('filters budget policies through the accessible scope and period menus', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <BudgetsView
          model={{ kind: 'ready', snapshot: FILTERABLE_SNAPSHOT }}
          actions={ACTIONS}
          activeTab="policies"
          onActiveTabChange={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('Global budgets')).toBeTruthy();
    expect(screen.getByText('Project budgets')).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Scope' }));
    fireEvent.click(screen.getByRole('option', { name: 'Project' }));

    expect(screen.queryByText('Global budgets')).toBeNull();
    expect(screen.getByText('Project budgets')).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Period' }));
    fireEvent.click(screen.getByRole('option', { name: 'Daily' }));

    expect(screen.queryByText('Project budgets')).toBeNull();
    expect(screen.getByText('No budgets match these filters')).toBeTruthy();
  });

  it('passes priced, concrete unpriced, and one missing-ID option into the budget drawer', () => {
    const onActiveTabChange = vi.fn();
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <BudgetsView
          model={{ kind: 'ready', snapshot: SNAPSHOT }}
          actions={ACTIONS}
          activeTab="overview"
          onActiveTabChange={onActiveTabChange}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add budget' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('policies');
    const combobox = screen.getByRole('combobox', { name: 'Model ID' });
    fireEvent.focus(combobox);

    expect(screen.getByRole('option', { name: 'gpt-test' })).not.toBeNull();
    expect(screen.getByRole('option', { name: 'future-model' })).not.toBeNull();
    expect(screen.getAllByRole('option', { name: 'Unknown model' })).toHaveLength(1);
  });

  it('navigates from an unpriced alert to a prefilled pricing editor', () => {
    const ControlledBudgetsView: React.FC = () => {
      const [activeTab, setActiveTab] = React.useState<BudgetTab>('overview');

      return (
        <BudgetsView
          model={{ kind: 'ready', snapshot: SNAPSHOT }}
          actions={ACTIONS}
          activeTab={activeTab}
          onActiveTabChange={setActiveTab}
        />
      );
    };

    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <ControlledBudgetsView />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add price' }));

    expect(screen.getByRole('tab', { name: 'Model pricing' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect((screen.getByRole('combobox', { name: 'Model ID' }) as HTMLInputElement).value).toBe(
      'future-model'
    );
  });

  it('consumes an unavailable notification target after selecting budget policies', () => {
    const onActiveTabChange = vi.fn();
    const onFocusedPolicyConsumed = vi.fn();

    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <BudgetsView
          model={{ kind: 'ready', snapshot: SNAPSHOT }}
          actions={ACTIONS}
          activeTab="overview"
          onActiveTabChange={onActiveTabChange}
          focusedPolicyId="missing-policy"
          onFocusedPolicyConsumed={onFocusedPolicyConsumed}
        />
      </I18nextProvider>
    );

    expect(onActiveTabChange).toHaveBeenCalledWith('policies');
    expect(onFocusedPolicyConsumed).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens budget settings from the pricing tab', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <BudgetsView
          model={{ kind: 'ready', snapshot: SNAPSHOT }}
          actions={ACTIONS}
          activeTab="pricing"
          onActiveTabChange={vi.fn()}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Budget settings' }));

    expect(screen.getByRole('dialog').textContent).toContain('Alert thresholds');
  });
});

const FILTERABLE_SNAPSHOT: BudgetSnapshot = {
  ...SNAPSHOT,
  statuses: [
    {
      policy: {
        id: 'global-day',
        scope: 'global',
        period: 'day',
        modelTarget: { kind: 'all' },
        tokenLimit: 1_000,
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
      periodStart: '2026-08-03T00:00:00.000Z',
      periodEnd: '2026-08-03T23:59:59.999Z',
      token: { used: 100, limit: 1_000, percent: 10, severity: 'normal' },
      assumedTokens: 0,
      unpricedTokens: 0,
      unpricedModelIds: [],
    },
    {
      policy: {
        id: 'project-month',
        scope: 'project',
        projectPath: 'C:\\repo',
        period: 'month',
        modelTarget: { kind: 'all' },
        tokenLimit: 2_000,
        createdAt: '2026-08-03T00:00:00.000Z',
        updatedAt: '2026-08-03T00:00:00.000Z',
      },
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-31T23:59:59.999Z',
      token: { used: 200, limit: 2_000, percent: 10, severity: 'normal' },
      assumedTokens: 0,
      unpricedTokens: 0,
      unpricedModelIds: [],
    },
  ],
};
