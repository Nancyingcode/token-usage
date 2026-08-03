// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import ModelPricingView from '../src/renderer/components/ModelPricingView';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';
import type { BudgetSnapshot, ModelPricingEntry } from '../src/shared/budgetTypes';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-5.5',
    aliases: [],
    inputUsdPerMillion: 6,
    cachedInputUsdPerMillion: 0.6,
    outputUsdPerMillion: 32,
    effectiveAt: '2026-07-20T12:00:00.000Z',
    sourceKind: 'override',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.5',
  },
  {
    modelId: 'gpt-5.6-luna',
    aliases: [],
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.1,
    outputUsdPerMillion: 6,
    effectiveAt: '2026-07-20',
    sourceKind: 'built-in',
    sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-5.6-luna',
  },
];

describe('ModelPricingView', () => {
  it('marks overridden prices and exposes restore default', () => {
    const markup = renderWithI18n(
      <ModelPricingView pricing={PRICING} unpricedModels={[]} actions={ACTIONS} />
    );

    expect(markup).toContain('Custom');
    expect(markup).toContain('Built-in');
    expect(markup).toContain('Restore default');
    expect(markup).toContain('Open official pricing');
    expect(markup).toContain('Unknown-model fallback pricing');
    expect(markup).toContain('Set fallback price');
  });

  it('shows a configured fallback as a user assumption with edit and disable actions', () => {
    const markup = renderWithI18n(
      <ModelPricingView
        pricing={PRICING}
        unpricedModels={[]}
        unknownModelPricing={{
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: 0.5,
          outputUsdPerMillion: 10,
          updatedAt: '2026-08-03T00:00:00.000Z',
        }}
        actions={ACTIONS}
      />
    );

    expect(markup).toContain('User assumption');
    expect(markup).toContain('Edit fallback price');
    expect(markup).toContain('Disable fallback pricing');
    expect(markup).toContain('only applies to usage missing a Model ID');
  });

  it('shows detected unpriced models and an add price action', () => {
    const markup = renderWithI18n(
      <ModelPricingView
        pricing={PRICING}
        unpricedModels={[{ modelId: 'future-model', totalTokens: 500 }]}
        actions={ACTIONS}
      />
    );

    expect(markup).toContain('future-model');
    expect(markup).toContain('Add price');
    expect(markup).toContain('pricing-status-label');
  });

  it('renders model pricing in Chinese with locale-aware currency', () => {
    const markup = renderWithI18n(
      <ModelPricingView pricing={PRICING} unpricedModels={[]} actions={ACTIONS} />,
      'zh-CN'
    );

    expect(markup).toContain('模型价格');
    expect(markup).toContain('恢复默认');
    expect(markup).toContain('US$6.00');
  });

  it('uses an editable model combobox with current, unpriced, and one unknown option', () => {
    renderInteractive(
      <ModelPricingView
        pricing={PRICING}
        unpricedModels={[
          { modelId: 'future-model', totalTokens: 500 },
          { modelId: undefined, totalTokens: 200 },
          { modelId: ' ', totalTokens: 100 },
        ]}
        actions={ACTIONS}
      />
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Add price' })[0]);
    const combobox = screen.getByRole('combobox', { name: 'Model ID' });
    fireEvent.focus(combobox);

    expect(screen.getByRole('option', { name: /gpt-5\.5 Priced/ })).not.toBeNull();
    expect(screen.getByRole('option', { name: /future-model Unpriced/ })).not.toBeNull();
    expect(screen.getAllByRole('option', { name: /Unknown model/ })).toHaveLength(1);
    expect(
      screen
        .getByRole('option', { name: /Missing Model ID; a price cannot be added/ })
        .getAttribute('aria-disabled')
    ).toBe('true');
  });

  it('prefills a concrete detected model while allowing a new custom ID', () => {
    renderInteractive(
      <ModelPricingView
        pricing={PRICING}
        unpricedModels={[{ modelId: 'future-model', totalTokens: 500 }]}
        actions={ACTIONS}
        initialModelId="future-model"
      />
    );

    const combobox = screen.getByRole('combobox', { name: 'Model ID' }) as HTMLInputElement;
    expect(combobox.value).toBe('future-model');

    fireEvent.change(combobox, { target: { value: 'brand-new-model' } });
    expect(combobox.value).toBe('brand-new-model');
  });

  it('keeps the model ID read-only when editing an existing price', () => {
    renderInteractive(<ModelPricingView pricing={PRICING} unpricedModels={[]} actions={ACTIONS} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit model price' })[0]);
    const modelIdInput = screen.getByLabelText('Model ID') as HTMLInputElement;

    expect(modelIdInput.readOnly).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Model ID' })).toBeNull();
  });
});

const renderInteractive = (node: React.ReactNode): void => {
  const i18n = createTestI18n('en');
  render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
};

const EMPTY_SNAPSHOT: BudgetSnapshot = {
  generatedAt: '2026-07-20T00:00:00.000Z',
  dataState: 'fresh',
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  statuses: [],
  alerts: [],
  summary: { warningCount: 0, overCount: 0, unpricedModelCount: 0 },
  pricing: PRICING,
  unpricedModels: [],
};

const ACTIONS: BudgetActions = {
  savePolicy: vi.fn(async () => EMPTY_SNAPSHOT),
  deletePolicy: vi.fn(async () => EMPTY_SNAPSHOT),
  updateThresholds: vi.fn(async () => EMPTY_SNAPSHOT),
  savePricingOverride: vi.fn(async () => EMPTY_SNAPSHOT),
  resetPricingOverride: vi.fn(async () => EMPTY_SNAPSHOT),
  saveUnknownModelPricing: vi.fn(async () => EMPTY_SNAPSHOT),
  deleteUnknownModelPricing: vi.fn(async () => EMPTY_SNAPSHOT),
};
