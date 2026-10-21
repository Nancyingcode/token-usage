// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CompressedDataPanel from '../src/renderer/components/CompressedDataPanel';
import type { CompressedDataStatus } from '../src/shared/compressedDataTypes';
import { createTestI18n } from './helpers/renderWithI18n';
import { formatShortDateTime } from '../src/renderer/utils/formatters';

const STATUS: CompressedDataStatus = {
  sessionsDir: 'C:\\sessions',
  phase: 'idle',
  discoveredCount: 3,
  unimportedCount: 2,
  importedCount: 1,
  processedCount: 0,
  totalCount: 0,
  lastImportedAt: '2026-10-20T08:00:00.000Z',
};

afterEach(cleanup);

describe('CompressedDataPanel', () => {
  it('offers manual import without requiring any real-time sessions and separates timestamps', () => {
    const onRefresh = vi.fn();
    const scannedAt = '2026-10-21T12:00:00.000Z';
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <CompressedDataPanel
          status={STATUS}
          pending={false}
          onRefresh={onRefresh}
          scannedAt={scannedAt}
        />
      </I18nextProvider>
    );

    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.getByText('Real-time data + imported compressed data')).toBeTruthy();
    expect(screen.getByText(/Unimported compressed files are not included/)).toBeTruthy();
    expect(screen.getByText(formatShortDateTime(scannedAt, 'en'))).toBeTruthy();
    expect(screen.getByText(formatShortDateTime(STATUS.lastImportedAt!, 'en'))).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Refresh compressed data' });
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it.each(['checking', 'importing'] as const)(
    'disables importing while %s and announces progress',
    (phase) => {
      render(
        <I18nextProvider i18n={createTestI18n('en')}>
          <CompressedDataPanel
            status={{ ...STATUS, phase, processedCount: 1, totalCount: 3 }}
            pending={false}
            onRefresh={vi.fn()}
          />
        </I18nextProvider>
      );

      expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('status').textContent).toContain('1 / 3');
    }
  );

  it('keeps existing local copies visible after compressed source files disappear', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <CompressedDataPanel
          status={{ ...STATUS, discoveredCount: 0, unimportedCount: 0 }}
          pending={false}
          onRefresh={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('region', { name: 'Compressed session data' })).toBeTruthy();
    expect(screen.getByText('Local copies')).toBeTruthy();
    expect(screen.queryByText(/Unimported compressed files are not included/)).toBeNull();
  });

  it('reports partial failures and the retained-data scope in Chinese', () => {
    render(
      <I18nextProvider i18n={createTestI18n('zh-CN')}>
        <CompressedDataPanel
          status={{
            ...STATUS,
            phase: 'partial',
            report: {
              added: 1,
              updated: 2,
              unchanged: 3,
              failures: [{ sourceFile: 'broken.jsonl.zst', message: 'Truncated frame' }],
            },
          }}
          pending={false}
          onRefresh={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('button', { name: '刷新压缩数据' })).toBeTruthy();
    expect(screen.getByText('实时数据 + 已导入的压缩数据')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('部分文件导入失败');
    expect(screen.getByText('新增 1 · 更新 2 · 未变化 3 · 失败 1')).toBeTruthy();
    expect(screen.getByText(/broken.jsonl.zst/)).toBeTruthy();
    expect(screen.getByText(/Truncated frame/)).toBeTruthy();
  });

  it('shows a recoverable status-read error even before a snapshot is available', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <CompressedDataPanel
          status={null}
          error="Manifest unavailable"
          pending={false}
          onRefresh={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('alert').textContent).toContain('Manifest unavailable');
    expect(screen.getByRole('button', { name: 'Refresh compressed data' })).toBeTruthy();
  });

  it('allows retry after a transport error even if the last progress snapshot was importing', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <CompressedDataPanel
          status={{ ...STATUS, phase: 'importing' }}
          error="IPC unavailable"
          pending={false}
          onRefresh={vi.fn()}
        />
      </I18nextProvider>
    );
    expect(
      screen.getByRole('button', { name: 'Refresh compressed data' }).hasAttribute('disabled')
    ).toBe(false);
    expect(screen.getByRole('status').textContent).toContain('This refresh did not complete');
  });

  it('hides the panel when there are no compressed sources, local copies or errors', () => {
    const { container } = render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <CompressedDataPanel
          status={{ ...STATUS, discoveredCount: 0, importedCount: 0, unimportedCount: 0 }}
          pending={false}
          onRefresh={vi.fn()}
        />
      </I18nextProvider>
    );
    expect(container.textContent).toBe('');
  });
});
