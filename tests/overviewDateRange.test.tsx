// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/renderer/App';
import { saveUsagePeriodPreference } from '../src/renderer/utils/usagePeriodPreference';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult, UsageSession } from '../src/shared/usageTypes';
import { createTestI18n } from './helpers/renderWithI18n';

const { useCostOptimizationSnapshot } = vi.hoisted(() => ({
  useCostOptimizationSnapshot: vi.fn(() => ({ loading: false, setProjectPath: vi.fn() })),
}));
vi.mock('../src/renderer/hooks/useCostOptimizationSnapshot', () => ({
  useCostOptimizationSnapshot,
}));
vi.mock('../src/renderer/hooks/useBudgetSnapshot', () => ({
  useBudgetSnapshot: () => ({ loading: false, snapshot: null, actions: {} }),
}));
vi.mock('../src/renderer/hooks/useTheme', () => ({
  useTheme: () => ({ snapshot: { preference: 'mint-light', resolvedTheme: 'mint-light' } }),
}));
vi.mock('../src/renderer/hooks/useSessionDiagnosisDetail', () => ({
  useSessionDiagnosisDetail: () => ({ kind: 'idle' }),
}));
vi.mock('../src/renderer/components/lazyAppContentViews', () => ({
  LAZY_APP_CONTENT_VIEWS: {
    CostOptimizationView: () => null,
    PerformanceView: () => null,
  },
}));

const NOW = new Date(2026, 10, 26, 12);
const RANGE_LABEL = 'November 1, 2026 – November 15, 2026';
const makeSession = (id: string, day: number, totalTokens: number): UsageSession => {
  const startedAt = new Date(2026, 10, day, 10).toISOString();
  return {
    sessionId: id,
    startedAt,
    endedAt: startedAt,
    projectPath: 'C:\\fixture',
    projectName: 'fixture',
    usageSlices: [],
    turnOutcomes: [],
    eventCount: 1,
    sourceFile: `${id}.jsonl`,
    warnings: [],
    inputTokens: totalTokens,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    cachedInputTokens: 0,
    totalTokens,
  };
};
const HISTORY = [makeSession('historical', 2, 100), makeSession('today', 26, 400)];
const makeResult = (sessions = HISTORY): UsageScanResult => ({
  sessionsDir: 'C:\\fixture',
  scannedAt: NOW.toISOString(),
  summary: buildUsageSummary(sessions),
  warnings: [],
});

beforeEach(() => {
  vi.setSystemTime(NOW);
  // jsdom does not implement the modal top layer. Electron verifies actual native focus behavior.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  Reflect.deleteProperty(window, 'codexUsage');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});

const mountApp = (result = makeResult()) => {
  const getInitialUsage = vi.fn(async () => result);
  const scan = vi.fn(async () => result);
  const unsubscribe = () => vi.fn();
  const onUsageUpdated =
    vi.fn<(listener: (next: UsageScanResult) => void) => () => void>(unsubscribe);
  Object.defineProperty(window, 'codexUsage', {
    configurable: true,
    value: {
      getInitialUsage,
      scan,
      onUsageUpdated,
      budgets: { onNavigate: unsubscribe },
      window: { getState: async () => ({ isMaximized: false }), onStateChanged: unsubscribe },
      compressedData: {
        onUpdated: unsubscribe,
        getStatus: async () => ({
          sessionsDir: result.sessionsDir,
          phase: 'idle',
          discoveredCount: 0,
          unimportedCount: 0,
        }),
      },
    },
  });
  const renderer = render(
    <I18nextProvider i18n={createTestI18n('en')}>
      <App />
    </I18nextProvider>
  );
  return { ...renderer, getInitialUsage, scan, onUsageUpdated };
};

const periodButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Date range' })).getByRole('button', { name });

const openDialog = () => {
  fireEvent.click(periodButton('Custom'));
  const dialog = screen.getByRole('dialog', { name: 'Custom date range' });
  return {
    dialog,
    start: within(dialog).getByLabelText<HTMLInputElement>('Start date'),
    end: within(dialog).getByLabelText<HTMLInputElement>('End date'),
    apply: within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Apply' }),
  };
};

const fillDate = (input: HTMLInputElement, value: string) =>
  fireEvent.input(input, { target: { value } });

const totalTokens = () =>
  screen.getByText('Tokens', { selector: '.metric-copy p' }).parentElement?.querySelector('strong')
    ?.textContent;

describe('custom date range in the overview', () => {
  it('prefills, validates and applies from the existing scan, then discards edits on cancel or Esc', async () => {
    const { getInitialUsage, scan } = mountApp();
    await screen.findByRole('heading', { name: 'Overview' });

    const { start, end, apply } = openDialog();
    expect([start.value, end.value]).toEqual(['2026-10-28', '2026-11-26']);
    fillDate(start, '2026-11-16');
    fillDate(end, '2026-11-15');
    expect(screen.getByText('Start date must be on or before end date.')).toBeTruthy();
    expect(apply.disabled).toBe(true);
    fillDate(end, '2026-11-27');
    expect(screen.getByText('Choose dates on or before today.')).toBeTruthy();
    fillDate(start, '');
    expect(screen.getByText('Enter both dates.')).toBeTruthy();
    expect(periodButton('Month').getAttribute('aria-pressed')).toBe('true');

    fillDate(start, '2026-11-01');
    fillDate(end, '2026-11-15');
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText(new RegExp(`^${RANGE_LABEL} · By session start date$`))).toBeTruthy();
    expect(periodButton('Custom').getAttribute('aria-pressed')).toBe('true');
    expect(periodButton('Month').getAttribute('aria-pressed')).toBe('false');
    expect(totalTokens()).toBe('100');
    expect(getInitialUsage).toHaveBeenCalledOnce();
    expect(scan).not.toHaveBeenCalled();

    const edit = openDialog();
    expect([edit.start.value, edit.end.value]).toEqual(['2026-11-01', '2026-11-15']);
    fillDate(edit.start, '2026-11-02');
    fireEvent.click(within(edit.dialog).getByRole('button', { name: 'Cancel' }));
    const nextEdit = openDialog();
    expect(nextEdit.start.value).toBe('2026-11-01');
    fillDate(nextEdit.start, '2026-11-03');
    fireEvent(nextEdit.dialog, new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(periodButton('Custom').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the override across navigation and rescans, and restores only the preset on relaunch', async () => {
    saveUsagePeriodPreference('total', window.localStorage);
    const { container, onUsageUpdated, scan, unmount } = mountApp();
    await screen.findByRole('heading', { name: 'Overview' });
    const { start, end, apply } = openDialog();
    expect([start.value, end.value]).toEqual(['2026-11-02', '2026-11-26']);
    fillDate(start, '2026-11-01');
    fillDate(end, '2026-11-15');
    fireEvent.click(apply);

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    expect(screen.queryByRole('button', { name: 'Custom' })).toBeNull();
    expect(periodButton('Total').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(periodButton('Week'));
    fireEvent.click(screen.getByRole('button', { name: 'Cost Optimization' }));
    expect(useCostOptimizationSnapshot).toHaveBeenLastCalledWith('week', true);
    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    expect(periodButton('Custom').getAttribute('aria-pressed')).toBe('true');

    const chart = container.querySelector('.chart-panel');
    const updatedResult = makeResult([...HISTORY, makeSession('updated', 10, 200)]);
    scan.mockResolvedValueOnce(updatedResult);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh real-time data' }));
    await waitFor(() => expect(totalTokens()).toBe('300'));
    expect(container.querySelector('.chart-panel')).toBe(chart);

    const finalValue = container.querySelector('.metric-card strong');
    const [pushUpdate] = onUsageUpdated.mock.calls[0];
    act(() => pushUpdate({ ...updatedResult, scannedAt: '2026-11-26T13:00:00.000Z' }));
    expect(totalTokens()).toBe('300');
    expect(container.querySelector('.chart-panel')).toBe(chart);
    expect(container.querySelector('.metric-card strong')).toBe(finalValue);

    scan.mockRejectedValueOnce(new Error('Disk unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh real-time data' }));
    expect(await screen.findByText(/Disk unavailable/)).toBeTruthy();
    expect(periodButton('Custom').getAttribute('aria-pressed')).toBe('true');

    unmount();
    mountApp();
    await screen.findByRole('heading', { name: 'Overview' });
    expect(periodButton('Week').getAttribute('aria-pressed')).toBe('true');
    expect(periodButton('Custom').getAttribute('aria-pressed')).toBe('false');
  });

  it('replays only the plot graphics on each actual range change in a ready overview', async () => {
    saveUsagePeriodPreference('week', window.localStorage);
    const { container, onUsageUpdated } = mountApp();
    await screen.findByRole('heading', { name: 'Overview' });
    const graphics = () => container.querySelector('.trend-line')?.parentElement;
    const metricMotion = () => container.querySelector('.metric-card .animated-value');
    const initialPoint = container.querySelector('.trend-hit-target');
    const initialGraphics = graphics();
    expect(initialGraphics?.classList.contains('trend-range-enter')).toBe(false);
    expect(metricMotion()).toBeNull();

    fireEvent.click(periodButton('Month'));
    const monthGraphics = graphics();
    expect(monthGraphics?.classList.contains('trend-range-enter')).toBe(true);
    expect(totalTokens()).toBe('500');
    expect(metricMotion()).toBeNull();

    fireEvent.click(periodButton('Week'));
    const weekGraphics = graphics();
    expect(weekGraphics?.classList.contains('trend-range-enter')).toBe(true);
    expect(weekGraphics).not.toBe(monthGraphics);
    expect(weekGraphics).not.toBe(initialGraphics);
    expect(container.querySelector('.trend-hit-target')).toBe(initialPoint);
    expect(container.querySelector('.trend-peak-label')?.textContent).toBe('400');
    expect(periodButton('Week').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(periodButton('Week'));
    fireEvent.click(screen.getByRole('button', { name: 'Show 53 weeks' }));
    const [pushUpdate] = onUsageUpdated.mock.calls[0];
    act(() => pushUpdate(makeResult([...HISTORY, makeSession('updated', 26, 100)])));
    expect(graphics()).toBe(weekGraphics);
    expect(totalTokens()).toBe('500');
    expect(metricMotion()).toBeTruthy();

    const { start, end, apply } = openDialog();
    fillDate(start, '2026-11-26');
    fillDate(end, '2026-11-26');
    fireEvent.click(apply);
    const customGraphics = graphics();
    expect(customGraphics).not.toBe(weekGraphics);
    expect(customGraphics?.classList.contains('trend-range-enter')).toBe(true);
    expect(container.querySelectorAll('.trend-hit-target')).toHaveLength(1);
    expect(metricMotion()).toBeNull();

    fireEvent.click(openDialog().apply);
    const cancelled = openDialog();
    fillDate(cancelled.start, '2026-11-25');
    fireEvent(cancelled.dialog, new Event('cancel', { cancelable: true }));
    expect(graphics()).toBe(customGraphics);
    expect(totalTokens()).toBe('500');
  });

  it('shows the custom empty state with Total as the preset, and allows editing or returning to a preset', async () => {
    saveUsagePeriodPreference('total', window.localStorage);
    const { container } = mountApp();
    await screen.findByRole('heading', { name: 'Overview' });
    const { start, end, apply } = openDialog();
    fillDate(start, '2026-10-01');
    fillDate(end, '2026-10-01');
    fireEvent.click(apply);

    expect(
      screen.getByRole('heading', { name: 'No sessions in the selected date range' })
    ).toBeTruthy();
    expect(screen.getByText('October 1, 2026')).toBeTruthy();
    const edit = openDialog();
    expect(edit.start.value).toBe('2026-10-01');
    fireEvent.click(within(edit.dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.click(periodButton('Today'));
    expect(periodButton('Today').getAttribute('aria-pressed')).toBe('true');
    expect(periodButton('Custom').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeTruthy();
    expect(container.querySelector('.trend-range-enter')).toBeNull();
  });
});
