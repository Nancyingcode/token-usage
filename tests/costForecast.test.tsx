import React from 'react';
import { describe, expect, it } from 'vitest';
import CostForecast, {
  buildCumulativeForecastPoints,
  getForecastBandPoints,
} from '../src/renderer/components/CostForecast';
import { READY_FORECAST, SNAPSHOT } from './helpers/costOptimizationFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('CostForecast', () => {
  it('renders a labelled forecast band and budget crossing', () => {
    const markup = renderWithI18n(
      <CostForecast forecast={READY_FORECAST} budgets={SNAPSHOT.budgets} query={SNAPSHOT.query} />
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
          budgetCrossings: [],
        }}
        budgets={[]}
        query={SNAPSHOT.query}
      />
    );

    expect(markup).toContain('Insufficient forecast history');
    expect(markup).toContain('2 of 7 required history days');
    expect(markup).not.toContain('role="img"');
  });

  it('builds a cumulative series and closes the interval band from right to left', () => {
    const cumulativePoints = buildCumulativeForecastPoints(
      [
        {
          date: '2026-07-26',
          predictedCostUsd: 2,
          lowerCostUsd: 1,
          upperCostUsd: 3,
        },
        {
          date: '2026-07-27',
          predictedCostUsd: 4,
          lowerCostUsd: 2,
          upperCostUsd: 6,
        },
      ],
      10
    );

    expect(cumulativePoints).toEqual([
      {
        date: '2026-07-26',
        predictedCostUsd: 12,
        lowerCostUsd: 11,
        upperCostUsd: 13,
      },
      {
        date: '2026-07-27',
        predictedCostUsd: 16,
        lowerCostUsd: 13,
        upperCostUsd: 19,
      },
    ]);
    expect(
      getForecastBandPoints(cumulativePoints, 20)
        .split(' ')
        .map((coordinate) => Number(coordinate.split(',')[0]))
    ).toEqual([34, 686, 686, 34]);
  });
});
