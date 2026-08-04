// @vitest-environment jsdom
/**
 * @file Hourly activity chart interaction tests
 * @description Verifies localized hourly details for pointer and keyboard users.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import HourlyActivityChart from '../src/renderer/components/HourlyActivityChart';
import { buildHourlyActivity } from '../src/renderer/utils/hourlyActivity';
import type { UsageSession } from '../src/shared/usageTypes';
import { createTestI18n } from './helpers/renderWithI18n';

const makeSession = (): UsageSession => {
  const occurredAt = new Date(2026, 7, 4, 14).toISOString();

  return {
    sessionId: 'peak-session',
    startedAt: occurredAt,
    endedAt: occurredAt,
    projectPath: 'C:\\repo',
    projectName: 'repo',
    usageSlices: [
      {
        occurredAt,
        inputTokens: 1_200,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 1_200,
      },
    ],
    inputTokens: 1_200,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 1_200,
    eventCount: 1,
    sourceFile: 'peak-session.jsonl',
    warnings: [],
  };
};

const renderChart = (locale: 'en' | 'zh-CN' = 'en'): void => {
  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <HourlyActivityChart activity={buildHourlyActivity([makeSession()])} />
    </I18nextProvider>
  );
};

describe('HourlyActivityChart', () => {
  it('shows the same exact details for pointer hover and keyboard focus', () => {
    renderChart();
    const peakBar = screen.getByTestId('hour-bar-14');

    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseEnter(peakBar);
    expect(screen.getByRole('tooltip').textContent).toContain('14:00–15:00');
    expect(screen.getByRole('tooltip').textContent).toContain('1.2K tokens');
    expect(screen.getByRole('tooltip').textContent).toContain('100%');
    expect(screen.getByRole('tooltip').textContent).toContain('1 session');
    expect(screen.getByRole('tooltip').textContent).toContain('1 active day');

    fireEvent.mouseLeave(peakBar);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(peakBar);
    expect(screen.getByRole('tooltip').textContent).toContain('14:00–15:00');

    fireEvent.blur(peakBar);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('provides complete Chinese accessible labels and a non-color peak marker', () => {
    renderChart('zh-CN');

    const peakBar = screen.getByTestId('hour-bar-14');
    expect(peakBar.getAttribute('aria-label')).toContain('14:00–15:00');
    expect(peakBar.getAttribute('aria-label')).toContain('1,200 Token');
    expect(peakBar.getAttribute('aria-label')).toContain('100%');
    expect(peakBar.getAttribute('aria-label')).toContain('1 个会话');
    expect(peakBar.getAttribute('aria-label')).toContain('1 个活跃日');
    expect(screen.getAllByText('高峰')).toHaveLength(2);
    expect(screen.getByText('本地时间')).toBeTruthy();
  });

  it('reports tokens that could not be assigned while retaining valid hourly activity', () => {
    const session = makeSession();
    session.inputTokens = 1_500;
    session.totalTokens = 1_500;

    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <HourlyActivityChart activity={buildHourlyActivity([session])} />
      </I18nextProvider>
    );

    expect(screen.getByText('300 tokens could not be assigned by hour')).toBeTruthy();
    expect(screen.getByText('14:00–15:00')).toBeTruthy();
  });
});
