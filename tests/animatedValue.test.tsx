// @vitest-environment jsdom
/**
 * @file Animated value tests
 * @description Verifies formatted KPI values remount when their displayed value changes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AnimatedValue from '../src/renderer/components/AnimatedValue';

describe('AnimatedValue', () => {
  it('replaces the value node when the formatted value changes', () => {
    const view = render(<AnimatedValue value="10K" className="metric-value" testId="total" />);
    const initialValue = screen.getByTestId('total');

    expect(initialValue.textContent).toBe('10K');
    expect(initialValue.classList.contains('animated-value')).toBe(true);
    expect(initialValue.classList.contains('metric-value')).toBe(true);

    view.rerender(<AnimatedValue value="12K" className="metric-value" testId="total" />);

    expect(screen.getByTestId('total').textContent).toBe('12K');
    expect(screen.getByTestId('total')).not.toBe(initialValue);
  });
});
