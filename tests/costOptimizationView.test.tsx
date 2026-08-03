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
        activeTab="overview"
        onActiveTabChange={vi.fn()}
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
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
        activeTab="overview"
        onActiveTabChange={vi.fn()}
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );
    const errorMarkup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'error', message: 'analysis unavailable' }}
        projectOptions={[]}
        projectPath={null}
        activeTab="overview"
        onActiveTabChange={vi.fn()}
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(loadingMarkup).toContain('Loading cost analysis');
    expect(errorMarkup).toContain('analysis unavailable');
  });

  it('renders all six tabs with accessible selection state', () => {
    const markup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'ready', snapshot: SNAPSHOT }}
        projectOptions={['C:\\repo']}
        projectPath={null}
        activeTab="overview"
        onActiveTabChange={vi.fn()}
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(markup).toContain('Overview');
    expect(markup).toContain('Model comparison');
    expect(markup).toContain('Anomalies');
    expect(markup).toContain('Forecast');
    expect(markup).toContain('Savings');
    expect(markup).toContain('Session diagnostics');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('id="cost-optimization-tab-overview"');
    expect(markup).toContain('aria-controls="cost-optimization-panel-overview"');
    expect(markup).toContain('id="cost-optimization-panel-overview"');
    expect(markup).toContain('aria-labelledby="cost-optimization-tab-overview"');
  });

  it('renders the controlled diagnostics tab and workspace', () => {
    const markup = renderWithI18n(
      <CostOptimizationView
        model={{ kind: 'ready', snapshot: SNAPSHOT }}
        projectOptions={['C:\\repo']}
        projectPath={undefined}
        activeTab="diagnostics"
        onActiveTabChange={vi.fn()}
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
        onProjectPathChange={vi.fn()}
        onUpdateSettings={vi.fn()}
      />
    );

    expect(markup).toContain('Session diagnostics');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('Session scope');
  });
});
