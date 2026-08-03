import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProjectsView, { ProjectRow } from '../src/renderer/components/ProjectsView';
import SessionsView, { ProjectFilterChip } from '../src/renderer/components/SessionsView';
import { UNKNOWN_PROJECT_KEY } from '../src/shared/usageMath';
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

const LOWER_TOKEN_SESSION: UsageSession = {
  ...SESSION,
  sessionId: 'session-low',
  threadName: 'Low token session',
  startedAt: '2026-07-24T11:00:00.000Z',
  endedAt: '2026-07-24T11:10:00.000Z',
  totalTokens: 500,
  sourceFile: 'session-low.jsonl',
  warnings: [],
};

const HIGH_TOKEN_SESSION: UsageSession = {
  ...SESSION,
  threadName: 'High token session',
};

interface ProjectButtonProps {
  type: 'button';
  onClick: () => void;
}

interface FilterButtonProps {
  type: 'button';
  onClick: () => void;
  'aria-label': string;
}

describe('analytics tables', () => {
  it('renders session labels and warning status in Chinese', () => {
    const markup = renderWithI18n(
      <SessionsView
        sessions={[SESSION]}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
      />,
      'zh-CN'
    );

    expect(markup).toContain('会话详情');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="page-stack"');
    expect(markup).toContain('table-cell--numeric');
    expect(markup).toContain('状态');
    expect(markup).toContain('1 个警告');
  });

  it('renders project labels in Chinese', () => {
    const markup = renderWithI18n(
      <ProjectsView projects={[PROJECT]} onProjectSelect={vi.fn()} />,
      'zh-CN'
    );

    expect(markup).toContain('项目汇总');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('table-cell--numeric');
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

  it('renders a project filter and token-ordered matching sessions', () => {
    const markup = renderWithI18n(
      <SessionsView
        sessions={[LOWER_TOKEN_SESSION, HIGH_TOKEN_SESSION]}
        selectedProjectPath={'C:\\repo'}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toContain('Project: repo');
    expect(markup).toContain('title="C:\\repo"');
    expect(markup.indexOf('High token session')).toBeLessThan(markup.indexOf('Low token session'));
  });

  it('renders a clear action when the selected project has no sessions', () => {
    const markup = renderWithI18n(
      <SessionsView
        sessions={[SESSION]}
        selectedProjectPath={'C:\\other'}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toContain('No sessions for this project in this period');
    expect(markup).toContain('Show all sessions');
  });

  it('reports clear-filter clicks with a localized accessible name', () => {
    const onClear = vi.fn();
    const chip = ProjectFilterChip({
      projectPath: 'C:\\repo',
      label: 'Project: repo',
      clearLabel: 'Clear project filter for repo',
      onClear,
    });

    expect(React.isValidElement<FilterButtonProps>(chip)).toBe(true);

    if (!React.isValidElement<FilterButtonProps>(chip)) {
      throw new Error('ProjectFilterChip did not return a button element.');
    }

    expect(chip.props['aria-label']).toBe('Clear project filter for repo');
    chip.props.onClick();
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders the Unknown Project filter in Chinese', () => {
    const markup = renderWithI18n(
      <SessionsView
        sessions={[{ ...SESSION, projectPath: '', projectName: UNKNOWN_PROJECT_KEY }]}
        selectedProjectPath={UNKNOWN_PROJECT_KEY}
        onClearProjectFilter={vi.fn()}
      />,
      'zh-CN'
    );

    expect(markup).toContain(UNKNOWN_PROJECT_KEY);
  });
});
