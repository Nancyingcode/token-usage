// @vitest-environment jsdom
/**
 * @file Cost efficiency card tests
 * @description Verifies localized cost coverage, composition, daily details, and interaction.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import CostEfficiencyCard from '../src/renderer/components/CostEfficiencyCard';
import { buildCostEfficiency } from '../src/renderer/utils/costEfficiency';
import type { ModelPricingEntry, UnknownModelPricing } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession, UsageSlice } from '../src/shared/usageTypes';
import { createTestI18n } from './helpers/renderWithI18n';

const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-test',
    aliases: [],
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 10,
    effectiveAt: '2026-08-04',
    sourceKind: 'built-in',
  },
];

const FALLBACK: UnknownModelPricing = {
  inputUsdPerMillion: 4,
  cachedInputUsdPerMillion: 1,
  outputUsdPerMillion: 12,
  updatedAt: '2026-08-04T00:00:00.000Z',
};

const renderCard = (
  sessions: UsageSession[],
  locale: 'en' | 'zh-CN' = 'en',
  fallback?: UnknownModelPricing
): void => {
  const efficiency = buildCostEfficiency(buildUsageSummary(sessions), PRICING, fallback);

  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <CostEfficiencyCard efficiency={efficiency} />
    </I18nextProvider>
  );
};

describe('CostEfficiencyCard', () => {
  it('shows estimated cost, efficiency metrics, coverage, and priced-cost composition', () => {
    renderCard([
      makeSession('exact', [
        makeSlice('2026-08-04T08:00:00.000Z', 'gpt-test', 1_000_000, 400_000, 200_000),
      ]),
    ]);

    expect(screen.getByRole('heading', { name: 'Cost Efficiency' })).toBeTruthy();
    expect(screen.getByTestId('cost-summary').textContent).toContain('Estimated cost');
    expect(screen.getByTestId('cost-summary').textContent).toContain('$3.40');
    expect(screen.getByTestId('cost-summary').textContent).toContain('Effective unit cost');
    expect(screen.getByTestId('cost-summary').textContent).toContain('$2.8333 / 1M tokens');
    expect(screen.getByTestId('cost-summary').textContent).toContain('Average per session');
    expect(screen.getByTestId('cost-summary').textContent).toContain('Pricing coverage');
    expect(screen.getByText('Local estimate, not an actual bill')).toBeTruthy();
    expect(screen.getByLabelText('Pricing coverage legend').textContent).toContain(
      'Exact pricing1,200,000 · 100%'
    );
    expect(screen.getByLabelText('Priced cost composition legend').textContent).toContain(
      'Regular input$1.20 · 35%'
    );
    expect(screen.getByLabelText('Priced cost composition legend').textContent).toContain(
      'Cached input$0.20 · 6%'
    );
    expect(screen.getByLabelText('Priced cost composition legend').textContent).toContain(
      'Output$2.00 · 59%'
    );
    expect(screen.getByTestId('cost-day-2026-08-04').dataset.costUsd).toBe('3.4');
    expect(screen.getByTestId('cost-day-2026-08-04').getAttribute('aria-label')).toContain(
      'pricing coverage 100%'
    );
  });

  it('distinguishes exact, assumed, and unpriced coverage without claiming a full cost', () => {
    renderCard(
      [
        makeSession('mixed', [
          makeSlice('2026-08-04T08:00:00.000Z', 'gpt-test', 100, 0, 0),
          makeSlice('2026-08-04T09:00:00.000Z', undefined, 50, 0, 0),
          makeSlice('2026-08-04T10:00:00.000Z', 'future-model', 25, 0, 0),
        ]),
      ],
      'en',
      FALLBACK
    );

    expect(screen.getByTestId('cost-summary').textContent).toContain('Priced cost');
    expect(screen.getByText('Pricing incomplete')).toBeTruthy();
    expect(screen.getByText(/future-model/)).toBeTruthy();
    const coverage = screen.getByLabelText('Pricing coverage legend').textContent;
    expect(coverage).toContain('Exact pricing100 · 57%');
    expect(coverage).toContain('Fallback pricing50 · 29%');
    expect(coverage).toContain('Unpriced25 · 14%');
  });

  it('shows the same daily cost detail on pointer hover and keyboard focus', () => {
    renderCard([
      makeSession('exact', [makeSlice('2026-08-04T08:00:00.000Z', 'gpt-test', 1_000_000, 0, 0)]),
    ]);
    const point = screen.getByTestId('cost-day-2026-08-04');

    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(point);
    expect(screen.getByRole('tooltip').textContent).toContain('$2.00');
    expect(screen.getByRole('tooltip').textContent).toContain('$2.00 / 1M tokens');

    fireEvent.mouseLeave(point);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(point);
    expect(screen.getByRole('tooltip').textContent).toContain('100%');

    fireEvent.blur(point);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('does not present a fully unpriced day as a real zero-cost point', () => {
    renderCard([
      makeSession('unpriced', [makeSlice('2026-08-04T08:00:00.000Z', 'future-model', 100, 0, 0)]),
    ]);

    expect(screen.getByTestId('cost-unit-value').textContent).toBe('—');
    expect(screen.getByText('No priced usage in the selected period')).toBeTruthy();
    expect(screen.queryByTestId('cost-day-2026-08-04')).toBeNull();
  });

  it('renders cost detail labels in Chinese', () => {
    renderCard(
      [
        makeSession('exact', [
          makeSlice('2026-08-04T08:00:00.000Z', 'gpt-test', 1_000_000, 400_000, 200_000),
        ]),
      ],
      'zh-CN'
    );

    expect(screen.getByText('本地估算，不代表实际账单')).toBeTruthy();
    expect(screen.getByText('有效单位成本')).toBeTruthy();
    expect(screen.getByText('会话均费')).toBeTruthy();
    expect(screen.getAllByText('定价覆盖率')).toHaveLength(2);
    expect(screen.getByText('费用构成')).toBeTruthy();
    expect(screen.getByText('每日费用趋势')).toBeTruthy();
  });
});

const makeSlice = (
  occurredAt: string,
  modelId: string | undefined,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): UsageSlice => ({
  occurredAt,
  ...(modelId === undefined ? {} : { modelId }),
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens: 0,
  totalTokens: inputTokens + outputTokens,
});

const makeSession = (sessionId: string, usageSlices: UsageSlice[]): UsageSession => ({
  sessionId,
  startedAt: usageSlices[0]?.occurredAt ?? '2026-08-04T00:00:00.000Z',
  endedAt: usageSlices.at(-1)?.occurredAt ?? '2026-08-04T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  turnOutcomes: [],
  usageSlices,
  inputTokens: usageSlices.reduce((total, slice) => total + slice.inputTokens, 0),
  cachedInputTokens: usageSlices.reduce((total, slice) => total + slice.cachedInputTokens, 0),
  outputTokens: usageSlices.reduce((total, slice) => total + slice.outputTokens, 0),
  reasoningOutputTokens: 0,
  totalTokens: usageSlices.reduce((total, slice) => total + slice.totalTokens, 0),
  eventCount: usageSlices.length,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});
