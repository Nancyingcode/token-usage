// @vitest-environment jsdom
/**
 * @file Overview trend and activity tests
 * @description Verifies overview pricing, trend geometry, and accessible calendar interaction.
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import * as pricingCalculations from '../src/shared/pricing';
import * as conditionalPricing from '../src/shared/conditionalPricing';
import Overview, { buildTrendPoints } from '../src/renderer/components/Overview';
import { buildOverviewTrendBuckets } from '../src/renderer/utils/overviewTrend';
import type { CostEstimate, ModelPricingEntry } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageDateRange, UsageDay, UsageSession } from '../src/shared/usageTypes';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

it.each([
  { locale: 'zh-CN', title: '部分用量未计价', count: '110 Token' },
  { locale: 'en', title: 'Partially priced', count: '110 tokens' },
] as const)(
  'shows unpriced usage in the collapsed overview notice in $locale',
  ({ locale, title, count }) => {
    const { container } = render(
      <I18nextProvider i18n={createTestI18n(locale)}>
        <Overview
          summary={buildUsageSummary([UNKNOWN_SESSION])}
          pricing={PRICING}
          period="total"
          scannedAt="2026-07-20T12:00:00.000Z"
        />
      </I18nextProvider>
    );

    const notice = container.querySelector<HTMLDetailsElement>('.pricing-quality-notice');
    expect(notice?.open).toBe(false);
    expect(notice?.querySelector('summary')?.textContent).toContain(title);
    expect(notice?.querySelector('summary')?.textContent).toContain(count);
  }
);

describe('custom overview trend', () => {
  it('generates zero days and keeps a full month at daily granularity', () => {
    const range = { startDate: '2026-01-01', endDate: '2026-01-31' };
    const { daysPerPoint, buckets } = buildOverviewTrendBuckets(
      [makeDay('2026-01-02', 125)],
      range
    );

    expect(daysPerPoint).toBe(1);
    expect(buckets).toHaveLength(31);
    expect(buckets.slice(0, 2)).toMatchObject([
      { date: '2026-01-01', endDate: '2026-01-01', totalTokens: 0, sessionCount: 0 },
      { date: '2026-01-02', endDate: '2026-01-02', totalTokens: 125, sessionCount: 1 },
    ]);
    expect(buckets.at(-1)).toMatchObject({ date: '2026-01-31', endDate: '2026-01-31' });
    expect(
      buildOverviewTrendBuckets([], { startDate: '2024-02-29', endDate: '2024-02-29' }).buckets
    ).toMatchObject([{ date: '2024-02-29', endDate: '2024-02-29', totalTokens: 0 }]);
  });

  it('groups 90 days into 30 contiguous points and clips the final group in longer ranges', () => {
    const range = { startDate: '2026-01-01', endDate: '2026-03-31' };
    const days = [
      makeDay('2025-12-31', 10_000),
      makeDay('2026-01-01', 25),
      makeDay('2026-01-03', 50),
      makeDay('2026-03-31', 100),
      makeDay('2026-04-01', 10_000),
    ];
    const { daysPerPoint, buckets, bucketStartByDay } = buildOverviewTrendBuckets(days, range);

    expect(daysPerPoint).toBe(3);
    expect(buckets).toHaveLength(30);
    expect(buckets[0]).toMatchObject({
      date: '2026-01-01',
      endDate: '2026-01-03',
      totalTokens: 75,
    });
    expect(buckets[1]).toMatchObject({ date: '2026-01-04', endDate: '2026-01-06', totalTokens: 0 });
    expect(buckets.at(-1)).toMatchObject({
      date: '2026-03-29',
      endDate: '2026-03-31',
      totalTokens: 100,
    });
    expect([...bucketStartByDay]).toEqual([
      ['2026-01-01', '2026-01-01'],
      ['2026-01-03', '2026-01-01'],
      ['2026-03-31', '2026-03-29'],
    ]);
    const longRange = buildOverviewTrendBuckets(days, {
      startDate: '2000-01-01',
      endDate: '2026-03-31',
    });
    expect(longRange.buckets.length).toBeLessThanOrEqual(31);
    expect(longRange.buckets.at(-1)?.endDate).toBe('2026-03-31');
  });

  it('shows both endpoints, grouping and the cost of the full session at its start bucket', () => {
    const startedAt = new Date(2026, 7, 20, 23, 55).toISOString();
    const afterMidnight = new Date(2026, 7, 21, 0, 5).toISOString();
    const lastDay = new Date(2026, 10, 15, 10).toISOString();
    const summary = buildUsageSummary([
      {
        ...PRICED_SESSION,
        startedAt,
        endedAt: afterMidnight,
        usageSlices: [{ ...PRICED_SESSION.usageSlices[0], occurredAt: afterMidnight }],
      },
      {
        ...UNKNOWN_SESSION,
        startedAt: lastDay,
        endedAt: lastDay,
        usageSlices: [{ ...UNKNOWN_SESSION.usageSlices[0], occurredAt: lastDay }],
      },
    ]);
    const { container } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <Overview
          summary={summary}
          pricing={PRICING}
          period="month"
          scannedAt="2026-11-26T12:00:00.000Z"
          overviewDateFilter={{
            range: { startDate: '2026-08-18', endDate: '2026-11-15' },
            today: '2026-11-26',
          }}
        />
      </I18nextProvider>
    );

    expect(container.querySelector('.chart-panel .panel-heading p')?.textContent).toBe(
      '3-day totals'
    );
    const points = [...container.querySelectorAll<SVGCircleElement>('.trend-hit-target')];
    expect(points).toHaveLength(30);
    expect(points[0].getAttribute('aria-label')).toMatch(
      /August 18, 2026 – August 20, 2026.*110 total tokens.*\$0\.0003/i
    );
    expect(points[1].getAttribute('aria-label')).toMatch(/\b0 total tokens.*\$0\.00/i);
    expect(points.at(-1)?.getAttribute('aria-label')).toMatch(
      /November 13, 2026 – November 15, 2026.*pricing incomplete/i
    );
    const labels = [...container.querySelectorAll('.trend-x-axis text')];
    expect(labels[0].textContent).toBe('08-18');
    expect(labels.at(-1)?.textContent).toBe('11-15');
    fireEvent.focus(points[0]);
    expect(container.querySelector('.trend-tooltip')?.textContent).toContain(
      'August 18, 2026 – August 20, 2026'
    );
    expect(screen.getByTestId('activity-day-2026-11-15')).toBeTruthy();
    expect(screen.queryByTestId('activity-day-2026-11-16')).toBeNull();
  });

  it('keeps one focusable point for a single day and labels the calendar viewport when clipped', () => {
    const overview = (startDate: string) => (
      <I18nextProvider i18n={createTestI18n('en')}>
        <Overview
          summary={buildUsageSummary([PRICED_SESSION])}
          pricing={PRICING}
          period="total"
          scannedAt="2026-11-26T12:00:00.000Z"
          overviewDateFilter={{
            range: { startDate, endDate: '2026-07-20' },
            today: '2026-11-26',
          }}
        />
      </I18nextProvider>
    );
    const { container, rerender } = render(overview('2026-07-20'));
    expect(container.querySelectorAll('.trend-hit-target[tabindex="0"]')).toHaveLength(1);
    expect(container.querySelector('.trend-peak-label')?.textContent).toBe('110');
    expect(container.querySelector('.trend-area')).toBeNull();
    expect(screen.getByText('Daily totals')).toBeTruthy();

    rerender(overview('2024-01-01'));
    expect(screen.getByText('Calendar shows July 20, 2025 – July 20, 2026')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Token activity calendar' }).dataset.weekCount).toBe(
      '53'
    );
    expect(screen.queryByRole('button', { name: 'Show 53 weeks' })).toBeNull();
    expect(screen.queryByTestId('activity-day-2025-07-19')).toBeNull();
    expect(screen.getByTestId('activity-day-2025-07-20').getAttribute('aria-label')).toContain(
      '0 tokens'
    );
  });
});

describe('buildTrendPoints', () => {
  it('prices each slice once for both the total and daily trend', () => {
    const evaluate = vi.spyOn(conditionalPricing, 'evaluateConditionalUsage');
    try {
      renderWithI18n(
        <Overview
          summary={buildUsageSummary([PRICED_SESSION])}
          pricing={PRICING}
          period="month"
          scannedAt="2026-07-20T12:00:00.000Z"
        />
      );
      expect(evaluate).toHaveBeenCalledTimes(PRICED_SESSION.usageSlices.length);
    } finally {
      evaluate.mockRestore();
    }
  });
  it('reuses overview costs until sessions or pricing inputs change', () => {
    const calculate = vi.spyOn(pricingCalculations, 'buildOverviewCostEstimates');
    const i18n = createTestI18n('en');
    let props: React.ComponentProps<typeof Overview> = {
      summary: buildUsageSummary([PRICED_SESSION]),
      pricing: PRICING,
      period: 'month',
      scannedAt: '2026-07-20T12:00:00.000Z',
    };
    const view = () => (
      <I18nextProvider i18n={i18n}>
        <Overview {...props} />
      </I18nextProvider>
    );
    try {
      const { rerender } = render(view());
      expect(calculate).toHaveBeenCalledTimes(1);

      props = { ...props, scannedAt: '2026-07-21T12:00:00.000Z' };
      rerender(view());
      expect(calculate).toHaveBeenCalledTimes(1);

      props = { ...props, summary: { ...props.summary } };
      rerender(view());
      expect(calculate).toHaveBeenCalledTimes(1);

      props = { ...props, summary: buildUsageSummary([PRICED_SESSION, UNKNOWN_SESSION]) };
      rerender(view());
      expect(calculate).toHaveBeenCalledTimes(2);

      props = { ...props, pricing: [{ ...PRICING[0], inputUsdPerMillion: 4 }] };
      rerender(view());
      expect(calculate).toHaveBeenCalledTimes(3);

      props = {
        ...props,
        unknownModelPricing: {
          inputUsdPerMillion: 2,
          cachedInputUsdPerMillion: 0.5,
          outputUsdPerMillion: 10,
          updatedAt: '2026-07-21T12:00:00.000Z',
        },
      };
      rerender(view());
      expect(calculate).toHaveBeenCalledTimes(4);
      expect(calculate).toHaveBeenLastCalledWith(
        props.summary.sessions,
        props.pricing,
        props.unknownModelPricing
      );

      props = { ...props, unknownModelPricing: undefined };
      rerender(view());
      expect(calculate).toHaveBeenCalledTimes(5);
    } finally {
      calculate.mockRestore();
    }
  });

  it('reuses activity date formatters across cells and hover updates', () => {
    const DateFormatter = Intl.DateTimeFormat;
    const dates = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
      return new DateFormatter(locales, options);
    });
    try {
      render(
        <I18nextProvider i18n={createTestI18n('en')}>
          <Overview
            summary={buildUsageSummary([PRICED_SESSION])}
            pricing={PRICING}
            period="month"
            scannedAt="2026-07-20T12:00:00.000Z"
          />
        </I18nextProvider>
      );
      expect(dates.mock.calls.length).toBeLessThanOrEqual(2);
      const initialCalls = dates.mock.calls.length;
      fireEvent.mouseEnter(screen.getByTestId('activity-day-2026-07-20'));
      expect(screen.getByRole('tooltip').textContent).toContain('July 20, 2026');
      expect(dates).toHaveBeenCalledTimes(initialCalls);
    } finally {
      dates.mockRestore();
    }
  });

  it.each([0, 1, 7, 9, 24])('aligns date labels with their points for %i days', (count) => {
    const days = Array.from({ length: count }, (_, index) =>
      makeDay(`2026-07-${String(index + 1).padStart(2, '0')}`, 100)
    );
    const { container } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <Overview
          summary={{ ...buildUsageSummary([]), byDay: days }}
          pricing={PRICING}
          period="month"
          scannedAt="2026-07-24T12:00:00.000Z"
        />
      </I18nextProvider>
    );
    const chart = container.querySelector('.trend-chart svg');
    const labels = chart?.querySelectorAll('.trend-x-axis text');
    const step = Math.max(1, Math.ceil(count / 8));
    const labeledDays = days.filter((_, index) => index % step === 0);

    expect(labels?.length).toBe(labeledDays.length);
    labels?.forEach((label, index) => {
      const day = labeledDays[index];
      const point = chart?.querySelector(`.trend-hit-target[aria-label^="${day.date},"]`);
      expect(point).toBeTruthy();
      expect(label.textContent).toBe(day.date.slice(5));
      expect(label.getAttribute('x')).toBe(point?.getAttribute('cx'));
      expect(label.getAttribute('text-anchor')).toBe('middle');
    });
  });

  it('stretches the drawing layer to fill the available width', () => {
    const { container } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <Overview
          summary={buildUsageSummary([PRICED_SESSION])}
          pricing={PRICING}
          period="month"
          scannedAt="2026-07-20T12:00:00.000Z"
        />
      </I18nextProvider>
    );

    const drawing = container.querySelector('.trend-chart-plot > svg > svg');
    expect(drawing?.getAttribute('preserveAspectRatio')).toBe('none');
  });

  it('labels the highest point and aligns tick values to the same Token scale', () => {
    const days = [
      makeDay('2026-07-18', 125_000),
      makeDay('2026-07-19', 640_000),
      makeDay('2026-07-20', 640_000),
    ];
    const { container } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <Overview
          summary={{ ...buildUsageSummary([]), byDay: days }}
          pricing={PRICING}
          period="week"
          scannedAt="2026-07-20T12:00:00.000Z"
        />
      </I18nextProvider>
    );

    expect(container.querySelector('.chart-panel .panel-heading p')?.textContent).toBe(
      'Daily totals'
    );
    const chart = screen.getByRole('group', { name: 'Token trend chart' });
    const ticks = Array.from(chart.querySelectorAll('.trend-y-axis text'));
    expect(ticks.map((label) => label.textContent)).toEqual(['0', '250K', '500K', '750K']);
    const peak = chart.querySelector('.trend-peak-label');
    expect(peak?.textContent).toBe('640K');
    const firstMaximum = chart.querySelector('.trend-hit-target[aria-label^="2026-07-19,"]');
    expect(peak?.getAttribute('x')).toBe(firstMaximum?.getAttribute('cx'));
    expect(peak?.getAttribute('y')).toBe(firstMaximum?.getAttribute('cy'));
    const baseline = Number.parseFloat(ticks[0].getAttribute('y') ?? '');
    const upperTick = Number.parseFloat(ticks[3].getAttribute('y') ?? '');
    expect(Number.parseFloat(peak?.getAttribute('y') ?? '')).toBeCloseTo(
      baseline - (baseline - upperTick) * (640_000 / 750_000)
    );
  });

  it.each([{ days: [] }, { days: [makeDay('2026-07-20', 0)] }])(
    'keeps the zero baseline without a peak for $days.length days',
    ({ days }) => {
      const { container } = render(
        <I18nextProvider i18n={createTestI18n('en')}>
          <Overview
            summary={{ ...buildUsageSummary([]), byDay: days }}
            pricing={PRICING}
            period="week"
            scannedAt="2026-07-20T12:00:00.000Z"
          />
        </I18nextProvider>
      );

      expect(
        Array.from(container.querySelectorAll('.trend-y-axis text'), (label) => label.textContent)
      ).toEqual(['0', '1', '2']);
      expect(container.querySelector('.trend-peak-label')).toBeNull();
      expect(container.querySelector('.trend-area')).toBeNull();
    }
  );

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
        scannedAt="2026-07-21T12:00:00.000Z"
      />
    );

    expect(markup).toContain('$0.0003');
    expect(markup).toContain('Pricing incomplete');
    expect(markup).toContain('Token Usage Trend');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="page-stack page-stack--overview"');
    expect(markup.match(/Total Tokens/g)).toHaveLength(1);
    expect(markup).not.toContain('Cost Trends');
    expect(markup).not.toContain('>Input<');
    expect(markup).toContain('class="trend-line"');
    expect(markup).not.toContain('trend-range-enter');
    expect(markup).toContain('role="img" tabindex="0" aria-label="July 20, 2026, 220 tokens"');
    expect(markup).toContain('class="activity-cell outside-period" aria-hidden="true"');
    expect(markup).toContain('class="activity-months"');
    expect(markup).toContain('data-week-count="5"');
    expect(markup).toContain('data-day-count="35"');
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
    expect(markup).toContain('按日汇总');
    expect(markup).toContain('US$0.0003');
    expect(markup).toContain('已在本地扫描 1 个会话');
  });

  it('updates a focused trend point in place when usage changes in the same period', () => {
    const i18n = createTestI18n('en');
    const overview = (sessions: UsageSession[]) => (
      <I18nextProvider i18n={i18n}>
        <Overview
          summary={buildUsageSummary(sessions)}
          pricing={PRICING}
          period="month"
          scannedAt="2026-07-26T12:00:00.000Z"
        />
      </I18nextProvider>
    );
    const { container, rerender } = render(overview([PRICED_SESSION]));
    const chart = container.querySelector('.chart-panel');
    const metrics = container.querySelector('.metric-grid');
    const calendar = screen.getByRole('group', { name: 'Token activity calendar' });
    const toggle = screen.getByRole('button', { name: 'Show 53 weeks' });
    fireEvent.click(toggle);

    const point = screen.getByRole('img', { name: /110 total tokens.*\$0\.0003/i });
    act(() => point.focus());
    expect(document.activeElement).toBe(point);
    expect(container.querySelector('.trend-tooltip')?.textContent).toContain('$0.0003');

    const secondSession = makeSession('same-day', 'gpt-test');
    rerender(overview([PRICED_SESSION, secondSession]));

    expect(screen.getByRole('img', { name: /220 total tokens.*\$0\.0006/i })).toBe(point);
    expect(document.activeElement).toBe(point);
    expect(container.querySelector('.trend-tooltip')?.textContent).toContain('$0.0006');
    expect(container.querySelector('.chart-panel')).toBe(chart);
    expect(container.querySelector('.metric-grid')).toBe(metrics);
    expect(screen.getByRole('group', { name: 'Token activity calendar' })).toBe(calendar);
    expect(calendar.dataset.weekCount).toBe('53');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const nextDay = '2026-07-21T10:00:00.000Z';
    rerender(
      overview([
        {
          ...secondSession,
          startedAt: nextDay,
          endedAt: nextDay,
          usageSlices: [{ ...secondSession.usageSlices[0], occurredAt: nextDay }],
        },
      ])
    );
    expect(container.querySelector('.trend-tooltip')).toBeNull();
    expect(point.isConnected).toBe(false);
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

  it('expands the selected calendar weeks and retains the range and toggle focus on return', () => {
    const i18n = createTestI18n('en');
    const selectedRange = { startDate: '2026-07-20', endDate: '2026-07-22' };
    const overview = (sessions: UsageSession[], range: UsageDateRange) => (
      <I18nextProvider i18n={i18n}>
        <Overview
          summary={buildUsageSummary(sessions)}
          pricing={PRICING}
          period="total"
          scannedAt="2026-07-26T12:00:00.000Z"
          overviewDateFilter={{
            range,
            today: '2026-07-26',
          }}
        />
      </I18nextProvider>
    );
    const { rerender } = render(overview([PRICED_SESSION], selectedRange));
    const calendar = screen.getByRole('group', { name: 'Token activity calendar' });
    const toggle = screen.getByRole('button', { name: 'Show 53 weeks' });
    expect(calendar.dataset.weekCount).toBe('1');
    expect(calendar.querySelectorAll('[tabindex="0"]')).toHaveLength(3);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.focus();
    fireEvent.click(toggle);

    expect(calendar.dataset.weekCount).toBe('53');
    expect(calendar.dataset.dayCount).toBe('371');
    expect(calendar.querySelectorAll('[tabindex="0"]')).toHaveLength(3);
    expect(screen.queryByTestId('activity-day-2026-07-19')).toBeNull();
    expect(screen.getByTestId('activity-day-2026-07-21').classList.contains('level-0')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Show selected weeks' })).toBe(toggle);
    expect(document.activeElement).toBe(toggle);

    rerender(overview([PRICED_SESSION, UNKNOWN_SESSION], selectedRange));
    expect(screen.getByRole('button', { name: 'Show selected weeks' })).toBe(toggle);
    expect(calendar.dataset.weekCount).toBe('53');
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);

    expect(calendar.dataset.weekCount).toBe('1');
    expect(screen.getByRole('button', { name: 'Show 53 weeks' })).toBe(toggle);
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    rerender(overview([PRICED_SESSION], { ...selectedRange, endDate: '2026-07-26' }));
    expect(screen.getByRole('group', { name: 'Token activity calendar' }).dataset.weekCount).toBe(
      '2'
    );
    expect(screen.getByRole('button', { name: 'Show 53 weeks' })).toBeTruthy();
  });

  it('keeps the expanded calendar scroll position as the scan advances within its last week', () => {
    const i18n = createTestI18n('en');
    const summary = buildUsageSummary([PRICED_SESSION]);
    const overview = (scannedAt: string) => (
      <I18nextProvider i18n={i18n}>
        <Overview summary={summary} pricing={PRICING} period="week" scannedAt={scannedAt} />
      </I18nextProvider>
    );
    const view = render(overview('2026-07-20T12:00:00.000Z'));
    const calendar = view.container.querySelector<HTMLElement>('.activity-calendar-scroll');
    if (!calendar) {
      throw new Error('Missing activity calendar scroll container');
    }
    const scrollWidth = 800;
    const scrollPosition = 120;
    Object.defineProperty(calendar, 'scrollWidth', { value: scrollWidth });
    fireEvent.click(screen.getByRole('button', { name: 'Show 53 weeks' }));
    expect(calendar.scrollLeft).toBe(scrollWidth);
    calendar.scrollLeft = scrollPosition;

    view.rerender(overview('2026-07-21T12:00:00.000Z'));
    expect(calendar.scrollLeft).toBe(scrollPosition);

    view.rerender(overview('2026-07-26T12:00:00.000Z'));
    expect(calendar.scrollLeft).toBe(scrollWidth);
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
    expect(screen.getByRole('button', { name: '显示 53 周' })).toBeTruthy();
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
