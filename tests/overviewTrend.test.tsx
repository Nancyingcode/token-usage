// @vitest-environment jsdom
/**
 * @file Overview trend and activity tests
 * @description Verifies overview pricing, trend geometry, and accessible calendar interaction.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import Overview, {
  buildOverviewMotionKey,
  buildTrendPoints,
} from '../src/renderer/components/Overview';
import type { CostEstimate, ModelPricingEntry } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageDay, UsageSession } from '../src/shared/usageTypes';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

describe('buildTrendPoints', () => {
  it('maps boundaries, cost, and placement for chart points', () => {
    const dailyCosts = new Map<string, CostEstimate>([
      [
        '2026-07-14',
        {
          pricedCostUsd: 0.25,
          assumedCostUsd: 0,
          assumedTokens: 0,
          unpricedTokens: 0,
          unpricedModelIds: [],
        },
      ],
    ]);
    const points = buildTrendPoints(
      [makeDay('2026-07-14', 100), makeDay('2026-07-15', 50), makeDay('2026-07-16', 25)],
      100,
      dailyCosts
    );

    expect(points.map(({ x }) => x)).toEqual([24, 292, 560]);
    expect(points.map(({ placement }) => placement)).toEqual(['left', 'center', 'right']);
    expect(points[0].y).toBe(42);
    expect(points[0].cost).toBe(0.25);
    expect(points[0].pricingIncomplete).toBe(false);
    expect(points[1].pricingIncomplete).toBe(false);
    expect(points[0].day.inputTokens).toBe(60);
    expect(points[0].day.outputTokens).toBe(25);
    expect(points[0].day.cachedInputTokens).toBe(15);
  });

  it('returns no points for an empty period', () => {
    expect(buildTrendPoints([], 1, new Map())).toEqual([]);
  });

  it('renders model-priced total cost and incomplete pricing state', () => {
    const markup = renderWithI18n(
      <Overview
        summary={buildUsageSummary([PRICED_SESSION, UNKNOWN_SESSION])}
        pricing={PRICING}
        period="month"
        scannedAt="2026-07-20T12:00:00.000Z"
      />
    );

    expect(markup).toContain('$0.0003');
    expect(markup).toContain('Pricing incomplete');
    expect(markup).toContain('Token Usage Trend');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="page-stack"');
    expect(markup.match(/Total Tokens/g)).toHaveLength(1);
    expect(markup).not.toContain('Cost Trends');
    expect(markup).not.toContain('>Input<');
    expect(markup).toContain('data-motion="overview-story"');
    expect(markup).toContain('pathLength="1"');
    expect(markup).toContain('role="img" tabindex="0" aria-label="July 20, 2026, 220 tokens"');
    expect(markup).toContain('class="activity-cell outside-period" aria-hidden="true"');
    expect(markup).toContain('class="activity-months"');
    expect(markup).toContain('data-week-count="53"');
    expect(markup).toContain('data-day-count="371"');
    expect(markup).toContain('class="activity-cell future" aria-hidden="true"');
    expect(markup).toContain('Less');
    expect(markup).toContain('More');
  });

  it('renders Chinese labels and locale-aware currency', () => {
    const markup = renderWithI18n(
      <Overview
        summary={buildUsageSummary([PRICED_SESSION])}
        pricing={PRICING}
        period="month"
        scannedAt="2026-07-20T12:00:00.000Z"
      />,
      'zh-CN'
    );

    expect(markup).toContain('Token 用量趋势');
    expect(markup).toContain('US$0.0003');
    expect(markup).toContain('已在本地扫描 1 个会话');
  });

  it('builds a stable motion key that changes with the selected period', () => {
    const summary = buildUsageSummary([PRICED_SESSION]);

    expect(buildOverviewMotionKey(summary, 'week')).toBe(buildOverviewMotionKey(summary, 'week'));
    expect(buildOverviewMotionKey(summary, 'week')).not.toBe(
      buildOverviewMotionKey(summary, 'month')
    );
  });

  it('shows the same activity tooltip on mouse hover and keyboard focus', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <Overview
          summary={buildUsageSummary([PRICED_SESSION, UNKNOWN_SESSION])}
          pricing={PRICING}
          period="month"
          scannedAt="2026-07-20T12:00:00.000Z"
        />
      </I18nextProvider>
    );
    const day = screen.getByTestId('activity-day-2026-07-20');

    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(day);
    expect(screen.getByRole('tooltip').textContent).toContain('July 20, 2026');
    expect(screen.getByRole('tooltip').textContent).toContain('220 tokens');

    fireEvent.mouseLeave(day);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(day);
    expect(screen.getByRole('tooltip').textContent).toContain('July 20, 2026');

    fireEvent.blur(day);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('localizes the activity calendar labels and tooltip in Chinese', () => {
    render(
      <I18nextProvider i18n={createTestI18n('zh-CN')}>
        <Overview
          summary={buildUsageSummary([PRICED_SESSION])}
          pricing={PRICING}
          period="month"
          scannedAt="2026-07-20T12:00:00.000Z"
        />
      </I18nextProvider>
    );

    expect(screen.getByText('少')).toBeTruthy();
    expect(screen.getByText('多')).toBeTruthy();
    fireEvent.focus(screen.getByTestId('activity-day-2026-07-20'));
    expect(screen.getByRole('tooltip').textContent).toContain('2026年7月20日');
    expect(screen.getByRole('tooltip').textContent).toContain('110 Token');
  });
});

const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-test',
    aliases: [],
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 10,
    effectiveAt: '2026-07-20',
    sourceKind: 'built-in',
  },
];

const makeSession = (sessionId: string, modelId: string | undefined): UsageSession => ({
  sessionId,
  startedAt: '2026-07-20T10:00:00.000Z',
  endedAt: '2026-07-20T10:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  turnOutcomes: [],
  usageSlices: [
    {
      occurredAt: '2026-07-20T10:00:00.000Z',
      modelId,
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 10,
      reasoningOutputTokens: 2,
      totalTokens: 110,
    },
  ],
  inputTokens: 100,
  cachedInputTokens: 0,
  outputTokens: 10,
  reasoningOutputTokens: 2,
  totalTokens: 110,
  eventCount: 1,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});

const PRICED_SESSION = makeSession('priced', 'gpt-test');
const UNKNOWN_SESSION = makeSession('unknown', undefined);

const makeDay = (date: string, totalTokens: number): UsageDay => ({
  date,
  inputTokens: 60,
  cachedInputTokens: 15,
  outputTokens: 25,
  reasoningOutputTokens: 10,
  totalTokens,
  sessionCount: 1,
});
