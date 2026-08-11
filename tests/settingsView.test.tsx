// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SettingsView from '../src/renderer/components/SettingsView';
import type { UsageScanResult } from '../src/shared/usageTypes';
import type { ThemeSnapshot } from '../src/shared/theme';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

const RESULT: UsageScanResult = {
  sessionsDir: 'C:\\Codex\\sessions',
  scannedAt: '2026-07-24T00:00:00.000Z',
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
  warnings: [
    {
      sourceFile: 'broken.jsonl',
      code: 'session-file-unreadable',
      details: 'permission denied',
    },
  ],
};
const DATA_PATH_SETTINGS = {
  sessionsDir: 'C:\\Codex\\sessions',
  defaultSessionsDir: 'C:\\Users\\tester\\.codex\\sessions',
  usingDefault: false,
};
const THEME_SNAPSHOT: ThemeSnapshot = {
  preference: 'system',
  resolvedTheme: 'mint-light',
};
const THEME_PROPS = {
  themeSnapshot: THEME_SNAPSHOT,
  themePending: false,
  themeFeedback: null,
  onThemeChange: vi.fn(async () => undefined),
} as const;

describe('SettingsView', () => {
  it.each([
    ['en' as const, 'Local Read-only', 'Unable to read session file: permission denied'],
    ['zh-CN' as const, '本地只读', '无法读取会话文件：permission denied'],
  ])('renders settings and semantic warnings in %s', (locale, heading, warning) => {
    const markup = renderWithI18n(
      <SettingsView
        {...THEME_PROPS}
        result={RESULT}
        dataPathSettings={DATA_PATH_SETTINGS}
        onSelectDataPath={vi.fn()}
        onUpdateDataPath={vi.fn()}
        onResetDataPath={vi.fn()}
      />,
      locale
    );

    expect(markup).toContain(heading);
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="page-stack"');
    expect(markup).toContain(warning);
    expect(markup).toContain('broken.jsonl');
    expect(markup).toContain(locale === 'en' ? 'Save path' : '保存路径');
    expect(markup).toContain(locale === 'en' ? 'Choose folder' : '选择文件夹');
    expect(markup).toContain(locale === 'en' ? 'Restore default' : '恢复默认路径');
    expect(markup).toContain('readonly=""');
    expect(markup).toContain(
      'aria-describedby="usage-data-path-description usage-data-path-default"'
    );
  });

  it('saves a directory selected with the native picker and reports validation errors', async () => {
    const selectedPath = 'D:\\Selected\\sessions';
    const onSelectDataPath = vi.fn().mockResolvedValue(selectedPath);
    const onUpdateDataPath = vi.fn().mockRejectedValue({ code: 'path-unreadable' });
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SettingsView
          {...THEME_PROPS}
          result={RESULT}
          dataPathSettings={DATA_PATH_SETTINGS}
          onSelectDataPath={onSelectDataPath}
          onUpdateDataPath={onUpdateDataPath}
          onResetDataPath={vi.fn()}
        />
      </I18nextProvider>
    );

    expect((screen.getByLabelText('Sessions directory') as HTMLInputElement).readOnly).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Sessions directory') as HTMLInputElement).value).toBe(
        selectedPath
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save path' }));

    await waitFor(() => expect(onUpdateDataPath).toHaveBeenCalledWith(selectedPath));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Choose an existing, readable directory.'
    );
    expect(screen.getByLabelText('Sessions directory').getAttribute('aria-invalid')).toBe('true');
  });

  it('keeps the current path when the folder picker is canceled', async () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SettingsView
          {...THEME_PROPS}
          result={RESULT}
          dataPathSettings={DATA_PATH_SETTINGS}
          onSelectDataPath={vi.fn().mockResolvedValue(null)}
          onUpdateDataPath={vi.fn()}
          onResetDataPath={vi.fn()}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));

    await waitFor(() =>
      expect((screen.getByLabelText('Sessions directory') as HTMLInputElement).value).toBe(
        DATA_PATH_SETTINGS.sessionsDir
      )
    );
    expect((screen.getByRole('button', { name: 'Save path' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('asks for an app restart when the folder picker API is unavailable', async () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SettingsView
          {...THEME_PROPS}
          result={RESULT}
          dataPathSettings={DATA_PATH_SETTINGS}
          onSelectDataPath={vi.fn().mockRejectedValue(new TypeError('select is not a function'))}
          onUpdateDataPath={vi.fn()}
          onResetDataPath={vi.fn()}
        />
      </I18nextProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose folder' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Unable to open the folder picker. Restart the app and try again.'
    );
  });

  it('renders an accessible theme chooser and saves a selected theme', async () => {
    const onThemeChange = vi.fn(async () => undefined);
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SettingsView
          {...THEME_PROPS}
          dataPathSettings={DATA_PATH_SETTINGS}
          onSelectDataPath={vi.fn()}
          onUpdateDataPath={vi.fn()}
          onResetDataPath={vi.fn()}
          onThemeChange={onThemeChange}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect((screen.getByRole('radio', { name: /Follow system/ }) as HTMLInputElement).checked).toBe(
      true
    );

    fireEvent.click(screen.getByRole('radio', { name: /Deep Ocean/ }));
    await waitFor(() => expect(onThemeChange).toHaveBeenCalledWith('ocean-dark'));
  });

  it('announces saved and failed theme changes without relying on color', () => {
    const { rerender } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SettingsView
          {...THEME_PROPS}
          dataPathSettings={DATA_PATH_SETTINGS}
          onSelectDataPath={vi.fn()}
          onUpdateDataPath={vi.fn()}
          onResetDataPath={vi.fn()}
          themeFeedback="saved"
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('status').textContent).toContain('Theme saved');

    rerender(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SettingsView
          {...THEME_PROPS}
          dataPathSettings={DATA_PATH_SETTINGS}
          onSelectDataPath={vi.fn()}
          onUpdateDataPath={vi.fn()}
          onResetDataPath={vi.fn()}
          themeFeedback="error"
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('alert').textContent).toContain('Unable to save the theme');
  });
});
