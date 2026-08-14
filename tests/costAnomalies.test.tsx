// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import CostAnomalies, { filterCostAnomalies } from '../src/renderer/components/CostAnomalies';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

describe('CostAnomalies', () => {
  it('filters anomalies by level and exposes the contribution chain', () => {
    const filtered = filterCostAnomalies(SNAPSHOT.anomalies, 'session', 'all');
    const markup = renderWithI18n(<CostAnomalies anomalies={filtered} />);

    expect(filtered.every(({ level }) => level === 'session')).toBe(true);
    expect(markup).toContain('Session');
    expect(markup).not.toContain('Day total');
    expect(markup).toContain('Contribution chain');
    expect(markup).toContain('contribution-1');
  });

  it('filters through the accessible level menu', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <CostAnomalies anomalies={SNAPSHOT.anomalies} />
      </I18nextProvider>
    );

    const levelMenu = screen.getByRole('combobox', { name: 'Anomaly level' });
    fireEvent.click(levelMenu);
    fireEvent.click(screen.getByRole('option', { name: 'Session' }));

    expect(levelMenu.textContent).toContain('Session');
    expect(screen.queryByText('Day total')).toBeNull();
  });
});
