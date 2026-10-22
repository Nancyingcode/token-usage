// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateSettings } from '../src/renderer/components/AppUpdateSettings';
import type { AppUpdateApi, AppUpdateSnapshot } from '../src/shared/appUpdateTypes';
import type { SupportedLocale } from '../src/shared/i18n/locale';
import { createTestI18n } from './helpers/renderWithI18n';

const mount = (
  snapshot: AppUpdateSnapshot,
  locale: SupportedLocale = 'en',
  overrides: Partial<AppUpdateApi> = {}
) => {
  let listener: (snapshot: AppUpdateSnapshot) => void = () => undefined;
  const api: AppUpdateApi = {
    get: vi.fn(async () => snapshot),
    check: vi.fn(async () => snapshot),
    download: vi.fn(async () => snapshot),
    install: vi.fn(async () => snapshot),
    openReleasePage: vi.fn(async () => undefined),
    onUpdated: (callback) => {
      listener = callback;
      return () => undefined;
    },
    ...overrides,
  };
  Object.defineProperty(window, 'codexUsage', { configurable: true, value: { appUpdate: api } });
  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <AppUpdateSettings />
    </I18nextProvider>
  );
  return { api, update: (next: AppUpdateSnapshot) => act(() => listener(next)) };
};

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'codexUsage');
});

describe('AppUpdateSettings', () => {
  it.each([
    ['en', 'Version and updates', 'Check for updates', 'Download installer / repair'],
    ['zh-CN', '版本与更新', '检查更新', '下载安装包 / 修复'],
  ] as const)(
    'shows manual controls and the offline repair entry in %s',
    async (locale, title, check, repair) => {
      const { api } = mount({ revision: 0, phase: 'idle', currentVersion: '0.1.0' }, locale);
      await screen.findByText('0.1.0');
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(api.check).not.toHaveBeenCalled();
      expect(api.download).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: check }));
      await waitFor(() => expect(api.check).toHaveBeenCalledOnce());
      fireEvent.click(screen.getByRole('button', { name: repair }));
      await waitFor(() => expect(api.openReleasePage).toHaveBeenCalledWith());
    }
  );

  it('downloads only on request, shows progress and requests native installation confirmation', async () => {
    const available: AppUpdateSnapshot = {
      revision: 1,
      phase: 'available',
      currentVersion: '0.1.0',
      targetVersion: '0.2.0',
      releaseNotes: '<img src=x onerror=alert(1)>Plain release notes',
    };
    const { api, update } = mount(available);
    await screen.findByText('0.2.0');
    expect(screen.getByText(available.releaseNotes ?? '').querySelector('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Restart and install' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
    await waitFor(() => expect(api.download).toHaveBeenCalledWith());
    update({
      ...available,
      revision: 2,
      phase: 'downloading',
      progress: { percent: 25, transferred: 25, total: 100 },
    });
    expect((screen.getByRole('progressbar') as HTMLProgressElement).value).toBe(25);
    expect(
      (screen.getByRole('button', { name: 'Check for updates' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(api.install).not.toHaveBeenCalled();
    update({ ...available, revision: 3, phase: 'downloaded' });
    fireEvent.click(screen.getByRole('button', { name: 'Restart and install' }));
    await waitFor(() => expect(api.install).toHaveBeenCalledWith());
  });

  it('shows a signed-build requirement while leaving offline repair available', async () => {
    const { api } = mount(
      {
        revision: 0,
        currentVersion: '0.1.0',
        phase: 'unavailable',
        unavailableReason: 'publisher-missing',
      },
      'zh-CN'
    );
    await screen.findByText('0.1.0');
    expect(screen.getByRole('status').textContent).toContain('发布者');
    expect((screen.getByRole('button', { name: '检查更新' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    fireEvent.click(screen.getByRole('button', { name: '下载安装包 / 修复' }));
    await waitFor(() => expect(api.openReleasePage).toHaveBeenCalledOnce());
  });

  it('announces failures and provides an explicit retry instead of installing automatically', async () => {
    const { api } = mount({
      revision: 4,
      currentVersion: '0.1.0',
      targetVersion: '0.2.0',
      phase: 'error',
      error: 'download-failed',
    });
    await screen.findByText('0.1.0');
    expect(screen.getByRole('alert').textContent).toContain('Download');
    expect(api.download).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry download' }));
    await waitFor(() => expect(api.download).toHaveBeenCalledOnce());
    expect(api.install).not.toHaveBeenCalled();
  });

  it('allows a fresh check after the initial status request fails', async () => {
    const { api } = mount({ revision: 0, currentVersion: '0.1.0', phase: 'idle' }, 'en', {
      get: vi.fn().mockRejectedValue(new Error('IPC temporarily unavailable')),
    });
    await screen.findByRole('alert');
    const check = screen.getByRole('button', { name: 'Check for updates' }) as HTMLButtonElement;
    expect(check.disabled).toBe(false);
    fireEvent.click(check);
    await waitFor(() => expect(api.check).toHaveBeenCalledOnce());
    await screen.findByText('0.1.0');
  });
});
