import React from 'react';
import { describe, expect, it } from 'vitest';
import CostAnomalies, { filterCostAnomalies } from '../src/renderer/components/CostAnomalies';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

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
});
