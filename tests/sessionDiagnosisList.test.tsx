import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SessionDiagnosisList from '../src/renderer/components/SessionDiagnosisList';
import { DEFAULT_DIAGNOSIS_FILTERS } from '../src/renderer/utils/sessionDiagnosisFilters';
import {
  makeDiagnosisSummary,
  makeFindingSummary,
  makePartiallyPricedDiagnosisSummary,
} from './helpers/sessionDiagnosisFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('session diagnosis list', () => {
  it('renders diagnosis evidence without claiming unpriced cost is complete', () => {
    const markup = renderWithI18n(
      <SessionDiagnosisList
        summaries={[makePartiallyPricedDiagnosisSummary()]}
        filters={DEFAULT_DIAGNOSIS_FILTERS}
        onFiltersChange={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(markup).toContain('Priced cost');
    expect(markup).toContain('Pricing coverage');
    expect(markup).toContain('Input footprint growth');
    expect(markup).toContain('type="button"');
    expect(markup).not.toContain('Full estimated cost');
    expect(markup).toContain('data-motion-key=');
    expect(markup).toContain('motion-list-item');
    expect(markup).toContain('--motion-delay:0ms');
  });

  it('renders the relative baseline scope and sample count when available', () => {
    const markup = renderWithI18n(
      <SessionDiagnosisList
        summaries={[
          makeDiagnosisSummary('baseline', {
            primaryFinding: makeFindingSummary('input-growth', 'warning', 'high', {
              scope: 'project-model',
              sampleCount: 7,
              median: 4_000,
              mad: 500,
              score: 3,
            }),
          }),
        ]}
        filters={DEFAULT_DIAGNOSIS_FILTERS}
        onFiltersChange={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(markup).toContain('3.0 robust deviations above baseline');
    expect(markup).toContain('Project and model · 7 samples');
  });

  it.each([
    { locale: 'en' as const, expected: '3.0 robust deviations below baseline' },
    { locale: 'zh-CN' as const, expected: '低于基线 3.0 个稳健偏差' },
  ])('renders cache baseline direction correctly in $locale', ({ locale, expected }) => {
    const markup = renderWithI18n(
      <SessionDiagnosisList
        summaries={[
          makeDiagnosisSummary('cache-baseline', {
            primaryFinding: makeFindingSummary('cache-degradation', 'warning', 'medium', {
              scope: 'project-model',
              sampleCount: 7,
              median: 80,
              mad: 10,
              score: 3,
            }),
          }),
        ]}
        filters={DEFAULT_DIAGNOSIS_FILTERS}
        onFiltersChange={vi.fn()}
        onOpen={vi.fn()}
      />,
      locale
    );

    expect(markup).toContain(expected);
  });

  it('renders a successful no-attention state with show-all action', () => {
    const markup = renderWithI18n(
      <SessionDiagnosisList
        summaries={[
          makeDiagnosisSummary('normal', {
            requiresAttention: false,
          }),
        ]}
        filters={DEFAULT_DIAGNOSIS_FILTERS}
        onFiltersChange={vi.fn()}
        onOpen={vi.fn()}
      />
    );

    expect(markup).toContain('No high-impact sessions in this range');
    expect(markup).toContain('Show all sessions');
  });
});
