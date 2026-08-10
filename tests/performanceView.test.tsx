// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import PerformanceView from '../src/renderer/components/PerformanceView';
import type { ModelPricingEntry } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

const makeSession = (warningCount: number): UsageSession => ({
  sessionId: `session-${warningCount}`,
  startedAt: '2026-07-16T00:00:00.000Z',
  endedAt: '2026-07-16T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  turnOutcomes: [],
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 10,
  eventCount: 1,
  sourceFile: `session-${warningCount}.jsonl`,
  warnings: Array.from({ length: warningCount }, () => ({
    code: 'malformed-jsonl' as const,
  })),
});

const makeHourlySession = (hour: number, totalTokens: number): UsageSession => {
  const occurredAt = new Date(2026, 7, 4, hour).toISOString();

  return {
    ...makeSession(0),
    sessionId: `hour-${hour}`,
    startedAt: occurredAt,
    endedAt: occurredAt,
    usageSlices: [
      {
        occurredAt,
        inputTokens: totalTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens,
      },
    ],
    inputTokens: totalTokens,
    totalTokens,
    sourceFile: `hour-${hour}.jsonl`,
  };
};

const renderPerformanceView = (
  summary: ReturnType<typeof buildUsageSummary>,
  locale: 'en' | 'zh-CN' = 'en'
): void => {
  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <PerformanceView summary={summary} pricing={PRICING} />
    </I18nextProvider>
  );
};

describe('PerformanceView', () => {
  it('keeps scan warnings separate from turn errors', () => {
    const summary = buildUsageSummary([makeSession(3), makeSession(1)]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('No assessable turn outcomes');
    expect(markup).not.toContain('0.00% (0/2)');
    expect(markup).toContain('Pricing incomplete');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="page-stack"');
    expect(markup).toContain('class="performance-summary"');
    expect(markup).toContain('performance-summary-card');
    expect(markup).toContain('class="performance-detail"');
    expect(markup).toContain('id="performance-detail-tab-cache"');
    expect(markup).toContain('id="performance-detail-panel-cache"');
  });

  it('renders real completed, failed, and interrupted turn details', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        sessionId: 'turn-outcomes',
        threadName: 'Turn outcome details',
        turnOutcomes: [
          {
            occurredAt: '2026-08-09T10:00:00.000Z',
            status: 'completed',
          },
          {
            occurredAt: '2026-08-09T11:00:00.000Z',
            status: 'failed',
            error: {
              code: 'response_stream_disconnected',
              message: 'Stream disconnected.',
            },
          },
          {
            occurredAt: '2026-08-09T12:00:00.000Z',
            status: 'interrupted',
            interruptReason: 'interrupted',
          },
        ],
      },
    ]);
    renderPerformanceView(summary);

    expect(screen.getByTestId('performance-summary-error-value').textContent).toBe('50%');
    expect(screen.queryByTestId('error-rate-summary')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Reliability' }));

    expect(screen.getByTestId('error-rate-summary')).toBeTruthy();
    expect(screen.getByText('Completed turns')).toBeTruthy();
    expect(screen.getByText('Failed turns')).toBeTruthy();
    expect(screen.getByText('Interrupted turns')).toBeTruthy();
    expect(screen.getByText('Stream disconnected.')).toBeTruthy();
    expect(document.querySelector('.donut')).toBeNull();
  });

  it('renders performance metrics in Chinese', () => {
    const summary = buildUsageSummary([makeSession(0)]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />, 'zh-CN');

    expect(markup).toContain('缓存命中率');
    expect(markup).toContain('有效单位成本');
    expect(markup).toContain('活跃时段');
    expect(markup).toContain('回合错误率');
    expect(markup).toContain('aria-label="性能概览"');
  });

  it('shows four overview metrics while rendering only the selected detail', () => {
    const summary = buildUsageSummary([
      {
        ...makeHourlySession(14, 300),
        inputTokens: 300,
        cachedInputTokens: 180,
      },
    ]);

    renderPerformanceView(summary);

    expect(screen.getByRole('region', { name: 'Performance overview' })).toBeTruthy();
    expect(screen.getAllByTestId('performance-summary-card')).toHaveLength(4);
    expect(
      screen.getAllByTestId('performance-summary-card')[0].querySelector('.animated-value')
    ).toBeTruthy();
    expect(screen.getByTestId('performance-summary-cache-value').textContent).toBe('60%');
    expect(screen.getByTestId('performance-summary-cost-value').textContent).toBe('—');
    expect(screen.getByTestId('performance-summary-activity-value').textContent).toBe(
      '14:00–15:00'
    );
    expect(screen.getByTestId('performance-summary-error-value').textContent).toBe('—');
    expect(screen.getByTestId('cache-summary')).toBeTruthy();
    expect(screen.queryByTestId('cost-summary')).toBeNull();
    expect(screen.queryByTestId('error-rate-summary')).toBeNull();
    expect(screen.queryAllByTestId(/^hour-bar-/)).toHaveLength(0);
  });

  it('distinguishes a real zero error rate from missing turn outcomes', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        turnOutcomes: [
          {
            occurredAt: '2026-08-09T10:00:00.000Z',
            status: 'completed',
          },
        ],
      },
    ]);

    renderPerformanceView(summary);

    const errorValue = screen.getByTestId('performance-summary-error-value');
    const errorCard = errorValue.closest('.performance-summary-card');

    expect(errorValue.textContent).toBe('0%');
    expect(errorCard?.classList.contains('is-danger')).toBe(false);
    expect(screen.getByText('No turn errors in the selected period')).toBeTruthy();
  });

  it('switches the single detail panel by click and keyboard', () => {
    const summary = buildUsageSummary([makeHourlySession(14, 300)]);
    renderPerformanceView(summary);

    const cacheTab = screen.getByRole('tab', { name: 'Cache' });
    fireEvent.keyDown(cacheTab, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'Cost' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('cost-summary')).toBeTruthy();
    expect(screen.queryByTestId('cache-summary')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Active hours' }));

    expect(screen.getAllByTestId(/^hour-bar-/)).toHaveLength(24);
    expect(screen.queryByTestId('cost-summary')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Reliability' }));

    expect(screen.getByTestId('error-rate-summary')).toBeTruthy();
    expect(screen.queryAllByTestId(/^hour-bar-/)).toHaveLength(0);
  });

  it('renders the detailed cache efficiency card instead of a total-token mini line', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        inputTokens: 100,
        cachedInputTokens: 60,
        totalTokens: 100,
      },
    ]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('cache-efficiency-card');
    expect(markup).toContain('Cached input');
    expect(markup).toContain('Uncached input');
    expect(markup).toContain('Total input');
    expect(markup).toContain('data-cache-percentage="60"');
  });

  it('renders detailed cost efficiency instead of a total-token mini line', () => {
    const summary = buildUsageSummary([makeSession(0)]);
    renderPerformanceView(summary);

    fireEvent.click(screen.getByRole('tab', { name: 'Cost' }));

    expect(document.querySelector('.cost-efficiency-card')).toBeTruthy();
    expect(screen.getByText('Daily cost trend')).toBeTruthy();
    expect(document.querySelector('.mini-line.blue')).toBeNull();
  });

  it('renders a detailed 24-hour activity distribution and peak summary', () => {
    const summary = buildUsageSummary([makeHourlySession(14, 300), makeHourlySession(8, 100)]);
    renderPerformanceView(summary);

    fireEvent.click(screen.getByRole('tab', { name: 'Active hours' }));

    expect(screen.getAllByTestId(/^hour-bar-/)).toHaveLength(24);
    expect(document.querySelector('.vertical-token-bar')).toBeNull();
    expect(screen.getAllByText('14:00–15:00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('300 tokens').length).toBeGreaterThan(0);
    expect(screen.getAllByText('75%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 session').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 active day').length).toBeGreaterThan(0);
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByText('06:00')).toBeTruthy();
    expect(screen.getByText('12:00')).toBeTruthy();
    expect(screen.getByText('18:00')).toBeTruthy();
    expect(screen.getByText('24:00')).toBeTruthy();
  });

  it('does not invent a midnight peak when tokens cannot be assigned by hour', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        startedAt: 'invalid',
        endedAt: 'invalid',
        inputTokens: 90,
        totalTokens: 90,
      },
    ]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />, 'zh-CN');

    expect(markup).toContain('无法按小时分配用量');
    expect(markup).not.toContain('最活跃时间：00:00');
  });
});

const PRICING: ModelPricingEntry[] = [];
