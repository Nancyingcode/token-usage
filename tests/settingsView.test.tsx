import React from 'react';
import { describe, expect, it } from 'vitest';
import SettingsView from '../src/renderer/components/SettingsView';
import type { UsageScanResult } from '../src/shared/usageTypes';
import { renderWithI18n } from './helpers/renderWithI18n';

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

describe('SettingsView', () => {
  it.each([
    ['en' as const, 'Local Read-only', 'Unable to read session file: permission denied'],
    ['zh-CN' as const, '本地只读', '无法读取会话文件：permission denied'],
  ])('renders settings and semantic warnings in %s', (locale, heading, warning) => {
    const markup = renderWithI18n(<SettingsView result={RESULT} />, locale);

    expect(markup).toContain(heading);
    expect(markup).toContain(warning);
    expect(markup).toContain('broken.jsonl');
  });
});
