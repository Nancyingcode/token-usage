import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Toolbar, { PeriodToggle } from '../src/renderer/components/Toolbar';

interface PeriodButtonProps {
  'aria-pressed': boolean;
  children: React.ReactNode;
  onClick: () => void;
}

describe('PeriodToggle', () => {
  it('marks the selected period and reports button clicks', () => {
    const onPeriodChange = vi.fn();
    const buttons = getButtons(PeriodToggle({ period: 'week', onPeriodChange }));

    expect(buttons.map((button) => button.props['aria-pressed'])).toEqual([false, true, false]);

    buttons[0].props.onClick();
    expect(onPeriodChange).toHaveBeenCalledWith('today');
  });

  it('hides rolling period controls on Budgets', () => {
    const markup = renderToStaticMarkup(
      <Toolbar
        activeView="budgets"
        loading={false}
        onRefresh={vi.fn()}
        period="month"
        onPeriodChange={vi.fn()}
      />
    );

    expect(markup).not.toContain('Date range');
    expect(markup).toContain('Budgets');
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
