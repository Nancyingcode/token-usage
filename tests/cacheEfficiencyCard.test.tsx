// @vitest-environment jsdom
/**
 * @file Cache efficiency card tests
 * @description Verifies localized cache composition, daily details, and accessible interaction.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import CacheEfficiencyCard from '../src/renderer/components/CacheEfficiencyCard';
import { buildCacheEfficiency } from '../src/renderer/utils/cacheEfficiency';
import type { UsageDay, UsageSummary } from '../src/shared/usageTypes';
import { createTestI18n } from './helpers/renderWithI18n';

const makeDay = (date: string, inputTokens: number, cachedInputTokens: number): UsageDay => ({
  date,
  sessionCount: 1,
  inputTokens,
  cachedInputTokens,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: inputTokens,
});

const makeSummary = (
  inputTokens: number,
  cachedInputTokens: number,
  byDay: UsageDay[]
): UsageSummary => ({
  totals: {
    inputTokens,
    cachedInputTokens,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: inputTokens,
  },
  byDay,
  byProject: [],
  sessions: [],
});

const renderCard = (summary: UsageSummary, locale: 'en' | 'zh-CN' = 'en'): void => {
  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <CacheEfficiencyCard efficiency={buildCacheEfficiency(summary)} />
    </I18nextProvider>
  );
};

describe('CacheEfficiencyCard', () => {
  it('shows the overall input composition and true daily cache rates', () => {
    renderCard(
      makeSummary(1_000, 600, [makeDay('2026-08-03', 200, 0), makeDay('2026-08-04', 800, 600)])
    );

    expect(screen.getByRole('heading', { name: 'Cache Hit Rate' })).toBeTruthy();
    expect(screen.getByTestId('cache-summary').textContent).toContain('60%');
    expect(screen.getByTestId('cache-summary').textContent).toContain('600');
    expect(screen.getByTestId('cache-summary').textContent).toContain('400');
    expect(screen.getByTestId('cache-summary').textContent).toContain('1,000');
    expect(screen.getByTestId('cache-day-2026-08-03').dataset.cachePercentage).toBe('0');
    expect(screen.getByTestId('cache-day-2026-08-04').dataset.cachePercentage).toBe('75');
    expect(screen.getByTestId('cache-day-2026-08-04').getAttribute('aria-label')).toContain('75%');
    expect(screen.getByTestId('cache-day-2026-08-04').getAttribute('aria-label')).toContain(
      '600 cached input tokens'
    );
    expect(screen.getByTestId('cache-day-2026-08-04').getAttribute('aria-label')).toContain(
      '200 uncached input tokens'
    );
    expect(screen.getByTestId('cache-day-2026-08-04').getAttribute('aria-label')).toContain(
      '800 total input tokens'
    );
  });

  it('shows the same daily detail on pointer hover and keyboard focus', () => {
    renderCard(makeSummary(800, 600, [makeDay('2026-08-04', 800, 600)]));
    const point = screen.getByTestId('cache-day-2026-08-04');

    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(point);
    expect(screen.getByRole('tooltip').textContent).toContain('75%');
    expect(screen.getByRole('tooltip').textContent).toContain('600');

    fireEvent.mouseLeave(point);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(point);
    expect(screen.getByRole('tooltip').textContent).toContain('75%');

    fireEvent.blur(point);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders an explicit uncomputable state instead of inventing a zero rate', () => {
    renderCard(makeSummary(0, 0, [makeDay('2026-08-04', 0, 0)]));

    expect(screen.getByTestId('cache-rate').textContent).toBe('—');
    expect(screen.getByText('No input tokens in the selected period')).toBeTruthy();
    expect(screen.queryByTestId('cache-day-2026-08-04')).toBeNull();
  });

  it('clamps chart geometry and explains inconsistent local records', () => {
    renderCard(makeSummary(100, 120, [makeDay('2026-08-04', 100, 120)]));

    expect(screen.getByText('Cache data is inconsistent')).toBeTruthy();
    expect(screen.getByTestId('cache-composition-cached').style.width).toBe('100%');
    expect(screen.getByTestId('cache-day-2026-08-04').dataset.cachePercentage).toBe('100');
  });

  it('renders cache detail labels in Chinese', () => {
    renderCard(makeSummary(1_000, 600, [makeDay('2026-08-04', 1_000, 600)]), 'zh-CN');

    expect(screen.getByText('缓存输入占全部输入 Token 的比例')).toBeTruthy();
    expect(screen.getAllByText('缓存输入')).toHaveLength(2);
    expect(screen.getAllByText('未缓存输入')).toHaveLength(2);
    expect(screen.getByText('总输入')).toBeTruthy();
    expect(screen.getByText('每日缓存趋势')).toBeTruthy();
  });
});
