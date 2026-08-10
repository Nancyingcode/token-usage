import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import CostOptimizationSettingsDrawer from '../src/renderer/components/CostOptimizationSettingsDrawer';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../src/shared/costOptimizationValidation';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('CostOptimizationSettingsDrawer', () => {
  it('renders an accessible settings dialog with every numeric rule', () => {
    const markup = renderWithI18n(
      <CostOptimizationSettingsDrawer
        settings={DEFAULT_COST_OPTIMIZATION_SETTINGS}
        availableCandidateModelIds={['gpt-test']}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Anomaly history window');
    expect(markup).toContain('Forecast horizon');
    expect(markup).toContain('Minimum pricing coverage');
    expect(markup).toContain('gpt-test');
    expect(markup).toContain('Latest-series replacement models');
  });

  it('keeps a selected unpriced candidate visible so the user can remove it', () => {
    const markup = renderWithI18n(
      <CostOptimizationSettingsDrawer
        settings={{
          ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
          candidateModelIds: ['retired-model'],
        }}
        availableCandidateModelIds={['gpt-test']}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(markup).toContain('retired-model');
    expect(markup).toContain('Not in the latest model series');
  });
});
