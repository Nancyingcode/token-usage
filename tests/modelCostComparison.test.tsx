import React from 'react';
import { describe, expect, it } from 'vitest';
import ModelCostComparison from '../src/renderer/components/ModelCostComparison';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('ModelCostComparison', () => {
  it('shows actual and scenario costs with the equivalence disclaimer', () => {
    const markup = renderWithI18n(
      <ModelCostComparison rows={SNAPSHOT.modelRows} scenarios={SNAPSHOT.substitutionScenarios} />
    );

    expect(markup).toContain('Actual cost');
    expect(markup).toContain('Scenario cost');
    expect(markup).toContain('does not imply equivalent quality, speed, or capability');
    expect(markup).toContain('gpt-source');
    expect(markup).toContain('gpt-target');
  });

  it('labels fully unpriced model usage instead of inventing a zero cost', () => {
    const row = {
      ...SNAPSHOT.modelRows[0],
      pricedCostUsd: 0,
      averageSessionCostUsd: 0,
      coverage: {
        pricedTokens: 0,
        unpricedTokens: SNAPSHOT.modelRows[0].totalTokens,
        totalTokens: SNAPSHOT.modelRows[0].totalTokens,
        percentage: 0,
        unpricedModelIds: ['gpt-source'],
      },
    };
    const markup = renderWithI18n(<ModelCostComparison rows={[row]} scenarios={[]} />);

    expect(markup).toContain('Pricing incomplete');
    expect(markup).not.toContain('$0.00');
  });
});
