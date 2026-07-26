import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import CostOptimizationView from '../src/renderer/components/CostOptimizationView';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('CostOptimizationView', () => {
  it('renders overview metrics, coverage and settings entry', () => {
    const markup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'ready', snapshot: SNAPSHOT }}
        projectOptions={['C:\\repo']}
        projectPath={null}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(markup).toContain('Cost Optimization');
    expect(markup).toContain('Pricing coverage');
    expect(markup).toContain('$48.20');
    expect(markup).toContain('Analysis settings');
  });

  it('renders loading and error states independently of usage content', () => {
    const loadingMarkup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'loading' }}
        projectOptions={[]}
        projectPath={null}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );
    const errorMarkup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'error', message: 'analysis unavailable' }}
        projectOptions={[]}
        projectPath={null}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(loadingMarkup).toContain('Loading cost analysis');
    expect(errorMarkup).toContain('analysis unavailable');
  });

  it('renders all five tabs with accessible selection state', () => {
    const markup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'ready', snapshot: SNAPSHOT }}
        projectOptions={['C:\\repo']}
        projectPath={null}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(markup).toContain('Overview');
    expect(markup).toContain('Model comparison');
    expect(markup).toContain('Anomalies');
    expect(markup).toContain('Forecast');
    expect(markup).toContain('Savings');
    expect(markup).toContain('aria-selected="true"');
  });
});
