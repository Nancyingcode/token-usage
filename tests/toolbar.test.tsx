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

  it('hides rolling period controls on Budgets', () => {
    const markup = renderToStaticMarkup(
      <I18nextProvider i18n={testI18n}>
        <Toolbar
          activeView="budgets"
          loading={false}
          onRefresh={vi.fn()}
          period="month"
          onPeriodChange={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(markup).not.toContain('Date range');
    expect(markup).toContain('Budgets');
    expect(markup).toContain('English');
    expect(markup).toContain('中文');
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
