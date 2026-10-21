// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/renderer/App';
import type { CompressedDataStatus } from '../src/shared/compressedDataTypes';
import type { UsageScanResult } from '../src/shared/usageTypes';
import { createTestI18n } from './helpers/renderWithI18n';

vi.mock('../src/renderer/components/AppContent', () => ({
  default: ({ activeView, model }: { activeView: string; model: { kind: string } }) => (
    <div>{`${activeView}:${model.kind}`}</div>
  ),
}));
vi.mock('../src/renderer/components/TitleBar', () => ({ default: () => null }));
vi.mock('../src/renderer/hooks/useBudgetSnapshot', () => ({
  useBudgetSnapshot: () => ({ loading: false, snapshot: null, actions: {} }),
}));
vi.mock('../src/renderer/hooks/useTheme', () => ({
  useTheme: () => ({ snapshot: { preference: 'mint-light', resolvedTheme: 'mint-light' } }),
}));
vi.mock('../src/renderer/hooks/useSessionDiagnosisDetail', () => ({
  useSessionDiagnosisDetail: () => ({ kind: 'loading' }),
}));
vi.mock('../src/renderer/hooks/useCostOptimizationSnapshot', () => ({
  useCostOptimizationSnapshot: () => ({ loading: false, setProjectPath: vi.fn() }),
}));

const EMPTY_RESULT: UsageScanResult = {
  sessionsDir: 'C:\\sessions',
  scannedAt: '2026-10-21T12:00:00.000Z',
  summary: {
    totals: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
    byDay: [],
    byProject: [],
    sessions: [],
  },
  warnings: [],
};
const STATUS: CompressedDataStatus = {
  sessionsDir: EMPTY_RESULT.sessionsDir,
  phase: 'idle',
  discoveredCount: 1,
  importedCount: 0,
  unimportedCount: 1,
  processedCount: 0,
  totalCount: 0,
};

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'codexUsage');
});

describe('compressed data in the application shell', () => {
  it('keeps manual import and the coverage notice visible with empty data and across analysis pages', async () => {
    const refreshCompressed = vi.fn(async () => STATUS);
    let usageListener: ((result: UsageScanResult) => void) | undefined;
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        getInitialUsage: vi.fn(async () => EMPTY_RESULT),
        onUsageUpdated: (listener: (result: UsageScanResult) => void) => {
          usageListener = listener;
          return vi.fn();
        },
        compressedData: {
          getStatus: vi.fn(async () => STATUS),
          refresh: refreshCompressed,
          onUpdated: () => vi.fn(),
        },
        budgets: { onNavigate: () => vi.fn() },
      },
    });
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <App />
      </I18nextProvider>
    );

    await screen.findByText('overview:empty');
    expect(screen.getByRole('button', { name: 'Refresh compressed data' })).toBeTruthy();
    expect(refreshCompressed).not.toHaveBeenCalled();
    act(() => usageListener?.({ ...EMPTY_RESULT, scannedAt: '2026-10-21T12:01:00.000Z' }));
    expect(refreshCompressed).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Budgets/ }));
    expect(screen.getByText('Real-time data + imported compressed data')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Cost Optimization/ }));
    expect(
      screen.getByText(/Pending files are excluded from totals/).closest('[hidden]')
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh compressed data' }));
    await waitFor(() => expect(refreshCompressed).toHaveBeenCalledOnce());
  });
});
