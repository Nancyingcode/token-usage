// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import ProjectsView from '../src/renderer/components/ProjectsView';
import SessionsView, { ProjectFilterChip } from '../src/renderer/components/SessionsView';
import { UNKNOWN_PROJECT_KEY } from '../src/shared/usageMath';
import type { UsageProject, UsageSession } from '../src/shared/usageTypes';
import { createTestI18n, renderWithI18n } from './helpers/renderWithI18n';

const SESSION: UsageSession = {
  sessionId: 'session-123456789',
  startedAt: '2026-07-24T10:00:00.000Z',
  endedAt: '2026-07-24T10:10:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  turnOutcomes: [],
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

const OTHER_PROJECT: UsageProject = {
  ...PROJECT,
  projectPath: 'C:\\other',
  projectName: 'other',
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
    expect(markup).toContain('project-donut-chart');
    expect(markup).toContain('aria-label=');
    expect(markup).toContain('1,300');
    expect(markup).not.toContain('project-table-row');
    expect(markup).not.toContain('data-table');
  });

  it('shows project details on hover and focus, then hides them on exit', () => {
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={[PROJECT]} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );

    const segment = screen.getByRole('button', {
      name: /repo.*100(?:\.0)?%.*1,300 tokens.*1 session/i,
    });

    fireEvent.pointerEnter(segment);
    expect(screen.getByRole('tooltip').textContent).toContain('C:\\repo');
    expect(screen.getByRole('tooltip').textContent).toContain('100.0%');
    fireEvent.pointerLeave(segment);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(segment);
    expect(screen.getByRole('tooltip').textContent).toContain('Last Active');
    fireEvent.blur(segment);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('maps project colors to a legend with names and percentages', () => {
    const onSelect = vi.fn();
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={[PROJECT, OTHER_PROJECT]} onProjectSelect={onSelect} />
      </I18nextProvider>
    );

    const legend = screen.getByRole('list', { name: 'Project legend' });
    const repoLegendItem = within(legend).getByRole('button', {
      name: 'Legend: repo, 50.0%. Open project sessions.',
    });
    const otherLegendItem = within(legend).getByRole('button', {
      name: 'Legend: other, 50.0%. Open project sessions.',
    });
    const repoSegment = screen.getByRole('button', {
      name: /repo.*50\.0%.*1,300 tokens.*1 session/i,
    });

    expect(repoLegendItem.className).toContain('project-donut-tone-1');
    expect(otherLegendItem.className).toContain('project-donut-tone-2');
    expect(repoLegendItem.textContent).toContain('repo');
    expect(repoLegendItem.textContent).toContain('50.0%');

    fireEvent.pointerEnter(repoLegendItem);
    expect(repoSegment.classList.contains('is-active')).toBe(true);
    expect(screen.getByRole('tooltip').textContent).toContain('C:\\repo');
    fireEvent.pointerLeave(repoLegendItem);

    fireEvent.click(otherLegendItem);
    expect(onSelect).toHaveBeenCalledWith('C:\\other');
  });

  it('reports the full project path for click, Enter, and Space activation', () => {
    const onSelect = vi.fn();
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={[PROJECT]} onProjectSelect={onSelect} />
      </I18nextProvider>
    );

    const segment = screen.getByRole('button', {
      name: /repo.*100(?:\.0)?%.*1,300 tokens.*1 session/i,
    });
    fireEvent.click(segment);
    fireEvent.keyDown(segment, { key: 'Enter' });
    fireEvent.keyDown(segment, { key: ' ' });

    expect(onSelect).toHaveBeenNthCalledWith(1, 'C:\\repo');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'C:\\repo');
    expect(onSelect).toHaveBeenNthCalledWith(3, 'C:\\repo');
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
