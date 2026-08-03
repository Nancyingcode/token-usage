// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import BudgetsView from '../src/renderer/components/BudgetsView';
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
  it('passes priced, concrete unpriced, and one missing-ID option into the budget drawer', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <BudgetsView snapshot={SNAPSHOT} actions={ACTIONS} />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add budget' }));
    const combobox = screen.getByRole('combobox', { name: 'Model ID' });
    fireEvent.focus(combobox);

    expect(screen.getByRole('option', { name: 'gpt-test' })).not.toBeNull();
    expect(screen.getByRole('option', { name: 'future-model' })).not.toBeNull();
    expect(screen.getAllByRole('option', { name: 'Unknown model' })).toHaveLength(1);
  });
});
