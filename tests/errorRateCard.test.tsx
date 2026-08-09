// @vitest-environment jsdom
/**
 * @file Error rate detail card tests
 * @description Verifies localized turn outcomes, daily details, categories, and recent errors.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import ErrorRateCard from '../src/renderer/components/ErrorRateCard';
import type { ErrorRateDetail } from '../src/renderer/utils/errorRateDetail';
import { createTestI18n } from './helpers/renderWithI18n';

const DETAIL: ErrorRateDetail = {
  completedCount: 3,
  failedCount: 1,
  interruptedCount: 2,
  assessedCount: 4,
  errorRate: 25,
  coveredSessionCount: 2,
  totalSessionCount: 3,
  days: [
    {
      date: '2026-08-09',
      completedCount: 1,
      failedCount: 1,
      interruptedCount: 2,
      errorRate: 50,
    },
    {
      date: '2026-08-10',
      completedCount: 2,
      failedCount: 0,
      interruptedCount: 0,
      errorRate: 0,
    },
  ],
  categories: [{ category: 'network', count: 1, percentage: 100 }],
  recentErrors: [
    {
      occurredAt: '2026-08-09T11:00:00.000Z',
      sessionId: 'session-1',
      sessionLabel: 'Fix network retry',
      projectName: 'token-usage',
      category: 'network',
      rawCode: 'response_stream_disconnected',
      message: 'Response stream disconnected.',
    },
  ],
};

const renderCard = (detail: ErrorRateDetail, locale: 'en' | 'zh-CN' = 'en'): void => {
  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <ErrorRateCard detail={detail} />
    </I18nextProvider>
  );
};

describe('ErrorRateCard', () => {
  it('shows the turn error formula, outcome counts, coverage, categories, and recent errors', () => {
    renderCard(DETAIL);

    expect(screen.getByRole('heading', { name: 'Turn Error Rate' })).toBeTruthy();
    expect(screen.getByTestId('error-rate-summary').textContent).toContain('25%');
    expect(screen.getByTestId('error-rate-summary').textContent).toContain('3');
    expect(screen.getByTestId('error-rate-summary').textContent).toContain('1');
    expect(screen.getByTestId('error-rate-summary').textContent).toContain('2 / 3');
    expect(screen.getAllByText('Network or response stream')).toHaveLength(2);
    expect(screen.getByText('Fix network retry')).toBeTruthy();
    expect(screen.getByText('response_stream_disconnected')).toBeTruthy();
    expect(screen.getByText('Response stream disconnected.')).toBeTruthy();
  });

  it('exposes daily values on pointer hover and keyboard focus', () => {
    renderCard(DETAIL);
    const point = screen.getByTestId('error-day-2026-08-09');

    expect(point.getAttribute('tabindex')).toBe('0');
    expect(point.getAttribute('aria-label')).toContain('50%');
    expect(point.getAttribute('aria-label')).toContain('1 completed turn');
    expect(point.getAttribute('aria-label')).toContain('1 failed turn');
    expect(point.getAttribute('aria-label')).toContain('2 interrupted turns');
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(point);
    const firstTooltip = screen.getByRole('tooltip');
    expect(firstTooltip.textContent).toContain('50%');
    expect(firstTooltip.getAttribute('data-anchor-date')).toBe('2026-08-09');
    expect(firstTooltip.getAttribute('style')).toContain('25%');
    fireEvent.mouseLeave(point);
    expect(screen.queryByRole('tooltip')).toBeNull();

    const lastPoint = screen.getByTestId('error-day-2026-08-10');
    fireEvent.mouseEnter(lastPoint);
    const lastTooltip = screen.getByRole('tooltip');
    expect(lastTooltip.getAttribute('data-anchor-date')).toBe('2026-08-10');
    expect(lastTooltip.getAttribute('style')).toContain('75%');
    fireEvent.mouseLeave(lastPoint);

    fireEvent.focus(point);
    expect(screen.getByRole('tooltip').textContent).toContain('1');
    fireEvent.blur(point);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('clamps a near-right tooltip inside the trend plot', () => {
    const trendDayCount = 6;
    const days = Array.from({ length: trendDayCount }, (_, index) => ({
      ...DETAIL.days[0],
      date: `2026-08-0${index + 1}`,
    }));
    renderCard({ ...DETAIL, days });

    fireEvent.mouseEnter(screen.getByTestId('error-day-2026-08-05'));

    const tooltipStyle = screen.getByRole('tooltip').getAttribute('style');
    expect(tooltipStyle).toContain('75%');
    expect(tooltipStyle).toContain(
      'clamp(var(--error-trend-tooltip-half-width), 75%, calc(100% - var(--error-trend-tooltip-half-width)))'
    );
  });

  it('distinguishes missing terminal data from a real zero error rate', () => {
    renderCard({
      ...DETAIL,
      completedCount: 0,
      failedCount: 0,
      interruptedCount: 0,
      assessedCount: 0,
      errorRate: null,
      coveredSessionCount: 0,
      days: [],
      categories: [],
      recentErrors: [],
    });

    expect(screen.getByTestId('error-rate-value').textContent).toBe('—');
    expect(screen.getByText('No assessable turn outcomes')).toBeTruthy();

    const { unmount } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <ErrorRateCard
          detail={{
            ...DETAIL,
            failedCount: 0,
            assessedCount: 3,
            errorRate: 0,
            categories: [],
            recentErrors: [],
          }}
        />
      </I18nextProvider>
    );

    expect(screen.getAllByTestId('error-rate-value').at(-1)?.textContent).toBe('0%');
    expect(screen.getByText('No turn errors in the selected period')).toBeTruthy();
    unmount();
  });

  it('renders error detail labels in Chinese', () => {
    renderCard(DETAIL, 'zh-CN');

    expect(screen.getByRole('heading', { name: '回合错误率' })).toBeTruthy();
    expect(screen.getByText('失败回合占成功与失败回合的比例，中断不计入错误率')).toBeTruthy();
    expect(screen.getByText('成功回合')).toBeTruthy();
    expect(screen.getByText('失败回合')).toBeTruthy();
    expect(screen.getByText('中断回合')).toBeTruthy();
    expect(screen.getByText('终态覆盖')).toBeTruthy();
    expect(screen.getByText('每日错误趋势')).toBeTruthy();
    expect(screen.getByText('错误类型')).toBeTruthy();
    expect(screen.getByText('最近错误')).toBeTruthy();
  });
});
