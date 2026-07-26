import React from 'react';
import { describe, expect, it } from 'vitest';
import CostForecast from '../src/renderer/components/CostForecast';
import { READY_FORECAST, SNAPSHOT } from './helpers/costOptimizationFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('CostForecast', () => {
  it('renders a labelled forecast band and budget crossing', () => {
    const markup = renderWithI18n(
      <CostForecast forecast={READY_FORECAST} budgets={SNAPSHOT.budgets} />
    );

    expect(markup).toContain('80% empirical interval');
    expect(markup).toContain('Expected to exceed budget');
    expect(markup).toContain('role="img"');
    expect(markup).toContain('<title>');
    expect(markup).toContain('<desc ');
  });

  it('explains insufficient history without drawing a zero forecast', () => {
    const markup = renderWithI18n(
      <CostForecast
        forecast={{
          kind: 'insufficient-data',
          requiredHistoryDays: 7,
          actualHistoryDays: 2,
          coverage: SNAPSHOT.coverage,
        }}
        budgets={[]}
      />
    );

    expect(markup).toContain('Insufficient forecast history');
    expect(markup).toContain('2 of 7 required history days');
    expect(markup).not.toContain('role="img"');
  });
});
