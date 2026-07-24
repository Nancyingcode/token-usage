import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProjectsView, { ProjectRow } from '../src/renderer/components/ProjectsView';
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

interface ProjectButtonProps {
  type: 'button';
  onClick: () => void;
}

describe('analytics tables', () => {
  it('renders session labels and warning status in Chinese', () => {
    const markup = renderWithI18n(<SessionsView sessions={[SESSION]} />, 'zh-CN');

    expect(markup).toContain('会话详情');
    expect(markup).toContain('状态');
    expect(markup).toContain('1 个警告');
  });

  it('renders project labels in Chinese', () => {
    const markup = renderWithI18n(
      <ProjectsView projects={[PROJECT]} onProjectSelect={vi.fn()} />,
      'zh-CN'
    );

    expect(markup).toContain('项目汇总');
    expect(markup).toContain('最后活跃');
    expect(markup).toContain('1,300');
    expect(markup).toContain('<button type="button" class="table-row project-table-row"');
  });

  it('uses a native button and reports the full project path', () => {
    const onSelect = vi.fn();
    const row = ProjectRow({
      project: PROJECT,
      max: PROJECT.totalTokens,
      locale: 'en',
      unknownDateLabel: 'Unknown date',
      onSelect,
    });

    expect(React.isValidElement<ProjectButtonProps>(row)).toBe(true);

    if (!React.isValidElement<ProjectButtonProps>(row)) {
      throw new Error('ProjectRow did not return a button element.');
    }

    expect(row.type).toBe('button');
    expect(row.props.type).toBe('button');
    row.props.onClick();
    expect(onSelect).toHaveBeenCalledWith('C:\\repo');
  });
});
