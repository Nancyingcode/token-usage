import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ModelPricingView from '../src/renderer/components/ModelPricingView';
import type { BudgetActions } from '../src/renderer/hooks/useBudgetSnapshot';
import type { BudgetSnapshot, ModelPricingEntry } from '../src/shared/budgetTypes';
import { renderWithI18n } from './helpers/renderWithI18n';

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
});

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
};
