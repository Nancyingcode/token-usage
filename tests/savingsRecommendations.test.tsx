// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import SavingsRecommendations, {
  filterSavingsRecommendations,
} from '../src/renderer/components/SavingsRecommendations';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

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

  it('filters through the accessible recommendation type menu', () => {
    const originalRecommendation = SNAPSHOT.recommendations[0];
    if (!originalRecommendation) {
      throw new Error('Expected the savings fixture to include a recommendation');
    }
    const cacheRecommendation = {
      ...originalRecommendation,
      id: 'cache-improvement:test',
      type: 'cache-improvement' as const,
      scopeLabel: 'cache candidate',
      confidence: 'medium' as const,
    };

    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SavingsRecommendations
          recommendations={[originalRecommendation, cacheRecommendation]}
          conservativeSavingsUsd={SNAPSHOT.conservativeSavingsUsd}
        />
      </I18nextProvider>
    );

    const typeMenu = screen.getByRole('combobox', { name: 'Recommendation type' });
    fireEvent.click(typeMenu);
    fireEvent.click(screen.getByRole('option', { name: 'Cache improvement' }));

    expect(typeMenu.textContent).toContain('Cache improvement');
    expect(screen.getByText('cache candidate')).not.toBeNull();
    expect(screen.queryByText(originalRecommendation.scopeLabel)).toBeNull();
  });
});
