import React from 'react';
import { describe, expect, it } from 'vitest';
import ProjectsView from '../src/renderer/components/ProjectsView';
import SessionsView from '../src/renderer/components/SessionsView';
import type { UsageProject, UsageSession } from '../src/shared/usageTypes';
import { renderWithI18n } from './helpers/renderWithI18n';

const SESSION: UsageSession = {
  sessionId: 'session-123456789',
  startedAt: '2026-07-24T10:00:00.000Z',
  endedAt: '2026-07-24T10:10:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  inputTokens: 1_000,
  cachedInputTokens: 200,
  outputTokens: 300,
  reasoningOutputTokens: 50,
  totalTokens: 1_300,
  eventCount: 1,
  sourceFile: 'session.jsonl',
  warnings: [{ code: 'malformed-jsonl' }],
};

const PROJECT: UsageProject = {
  projectPath: 'C:\\repo',
  projectName: 'repo',
  sessionCount: 1,
  lastActivityAt: '2026-07-24T10:00:00.000Z',
  inputTokens: 1_000,
  cachedInputTokens: 200,
  outputTokens: 300,
  reasoningOutputTokens: 50,
  totalTokens: 1_300,
  shareOfTotal: 1,
};

describe('analytics tables', () => {
  it('renders session labels and warning status in Chinese', () => {
    const markup = renderWithI18n(<SessionsView sessions={[SESSION]} />, 'zh-CN');

    expect(markup).toContain('会话详情');
    expect(markup).toContain('状态');
    expect(markup).toContain('1 个警告');
  });

  it('renders project labels in Chinese', () => {
    const markup = renderWithI18n(<ProjectsView projects={[PROJECT]} />, 'zh-CN');

    expect(markup).toContain('项目汇总');
    expect(markup).toContain('最后活跃');
    expect(markup).toContain('1,300');
  });
});
