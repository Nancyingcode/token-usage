import React from 'react';
import { describe, expect, it } from 'vitest';
import SavingsRecommendations, {
  filterSavingsRecommendations,
} from '../src/renderer/components/SavingsRecommendations';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('SavingsRecommendations', () => {
  it('shows confidence, evidence, risk, and overlap notice for savings', () => {
    const filtered = filterSavingsRecommendations(
      SNAPSHOT.recommendations,
      'model-substitution',
      'high'
    );
    const markup = renderWithI18n(
      <SavingsRecommendations
        recommendations={filtered}
        conservativeSavingsUsd={SNAPSHOT.conservativeSavingsUsd}
      />
    );

    expect(filtered).toHaveLength(1);
    expect(markup).toContain('High confidence');
    expect(markup).toContain('Calculation basis');
    expect(markup).toContain('Risk');
    expect(markup).toContain('Overlapping savings are not added twice');
  });
});
