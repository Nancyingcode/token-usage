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
        pricedModelIds={['gpt-test']}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Anomaly history window');
    expect(markup).toContain('Forecast horizon');
    expect(markup).toContain('Minimum pricing coverage');
    expect(markup).toContain('gpt-test');
  });
});
