import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodToggle } from '../src/renderer/components/Toolbar';

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
