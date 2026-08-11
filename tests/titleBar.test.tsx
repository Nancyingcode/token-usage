// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TitleBar from '../src/renderer/components/TitleBar';
import { createTestI18n } from './helpers/renderWithI18n';

const windowApi = {
  minimize: vi.fn(async () => undefined),
  toggleMaximize: vi.fn(async () => ({ isMaximized: true })),
  close: vi.fn(async () => undefined),
  getState: vi.fn(async () => ({ isMaximized: false })),
  onStateChanged: vi.fn(),
};

const createTitleBarProps = (): React.ComponentProps<typeof TitleBar> => ({
  activeView: 'overview',
  loading: false,
  error: null,
  scannedAt: '2026-08-03T08:00:00.000Z',
  onRefresh: vi.fn(),
  period: 'month',
  onPeriodChange: vi.fn(),
});

describe('TitleBar', () => {
  beforeEach(() => {
    windowApi.minimize.mockClear();
    windowApi.toggleMaximize.mockClear();
    windowApi.close.mockClear();
    windowApi.getState.mockReset().mockResolvedValue({ isMaximized: false });
    windowApi.onStateChanged.mockReset().mockReturnValue(() => undefined);
    window.codexUsage = { window: windowApi } as unknown as Window['codexUsage'];
  });

  it('renders accessible window controls and invokes the isolated API', async () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <TitleBar {...createTitleBarProps()} />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Maximize' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(windowApi.minimize).toHaveBeenCalledOnce();
    expect(windowApi.toggleMaximize).toHaveBeenCalledOnce();
    expect(windowApi.close).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore' })).toBeTruthy());
  });

  it('tracks native maximize changes and cleans up its subscription', async () => {
    let stateListener: ((state: { isMaximized: boolean }) => void) | undefined;
    const unsubscribe = vi.fn();
    windowApi.getState.mockResolvedValue({ isMaximized: true });
    windowApi.onStateChanged.mockImplementation((listener) => {
      stateListener = listener;
      return unsubscribe;
    });

    const view = render(
      <I18nextProvider i18n={createTestI18n('zh-CN')}>
        <TitleBar {...createTitleBarProps()} />
      </I18nextProvider>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: '还原' })).toBeTruthy());
    act(() => stateListener?.({ isMaximized: false }));
    await waitFor(() => expect(screen.getByRole('button', { name: '最大化' })).toBeTruthy());

    view.unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps usage controls inside the single custom title bar', async () => {
    const { container } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <TitleBar {...createTitleBarProps()} />
      </I18nextProvider>
    );

    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(screen.getByText('Local data synced')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Month' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Minimize' })).toBeTruthy();
    await waitFor(() => expect(windowApi.getState).toHaveBeenCalledOnce());
  });
});
