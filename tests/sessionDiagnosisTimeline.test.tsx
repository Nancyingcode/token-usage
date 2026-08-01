// @vitest-environment jsdom
/**
 * @file 会话诊断时间线测试
 * @description 验证分轨语义、键盘可达性与边界数据几何稳定性。
 */
import { render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SessionDiagnosisTimeline, {
  buildSessionDiagnosisTimelineGeometry,
} from '../src/renderer/components/SessionDiagnosisTimeline';
import { makeDiagnosisTimelinePoints } from './helpers/sessionDiagnosisFixtures';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

describe('session diagnosis timeline', () => {
  it('renders separate token and cache lanes on one time axis', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let markup: string;

    try {
      markup = renderWithI18n(
        <SessionDiagnosisTimeline points={makeDiagnosisTimelinePoints()} invalidPointCount={1} />
      );
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }

    expect(markup).toContain('aria-label="Token usage timeline"');
    expect(markup).toContain('data-lane="tokens"');
    expect(markup).toContain('data-series="input"');
    expect(markup).toContain('data-series="output"');
    expect(markup).toContain('data-series="reasoning"');
    expect(markup).toContain('data-lane="cache-rate"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('1 invalid time point omitted');
  });

  it('exposes the interactive timeline and its focusable points in the accessible role tree', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SessionDiagnosisTimeline points={makeDiagnosisTimelinePoints()} invalidPointCount={0} />
      </I18nextProvider>
    );

    const timeline = screen.getByRole('group', { name: 'Token usage timeline' });
    const inputPoint = within(timeline).getByRole('img', {
      name: /^Input tokens, 4,000,/,
    });
    const modelSwitch = within(timeline).getByRole('img', {
      name: 'Model switched from gpt-source to gpt-target',
    });

    expect(inputPoint.tabIndex).toBe(0);
    expect(modelSwitch.tabIndex).toBe(0);
  });

  it.each([
    { name: 'empty', points: [] },
    { name: 'single', points: makeDiagnosisTimelinePoints().slice(0, 1) },
    {
      name: 'same timestamp',
      points: makeDiagnosisTimelinePoints().map((point) => ({
        ...point,
        occurredAt: '2026-07-24T10:00:00.000Z',
      })),
    },
  ])('produces finite geometry for $name data', ({ points }) => {
    const geometry = buildSessionDiagnosisTimelineGeometry(points, 640, 220);
    const coordinates = geometry.points.flatMap(({ x, inputY, outputY, reasoningY, cacheY }) => [
      x,
      inputY,
      outputY,
      reasoningY,
      cacheY,
    ]);

    expect(coordinates.every(Number.isFinite)).toBe(true);
  });
});
