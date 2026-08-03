import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { i18n } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import Toolbar, { PeriodToggle } from '../src/renderer/components/Toolbar';
import { createRendererI18n } from '../src/renderer/i18n';
import type { UsagePeriod } from '../src/shared/usageTypes';

interface PeriodButtonProps {
  'aria-pressed': boolean;
  children: React.ReactNode;
  onClick: () => void;
}

describe('PeriodToggle', () => {
  let testI18n: i18n;

  beforeAll(async () => {
    testI18n = await createRendererI18n('en');
  });

  it('marks the selected period and reports button clicks', () => {
    const onPeriodChange = vi.fn();
    const buttons = getButtons(PeriodToggle({ period: 'week', onPeriodChange }));

    expect(buttons.map((button) => button.props['aria-pressed'])).toEqual([
      false,
      true,
      false,
      false,
    ]);

    buttons[0].props.onClick();
    expect(onPeriodChange).toHaveBeenCalledWith('today');
  });

  it('renders Total after Month and reports Total clicks', () => {
    const onPeriodChange = vi.fn();
    const buttons = getButtons(PeriodToggle({ period: 'total' as UsagePeriod, onPeriodChange }));

    expect(buttons.map((button) => button.props.children)).toEqual([
      'Today',
      'Week',
      'Month',
      'Total',
    ]);
    expect(buttons.map((button) => button.props['aria-pressed'])).toEqual([
      false,
      false,
      false,
      true,
    ]);

    buttons[3].props.onClick();
    expect(onPeriodChange).toHaveBeenCalledWith('total');
  });

  it.each(['budgets', 'wrapped'] as const)('hides rolling period controls on %s', (activeView) => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={testI18n}>
        <Toolbar
          activeView={activeView}
          loading={false}
          onRefresh={vi.fn()}
          period="month"
          onPeriodChange={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(markup).not.toContain('Date range');
    expect(markup).not.toContain('<strong>');
    expect(markup).toContain('English');
    expect(markup).toContain('中文');
  });

  it('keeps the global toolbar focused on status and controls', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={testI18n}>
        <Toolbar
          activeView="overview"
          loading={false}
          error={null}
          scannedAt="2026-08-03T08:00:00.000Z"
          onRefresh={vi.fn()}
          period="week"
          onPeriodChange={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(markup).toContain('Local data synced');
    expect(markup).not.toContain('<strong>Overview</strong>');
  });

  it('shows stale state text when a refresh fails after a successful scan', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={testI18n}>
        <Toolbar
          activeView="overview"
          loading={false}
          error="Disk unavailable"
          scannedAt="2026-08-03T00:00:00.000Z"
          onRefresh={vi.fn()}
          period="month"
          onPeriodChange={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(markup).toContain('Previous data');
    expect(markup).not.toContain('Daemon');
  });
});

const getButtons = (element: React.ReactNode): Array<React.ReactElement<PeriodButtonProps>> => {
  if (!React.isValidElement<{ children: React.ReactNode }>(element)) {
    return [];
  }

  return React.Children.toArray(element.props.children).filter(
    (child): child is React.ReactElement<PeriodButtonProps> =>
      React.isValidElement<PeriodButtonProps>(child) && child.type === 'button'
  );
};
