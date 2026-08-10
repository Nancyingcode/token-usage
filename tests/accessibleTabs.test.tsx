// @vitest-environment jsdom
/**
 * @file Accessible tabs tests
 * @description Verifies roving focus, keyboard selection, and ARIA relationships.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AccessibleTabs from '../src/renderer/components/AccessibleTabs';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'pricing', label: 'Pricing' },
  { value: 'alerts', label: 'Alerts' },
] as const;

describe('AccessibleTabs', () => {
  it('moves selection and focus with arrows, Home, and End', () => {
    const onChange = vi.fn();
    render(
      <AccessibleTabs
        groupId="demo"
        label="Demo views"
        value="overview"
        tabs={TABS}
        onChange={onChange}
      />
    );

    const overview = screen.getByRole('tab', { name: 'Overview' });
    const pricing = screen.getByRole('tab', { name: 'Pricing' });
    const alerts = screen.getByRole('tab', { name: 'Alerts' });
    expect(overview.getAttribute('tabindex')).toBe('0');

    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('pricing');
    expect(document.activeElement).toBe(pricing);

    fireEvent.keyDown(pricing, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('overview');
    expect(document.activeElement).toBe(overview);

    fireEvent.keyDown(overview, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('alerts');
    expect(document.activeElement).toBe(alerts);

    fireEvent.keyDown(alerts, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('overview');
    expect(document.activeElement).toBe(overview);
  });

  it('links tabs to stable panel identifiers and reports clicks', () => {
    const onChange = vi.fn();
    render(
      <AccessibleTabs
        groupId="demo"
        label="Demo views"
        value="pricing"
        tabs={TABS}
        onChange={onChange}
      />
    );

    const pricing = screen.getByRole('tab', { name: 'Pricing' });
    expect(pricing.id).toBe('demo-tab-pricing');
    expect(pricing.getAttribute('aria-controls')).toBe('demo-panel-pricing');
    expect(pricing.getAttribute('aria-selected')).toBe('true');
    expect(pricing.className).toContain('active');

    fireEvent.click(screen.getByRole('tab', { name: 'Alerts' }));
    expect(onChange).toHaveBeenCalledWith('alerts');
  });
});
