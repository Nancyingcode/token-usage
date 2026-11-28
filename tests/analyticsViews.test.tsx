// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import ProjectsView from '../src/renderer/components/ProjectsView';
import SessionsView, { ProjectFilterChip } from '../src/renderer/components/SessionsView';
import { UNKNOWN_PROJECT_KEY } from '../src/shared/usageMath';
import type { UsageProject, UsageSession } from '../src/shared/usageTypes';
import { makeDiagnosisSummary, makeFindingSummary } from './helpers/sessionDiagnosisFixtures';
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

const chooseSelectOption = (controlName: string, optionName: string): void => {
  fireEvent.click(screen.getByRole('combobox', { name: controlName }));
  fireEvent.click(screen.getByRole('option', { name: optionName }));
};

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
    expect(markup).toContain('project-summary-grid');
    expect(markup).toContain('project-table');
    expect(markup).toContain('table-cell--numeric');
  });

  it('localizes the unknown project identity in the project workspace', () => {
    const markup = renderWithI18n(
      <ProjectsView
        projects={[
          {
            ...PROJECT,
            projectPath: UNKNOWN_PROJECT_KEY,
            projectName: UNKNOWN_PROJECT_KEY,
          },
        ]}
        onProjectSelect={vi.fn()}
      />,
      'zh-CN'
    );

    expect(markup).toContain('未知项目');
    expect(markup).not.toContain('>Unknown Project<');
  });

  it('renders project summary metrics and an explicit session action', () => {
    const onSelect = vi.fn();
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView
          projects={[PROJECT, { ...OTHER_PROJECT, totalTokens: 700 }]}
          onProjectSelect={onSelect}
        />
      </I18nextProvider>
    );

    expect(screen.getByRole('region', { name: 'Project overview' }).textContent).toContain(
      '2 projects'
    );
    expect(screen.getByRole('table', { name: 'Project list' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View sessions for repo' }));
    expect(onSelect).toHaveBeenCalledWith('C:\\repo');
  });

  it('opens project row metrics independently of the session action and resets on sorting', () => {
    const onSelect = vi.fn();
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <ProjectsView projects={[PROJECT, OTHER_PROJECT]} onProjectSelect={onSelect} />
      </I18nextProvider>
    );

    const toggle = screen.getByLabelText('Details for repo');
    const details = toggle.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(toggle);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('PathC:\\repo');
    expect(details.textContent).toContain('Share50.0%');
    expect(details.textContent).toContain('Sessions1');
    expect(details.textContent).toContain('Avg. tokens/session1,300');
    expect(details.textContent).toContain('Cache share20%');
    expect(details.textContent).toContain('Last Active');
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'View sessions for repo' }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('C:\\repo');
    expect(details.open).toBe(true);

    chooseSelectOption('Sort projects', 'Project name');
    expect(screen.getByLabelText('Details for other').closest('details')?.open).toBe(false);
    expect(screen.getByLabelText('Details for repo').closest('details')?.open).toBe(false);
  });

  it('searches by project path and clears a no-results state', () => {
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={[PROJECT, OTHER_PROJECT]} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), {
      target: { value: 'other' },
    });
    expect(screen.getByRole('button', { name: 'View sessions for other' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'View sessions for repo' })).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), {
      target: { value: 'missing' },
    });
    expect(screen.getByText('No matching projects')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('button', { name: 'View sessions for repo' })).toBeTruthy();
  });

  it('keeps matching project rows open while typing and clearing search', () => {
    const projects = Array.from({ length: 8 }, (_, index) => ({
      ...PROJECT,
      projectName: `Shared project ${index + 1}`,
      projectPath: `C:/shared-project-${index + 1}`,
    }));
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <ProjectsView projects={projects} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );
    const detail = () => screen.getByLabelText('Details for Shared project 1');
    const toggle = detail();
    const row = toggle.closest('tr');
    const search = screen.getByRole('searchbox', { name: 'Search projects' });
    const overview = screen.getByRole('region', { name: 'Project overview' });
    fireEvent.click(toggle);
    search.focus();

    for (const [query, count] of [
      ['sha', 8],
      ['shared project 1', 1],
      ['shared project ', 8],
      ['', 8],
    ] as const) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByText(`Showing ${count} of 8 projects`)).toBeTruthy();
      expect(document.activeElement).toBe(search);
      expect(detail()).toBe(toggle);
      expect(detail().closest('tr')).toBe(row);
      expect(detail().closest('details')?.open).toBe(true);
      expect(overview.textContent).toContain('8 projects');
    }

    fireEvent.change(search, { target: { value: 'no such project' } });
    expect(screen.getByText('No matching projects')).toBeTruthy();
    expect(toggle.isConnected).toBe(false);
    fireEvent.change(search, { target: { value: '' } });
    expect(detail().closest('details')?.open).toBe(false);
  });

  it('sorts the complete project list by project name', () => {
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={[PROJECT, OTHER_PROJECT]} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );

    chooseSelectOption('Sort projects', 'Project name');
    const table = screen.getByRole('table', { name: 'Project list' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1].textContent).toContain('other');
    expect(rows[2].textContent).toContain('repo');
  });

  it('gives only a changed project sort one table body entrance', () => {
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <ProjectsView projects={[PROJECT, OTHER_PROJECT]} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );
    const table = screen.getByRole('table', { name: 'Project list' });
    expect(table.querySelector('.results-enter')).toBeNull();
    chooseSelectOption('Sort projects', 'Project name');
    expect(table.querySelectorAll('.results-enter')).toHaveLength(1);
    expect(table.querySelector('tbody.results-enter')).toBeTruthy();
    expect(table.querySelector('.motion-list-item')).toBeNull();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search projects' }), {
      target: { value: 'repo' },
    });
    expect(table.querySelector('.results-enter')).toBeNull();
    chooseSelectOption('Sort projects', 'Project name');
    expect(table.querySelector('.results-enter')).toBeNull();
  });

  it('keeps the focused project detail through a background reorder and falls back on removal', () => {
    const i18n = createTestI18n('en');
    const other = { ...OTHER_PROJECT, totalTokens: 800 };
    const added = { ...PROJECT, projectName: 'added', projectPath: 'C:\\added', totalTokens: 600 };
    const view = (projects: UsageProject[]) => (
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={projects} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );
    const { rerender } = render(view([PROJECT, other]));
    const toggle = screen.getByLabelText('Details for repo');
    const row = toggle.closest('tr');
    const table = screen.getByRole('table', { name: 'Project list' });
    fireEvent.click(toggle);
    toggle.focus();

    rerender(view([PROJECT, other, added]));
    expect(document.activeElement).toBe(toggle);
    rerender(view([{ ...PROJECT, totalTokens: 500 }, other, added]));
    expect(within(table).getAllByRole('row').at(-1)).toBe(row);
    expect(row?.textContent).toContain('500');
    expect(screen.getByLabelText('Details for repo')).toBe(toggle);
    expect(toggle.closest('details')?.open).toBe(true);
    expect(document.activeElement).toBe(toggle);

    rerender(view([other, added]));
    expect(toggle.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search projects' }));
  });

  it('does not take back project table focus after the user moves elsewhere', () => {
    const i18n = createTestI18n('en');
    const view = (projects: UsageProject[], showProjects = true) => (
      <I18nextProvider i18n={i18n}>
        <button type="button">Elsewhere</button>
        {showProjects ? <ProjectsView projects={projects} onProjectSelect={vi.fn()} /> : null}
      </I18nextProvider>
    );
    const { rerender } = render(view([PROJECT, OTHER_PROJECT]));
    const action = screen.getByRole('button', { name: 'View sessions for repo' });
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    action.focus();
    elsewhere.focus();
    rerender(view([OTHER_PROJECT]));
    expect(document.activeElement).toBe(elsewhere);

    rerender(view([OTHER_PROJECT], false));
    expect(document.activeElement).toBe(elsewhere);
  });

  it('combines projects beyond the top seven into a non-navigable chart entry', () => {
    const projects = Array.from({ length: 9 }, (_, index) => ({
      ...PROJECT,
      projectPath: `C:\\project-${index + 1}`,
      projectName: `project-${index + 1}`,
      totalTokens: 1_000 - index * 50,
    }));
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView projects={projects} onProjectSelect={vi.fn()} />
      </I18nextProvider>
    );

    expect(screen.getByText('Other projects')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /View sessions for Other projects/i })).toBeNull();
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

  it('truncates an overlong donut total and exposes the full value in a tooltip', () => {
    const i18n = createTestI18n('en');
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <ProjectsView
          projects={[{ ...PROJECT, totalTokens: Number.MAX_SAFE_INTEGER }]}
          onProjectSelect={vi.fn()}
        />
      </I18nextProvider>
    );
    const center = container.querySelector<HTMLElement>('.project-donut-center');
    const total = center?.querySelector('strong');

    expect(center?.tabIndex).toBe(0);
    expect(total?.classList.contains('project-donut-center-value')).toBe(true);

    fireEvent.pointerEnter(center as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toContain('9,007,199,254,740,991');
    fireEvent.pointerLeave(center as HTMLElement);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(center as HTMLElement);
    expect(screen.getByRole('tooltip').textContent).toContain('9,007,199,254,740,991');
    fireEvent.blur(center as HTMLElement);
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

  it('combines project, diagnosis cause, and severity filters', () => {
    const onProjectFilterChange = vi.fn();
    const cacheSession: UsageSession = {
      ...SESSION,
      sessionId: 'cache-session',
      threadName: 'Cache session',
      projectPath: 'C:\\other',
      projectName: 'other',
      sourceFile: 'cache.jsonl',
    };
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <SessionsView
          sessions={[SESSION, cacheSession]}
          selectedProjectPath={null}
          onProjectFilterChange={onProjectFilterChange}
          onClearProjectFilter={vi.fn()}
          globalDiagnostics={[
            makeDiagnosisSummary('session-123456789', {
              sourceFile: 'session.jsonl',
              primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
            }),
            makeDiagnosisSummary('cache-session', {
              sourceFile: 'cache.jsonl',
              primaryFinding: makeFindingSummary('cache-degradation', 'warning', 'medium'),
            }),
          ]}
        />
      </I18nextProvider>
    );

    chooseSelectOption('Filter by project', 'other');
    expect(onProjectFilterChange).toHaveBeenCalledWith('C:\\other');

    chooseSelectOption('Filter by diagnosis cause', 'Cache reuse signal declined');
    chooseSelectOption('Filter by diagnosis severity', 'Warning');

    expect(screen.getByText('Cache session')).toBeTruthy();
    expect(screen.queryByTitle('session-123456789')).toBeNull();
  });

  it('searches sessions and clears all local filters', () => {
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <SessionsView
          sessions={[SESSION, LOWER_TOKEN_SESSION]}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
        />
      </I18nextProvider>
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search sessions' }), {
      target: { value: 'low token' },
    });
    expect(screen.getByText('Low token session')).toBeTruthy();
    expect(screen.queryByTitle('session-123456789')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Low token session')).toBeTruthy();
    expect(screen.getByTitle('session-123456789')).toBeTruthy();
  });

  it('keeps matching session rows open while typing and clearing search', () => {
    const sessions = Array.from({ length: 8 }, (_, index) => ({
      ...SESSION,
      sessionId: `shared-session-${index + 1}`,
      threadName: `Shared session ${index + 1}`,
      sourceFile: `shared-session-${index + 1}.jsonl`,
    }));
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SessionsView
          sessions={sessions}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
        />
      </I18nextProvider>
    );
    const detail = () => screen.getByLabelText('Details for Shared session 1');
    const toggle = detail();
    const row = toggle.closest('[role="row"]');
    const search = screen.getByRole('searchbox', { name: 'Search sessions' });
    fireEvent.click(toggle);
    search.focus();

    for (const [query, count] of [
      ['sha', 8],
      ['shared session 1', 1],
      ['shared session ', 8],
      ['', 8],
    ] as const) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getByText(`${count} of 8 sessions`)).toBeTruthy();
      expect(document.activeElement).toBe(search);
      expect(detail()).toBe(toggle);
      expect(detail().closest('[role="row"]')).toBe(row);
      expect(detail().closest('details')?.open).toBe(true);
    }

    fireEvent.change(search, { target: { value: 'no such session' } });
    expect(screen.getByText('No matching sessions')).toBeTruthy();
    expect(toggle.isConnected).toBe(false);
    fireEvent.change(search, { target: { value: '' } });
    expect(detail().closest('details')?.open).toBe(false);
  });

  it('opens session token and project details independently of diagnosis', () => {
    const onDiagnosisOpen = vi.fn();
    const diagnosis = makeDiagnosisSummary(HIGH_TOKEN_SESSION.sessionId, {
      sourceFile: HIGH_TOKEN_SESSION.sourceFile,
      primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
    });
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SessionsView
          sessions={[HIGH_TOKEN_SESSION]}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
          globalDiagnostics={[diagnosis]}
          onDiagnosisOpen={onDiagnosisOpen}
        />
      </I18nextProvider>
    );

    const toggle = screen.getByLabelText('Details for High token session');
    const details = toggle.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    fireEvent.click(toggle);
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('Input1,000');
    expect(details.textContent).toContain('Cached200');
    expect(details.textContent).toContain('Output300');
    expect(details.textContent).toContain('Projectrepo');
    expect(details.textContent).toContain('PathC:\\repo');
    expect(details.textContent).toContain('Date');
    expect(onDiagnosisOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Open diagnosis/i }));
    expect(onDiagnosisOpen).toHaveBeenCalledExactlyOnceWith(diagnosis);
    expect(details.open).toBe(true);

    fireEvent.click(toggle);
    expect(details.open).toBe(false);
  });

  it('keeps the session diagnosis button focused until a background update displaces its row', () => {
    const i18n = createTestI18n('en');
    const diagnosis = makeDiagnosisSummary(HIGH_TOKEN_SESSION.sessionId, {
      sourceFile: HIGH_TOKEN_SESSION.sourceFile,
      primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
    });
    const otherSessions = Array.from({ length: 9 }, (_, index) => ({
      ...LOWER_TOKEN_SESSION,
      sessionId: `larger-session-${index}`,
      sourceFile: `larger-session-${index}.jsonl`,
      totalTokens: 2_000 + index,
    }));
    const view = (sessions: UsageSession[]) => (
      <I18nextProvider i18n={i18n}>
        <SessionsView
          sessions={sessions}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
          globalDiagnostics={[diagnosis]}
        />
      </I18nextProvider>
    );
    const { rerender } = render(view([...otherSessions, HIGH_TOKEN_SESSION]));
    const button = screen.getByRole('button', { name: /Open diagnosis/i });
    button.focus();

    const updated = { ...HIGH_TOKEN_SESSION, totalTokens: 1_400 };
    rerender(view([...otherSessions, updated]));
    expect(screen.getByRole('button', { name: /Open diagnosis/i })).toBe(button);
    expect(button.closest('[role="row"]')?.textContent).toContain('1,400');
    expect(document.activeElement).toBe(button);

    rerender(view([{ ...LOWER_TOKEN_SESSION, totalTokens: 3_000 }, ...otherSessions, updated]));
    expect(button.isConnected).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search sessions' }));
  });

  it('paginates sessions and remembers the selected page size', () => {
    window.localStorage.clear();
    const sessions = Array.from({ length: 12 }, (_, index) => ({
      ...SESSION,
      sessionId: `session-${index + 1}`,
      threadName: `Session ${index + 1}`,
      sourceFile: `session-${index + 1}.jsonl`,
    }));
    const i18n = createTestI18n('en');
    render(
      <I18nextProvider i18n={i18n}>
        <SessionsView
          sessions={sessions}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
        />
      </I18nextProvider>
    );

    expect(screen.getByText('Session 10')).toBeTruthy();
    expect(screen.queryByText('Session 11')).toBeNull();
    const firstDetailsToggle = screen.getByLabelText('Details for Session 1');
    fireEvent.click(firstDetailsToggle);
    expect(firstDetailsToggle.closest('details')?.open).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Previous page' }) as HTMLButtonElement).disabled
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Session 11')).toBeTruthy();
    expect(screen.getByLabelText('Details for Session 11').closest('details')?.open).toBe(false);
    expect((screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    chooseSelectOption('Sessions per page', '20');
    expect(screen.getByText('Session 1')).toBeTruthy();
    expect(screen.getByText('Session 12')).toBeTruthy();
    expect(screen.getByLabelText('Details for Session 1').closest('details')?.open).toBe(false);
    expect(window.localStorage.getItem('codex-token-usage.sessions-page-size')).toBe('20');
  });

  it('starts one session result entrance per intentional change and skips implicit repagination', () => {
    window.localStorage.clear();
    const i18n = createTestI18n('en');
    const sessions = Array.from({ length: 30 }, (_, index) => ({
      ...SESSION,
      sessionId: `numbered-session-${index + 1}`,
      threadName: `Numbered session ${index + 1}`,
      sourceFile: `numbered-session-${index + 1}.jsonl`,
    }));
    const view = (items: UsageSession[]) => (
      <I18nextProvider i18n={i18n}>
        <SessionsView sessions={items} selectedProjectPath={null} onClearProjectFilter={vi.fn()} />
      </I18nextProvider>
    );
    const { rerender } = render(view(sessions));
    const rowGroup = () => screen.getByRole('rowgroup');
    const next = screen.getByRole<HTMLButtonElement>('button', { name: 'Next page' });
    const search = screen.getByRole('searchbox', { name: 'Search sessions' });
    expect(rowGroup().classList.contains('results-enter')).toBe(false);
    fireEvent.click(next);
    expect(rowGroup().classList.contains('results-enter')).toBe(true);
    fireEvent.click(next);
    expect(screen.getByRole('status').textContent).toBe('Page 3 of 3');
    expect(within(rowGroup()).getAllByRole('row')).toHaveLength(10);
    expect(screen.getByText('Numbered session 30')).toBeTruthy();
    expect(next.disabled).toBe(true);
    expect(rowGroup().classList.contains('results-enter')).toBe(true);
    expect(rowGroup().querySelector('.motion-list-item')).toBeNull();

    search.focus();
    fireEvent.change(search, { target: { value: 'numbered session' } });
    expect(screen.getByRole('status').textContent).toBe('Page 1 of 3');
    expect(rowGroup().classList.contains('results-enter')).toBe(false);
    fireEvent.click(next);
    search.focus();
    fireEvent.change(search, { target: { value: '' } });
    expect(rowGroup().classList.contains('results-enter')).toBe(false);

    chooseSelectOption('Sessions per page', '20');
    expect(rowGroup().classList.contains('results-enter')).toBe(true);
    const entranceEnd = Object.assign(new Event('animationend', { bubbles: true }), {
      animationName: 'results-enter',
    });
    fireEvent(rowGroup(), entranceEnd);
    fireEvent.click(next);
    fireEvent(rowGroup(), entranceEnd);
    rerender(view(sessions.slice(0, 10)));
    expect(screen.getByRole('status').textContent).toBe('Page 1 of 1');
    expect(rowGroup().classList.contains('results-enter')).toBe(false);
  });

  it('does not replay an empty filter operation when a background update yields its first row', () => {
    const i18n = createTestI18n('en');
    const finding = makeDiagnosisSummary(HIGH_TOKEN_SESSION.sessionId, {
      sourceFile: HIGH_TOKEN_SESSION.sourceFile,
      primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
    });
    const view = (diagnostics: (typeof finding)[]) => (
      <I18nextProvider i18n={i18n}>
        <SessionsView
          sessions={[HIGH_TOKEN_SESSION]}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
          globalDiagnostics={diagnostics}
        />
      </I18nextProvider>
    );
    const { rerender } = render(view([]));
    chooseSelectOption('Filter by diagnosis severity', 'Critical');
    expect(screen.getByText('No matching sessions')).toBeTruthy();
    rerender(view([finding]));
    const rowGroup = screen.getByRole('rowgroup');
    expect(within(rowGroup).getByText('High token session')).toBeTruthy();
    expect(rowGroup.classList.contains('results-enter')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByRole('rowgroup').classList.contains('results-enter')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Page 1 of 1');
  });

  it('fades session results when the controlled project filter actually changes', () => {
    const sessions = [
      HIGH_TOKEN_SESSION,
      { ...LOWER_TOKEN_SESSION, projectPath: OTHER_PROJECT.projectPath, projectName: 'other' },
    ];
    const SessionProjectFilter = () => {
      const [project, setProject] = React.useState<string | null>(null);
      return (
        <SessionsView
          sessions={sessions}
          selectedProjectPath={project}
          onProjectFilterChange={setProject}
          onClearProjectFilter={() => setProject(null)}
        />
      );
    };
    render(
      <I18nextProvider i18n={createTestI18n('en')}>
        <SessionProjectFilter />
      </I18nextProvider>
    );
    chooseSelectOption('Filter by project', 'other');
    const filteredRows = screen.getByRole('rowgroup');
    expect(within(filteredRows).getAllByRole('row')).toHaveLength(1);
    expect(filteredRows.classList.contains('results-enter')).toBe(true);
    fireEvent(
      filteredRows,
      Object.assign(new Event('animationend', { bubbles: true }), {
        animationName: 'results-enter',
      })
    );
    chooseSelectOption('Filter by project', 'other');
    expect(screen.getByRole('rowgroup')).toBe(filteredRows);
    expect(filteredRows.classList.contains('results-enter')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Clear project filter for other' }));
    const allRows = screen.getByRole('rowgroup');
    expect(within(allRows).getAllByRole('row')).toHaveLength(2);
    expect(allRows.classList.contains('results-enter')).toBe(true);
  });
});
