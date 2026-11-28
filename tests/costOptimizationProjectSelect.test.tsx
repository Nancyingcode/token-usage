// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/renderer/App';
import CostOptimizationView from '../src/renderer/components/CostOptimizationView';
import type { CostOptimizationContentModel } from '../src/renderer/components/CostOptimizationView';
import { saveUsagePeriodPreference } from '../src/renderer/utils/usagePeriodPreference';
import type {
  CostOptimizationQuery,
  CostOptimizationSnapshot,
} from '../src/shared/costOptimizationTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';
import { createTestI18n } from './helpers/renderWithI18n';

interface RenderProjectSelectOptions {
  model?: CostOptimizationContentModel;
  projectOptions?: string[];
  projectOptionsLoading?: boolean;
  onProjectPathChange?: (projectPath: string | undefined) => void;
  locale?: 'en' | 'zh-CN';
}

const renderProjectSelect = ({
  model = { kind: 'ready', snapshot: SNAPSHOT },
  projectOptions = [],
  projectOptionsLoading = false,
  onProjectPathChange = vi.fn(),
  locale = 'en',
}: RenderProjectSelectOptions = {}) => {
  const triggerName = locale === 'zh-CN' ? '项目' : 'Project';

  render(
    <I18nextProvider i18n={createTestI18n(locale)}>
      <CostOptimizationView
        model={model}
        period="month"
        projectOptions={projectOptions}
        projectOptionsLoading={projectOptionsLoading}
        projectPath={undefined}
        activeTab="overview"
        diagnosisId={null}
        diagnosisDetailModel={{ kind: 'idle' }}
        onActiveTabChange={vi.fn()}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
        onProjectPathChange={onProjectPathChange}
        onUpdateSettings={vi.fn()}
      />
    </I18nextProvider>
  );

  return {
    trigger: screen.getByRole('combobox', { name: triggerName }),
    onProjectPathChange,
  };
};

describe('CostOptimizationView project select', () => {
  it('announces initial asynchronous option loading without exposing a false empty list', () => {
    const { trigger, onProjectPathChange } = renderProjectSelect({
      model: { kind: 'loading' },
      projectOptionsLoading: true,
    });

    expect(trigger.getAttribute('aria-busy')).toBe('true');
    expect(trigger.textContent).toContain('All projects');
    fireEvent.click(trigger);
    expect(screen.getByText('Loading options…').closest('[role="status"]')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(onProjectPathChange).not.toHaveBeenCalled();
  });

  it('keeps previous projects selectable while refreshed options are loading', () => {
    const { trigger, onProjectPathChange } = renderProjectSelect({
      projectOptions: ['C:\\repo'],
      projectOptionsLoading: true,
    });

    fireEvent.click(trigger);
    expect(screen.getByText('Loading options…').closest('[role="status"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'C:\\repo' }));
    expect(onProjectPathChange).toHaveBeenCalledWith('C:\\repo');
  });

  it('removes the loading state when current project options are ready', () => {
    const { trigger } = renderProjectSelect({ projectOptions: ['C:\\repo'] });

    expect(trigger.hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(trigger);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('option', { name: 'All projects' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'C:\\repo' })).toBeTruthy();
  });

  it('provides localized loading feedback in Chinese', () => {
    const { trigger } = renderProjectSelect({
      model: { kind: 'loading' },
      projectOptionsLoading: true,
      locale: 'zh-CN',
    });

    fireEvent.click(trigger);
    expect(screen.getByText('正在加载选项…').closest('[role="status"]')).toBeTruthy();
  });
});

const PROJECT_B = 'C:\\fixture\\beta';
const PROJECT_C = 'C:\\fixture\\charlie';

interface PendingSnapshot {
  query: CostOptimizationQuery;
  resolve: (snapshot: CostOptimizationSnapshot) => void;
  reject: (error: Error) => void;
}

const makeProjectSession = (projectPath: string, now: string): UsageSession => ({
  sessionId: projectPath,
  sourceFile: `${projectPath}\\synthetic.jsonl`,
  startedAt: now,
  endedAt: now,
  projectPath,
  projectName: projectPath,
  inputTokens: 100,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 100,
  turnOutcomes: [],
  usageSlices: [],
  eventCount: 1,
  warnings: [],
});

const mountAppWithProjects = () => {
  const now = new Date().toISOString();
  const sessions = [PROJECT_B, PROJECT_C].map((path) => makeProjectSession(path, now));
  const usage = {
    sessionsDir: 'C:\\fixture',
    scannedAt: now,
    summary: buildUsageSummary(sessions),
    warnings: [],
  };
  const requests: PendingSnapshot[] = [];
  let push: ((snapshot: CostOptimizationSnapshot) => void) | undefined;
  const updateSettings = vi.fn(async () => ({ ...SNAPSHOT, query: { period: 'week' as const } }));
  const ignore = () => () => undefined;
  const getSnapshot = vi.fn((query: CostOptimizationQuery) => {
    if (query.projectPath === undefined) {
      return Promise.resolve({ ...SNAPSHOT, query });
    }
    return new Promise<CostOptimizationSnapshot>((resolve, reject) => {
      requests.push({ query, resolve, reject });
    });
  });
  saveUsagePeriodPreference('week', window.localStorage);
  Object.defineProperty(window, 'codexUsage', {
    configurable: true,
    value: {
      getInitialUsage: async () => usage,
      onUsageUpdated: ignore,
      window: { getState: async () => ({ isMaximized: false }), onStateChanged: ignore },
      compressedData: {
        getStatus: async () => ({
          sessionsDir: usage.sessionsDir,
          phase: 'idle',
          discoveredCount: 0,
          unimportedCount: 0,
        }),
        onUpdated: ignore,
      },
      theme: {
        get: async () => ({ preference: 'system', resolvedTheme: 'mint-light' }),
        onUpdated: ignore,
      },
      budgets: { getSnapshot: async () => null, onUpdated: ignore, onNavigate: ignore },
      costOptimization: {
        getSnapshot,
        updateSettings,
        onUpdated: (listener: typeof push) => {
          push = listener;
          return () => {
            push = undefined;
          };
        },
      },
    },
  });
  const app = render(
    <I18nextProvider i18n={createTestI18n('en')}>
      <App />
    </I18nextProvider>
  );

  return {
    ...app,
    getSnapshot,
    updateSettings,
    publish: (snapshot: CostOptimizationSnapshot) => act(() => push?.(snapshot)),
    takeRequest: async (projectPath: string, period: CostOptimizationQuery['period'] = 'week') =>
      waitFor(() => {
        const index = requests.findIndex(
          ({ query }) => query.period === period && query.projectPath === projectPath
        );
        expect(index).toBeGreaterThanOrEqual(0);
        return requests.splice(index, 1)[0];
      }),
  };
};

const openCostPage = async (): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: 'Cost Optimization' }));
  await screen.findByText('$48.20');
};

const selectProjectByKeyboard = (trigger: HTMLElement, value: string): void => {
  trigger.focus();
  if (trigger.getAttribute('aria-expanded') === 'false') {
    fireEvent.keyDown(trigger, { key: 'Enter' });
  }
  fireEvent.keyDown(trigger, { key: 'Home' });
  const options = within(screen.getByRole('listbox', { name: 'Project' })).getAllByRole('option');
  const index = options.indexOf(screen.getByRole('option', { name: value }));
  for (let move = 0; move < index; move += 1) {
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  }
  expect(trigger.getAttribute('aria-activedescendant')).toBe(options[index].id);
  fireEvent.keyDown(trigger, { key: 'Enter' });
};

describe('cost optimization project changes from the application', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'codexUsage');
    window.localStorage.clear();
  });

  it.each(['success', 'failure'] as const)(
    'keeps the selector and applies only the latest query after an older %s',
    async (olderOutcome) => {
      const app = mountAppWithProjects();
      await openCostPage();
      const projectTrigger = screen.getByRole('combobox', { name: 'Project' });
      const heading = screen.getByRole('heading', { name: 'Cost Optimization' });
      selectProjectByKeyboard(projectTrigger, PROJECT_B);
      const requestB = await app.takeRequest(PROJECT_B);
      expect(screen.queryByText('$48.20')).toBeNull();
      expect(screen.getByRole('status', { name: 'Loading cost analysis' })).toBeTruthy();
      expect(screen.getByRole('combobox', { name: 'Project' })).toBe(projectTrigger);
      expect(screen.getByRole('heading', { name: 'Cost Optimization' })).toBe(heading);
      expect(document.activeElement === projectTrigger).toBe(true);

      selectProjectByKeyboard(projectTrigger, PROJECT_C);
      const requestC = await app.takeRequest(PROJECT_C);
      fireEvent.keyDown(projectTrigger, { key: 'Enter' });
      const listbox = screen.getByRole('listbox', { name: 'Project' });
      await act(async () =>
        requestC.resolve({
          ...SNAPSHOT,
          query: requestC.query,
          currentCostUsd: 37,
        })
      );
      expect(screen.getByText('$37.00')).toBeTruthy();
      const feedback = screen.getByRole('tabpanel').closest('.results-enter');
      expect(feedback?.classList.contains('cost-optimization-results')).toBe(true);

      await act(async () => {
        if (olderOutcome === 'success') {
          requestB.resolve({ ...SNAPSHOT, query: requestB.query, currentCostUsd: 62 });
        } else {
          requestB.reject(new Error('superseded beta request'));
        }
      });
      expect(screen.queryByText('$62.00')).toBeNull();
      expect(screen.queryByText('superseded beta request')).toBeNull();
      expect(screen.getByText('$37.00')).toBeTruthy();
      expect(screen.getByRole('tabpanel').closest('.cost-optimization-results')).toBe(feedback);
      expect(screen.getByRole('combobox', { name: 'Project' }).textContent).toContain(PROJECT_C);
      expect(screen.getByRole('listbox', { name: 'Project' })).toBe(listbox);
      expect(document.activeElement === projectTrigger).toBe(true);
    }
  );

  it('shows the current query failure and keeps the period button focused while recovering', async () => {
    const app = mountAppWithProjects();
    await openCostPage();
    const projectTrigger = screen.getByRole('combobox', { name: 'Project' });
    selectProjectByKeyboard(projectTrigger, PROJECT_B);
    const week = await app.takeRequest(PROJECT_B);
    await act(async () => week.reject(new Error('beta week failed')));
    expect(screen.getByText('beta week failed')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Project' })).toBe(projectTrigger);
    expect(projectTrigger.textContent).toContain(PROJECT_B);

    const month = within(screen.getByRole('group', { name: 'Date range' })).getByRole('button', {
      name: 'Month',
    });
    month.focus();
    fireEvent.click(month);
    const monthRequest = await app.takeRequest(PROJECT_B, 'month');
    expect(screen.queryByText('beta week failed')).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading cost analysis' })).toBeTruthy();
    await act(async () => monthRequest.resolve({ ...SNAPSHOT, query: monthRequest.query }));
    expect(screen.getByText('$48.20')).toBeTruthy();
    expect(month.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement === month).toBe(true);
  });

  it('fades a quickly resolved new period once and updates the same result on pushes', async () => {
    const app = mountAppWithProjects();
    await openCostPage();
    expect(app.container.querySelector('.results-enter')).toBeNull();
    const dateRange = screen.getByRole('group', { name: 'Date range' });
    const month = within(dateRange).getByRole('button', { name: 'Month' });
    month.focus();
    fireEvent.click(month);
    await waitFor(() => {
      expect(screen.getByRole('tabpanel').closest('.results-enter')).toBeTruthy();
    });
    const results = screen.getByRole('tabpanel').closest('.cost-optimization-results');
    expect(results?.classList.contains('results-enter')).toBe(true);
    expect(document.activeElement === month).toBe(true);

    const animationEnd = Object.assign(new Event('animationend', { bubbles: true }), {
      animationName: 'results-enter',
    });
    fireEvent(results as HTMLElement, animationEnd);
    app.publish({ ...SNAPSHOT, query: { period: 'month' }, currentCostUsd: 54 });
    expect(screen.getByText('$54.00')).toBeTruthy();
    expect(screen.getByRole('tabpanel').closest('.cost-optimization-results')).toBe(results);
    fireEvent.click(month);
    expect(app.container.querySelector('.results-enter')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
    await screen.findByRole('heading', { name: 'Overview' });
    await openCostPage();
    expect(app.container.querySelector('.results-enter')).toBeNull();
  });

  it('shows the same analysis warning in a different result even after dismissing it', async () => {
    const app = mountAppWithProjects();
    await openCostPage();
    const warning = 'Shared synthetic analysis warning';
    app.publish({ ...SNAPSHOT, query: { period: 'week' }, warnings: [warning] });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss warning' }));
    expect(screen.queryByText(warning)).toBeNull();

    selectProjectByKeyboard(screen.getByRole('combobox', { name: 'Project' }), PROJECT_B);
    const request = await app.takeRequest(PROJECT_B);
    await act(async () =>
      request.resolve({ ...SNAPSHOT, query: request.query, warnings: [warning] })
    );
    expect(screen.getByText(warning)).toBeTruthy();
  });

  it('keeps an in-flight settings save open until the filtered refresh settles and closes once', async () => {
    const app = mountAppWithProjects();
    await openCostPage();
    selectProjectByKeyboard(screen.getByRole('combobox', { name: 'Project' }), PROJECT_B);
    const request = await app.takeRequest(PROJECT_B);
    const snapshot = {
      ...SNAPSHOT,
      query: request.query,
      settings: { ...SNAPSHOT.settings, candidateModelIds: [] },
    };
    await act(async () => request.resolve(snapshot));
    const results = screen.getByRole('tabpanel').closest('.cost-optimization-results');
    if (results) {
      fireEvent(
        results,
        Object.assign(new Event('animationend', { bubbles: true }), {
          animationName: 'results-enter',
        })
      );
    }
    const settings = screen.getByRole('button', { name: 'Analysis settings' });
    settings.focus();
    fireEvent.click(settings);
    const dialog = screen.getByRole('dialog', { name: 'Analysis settings' });
    const save = within(dialog).getByRole('button', { name: 'Save' });
    fireEvent.click(save);

    const refresh = await app.takeRequest(PROJECT_B);
    expect(screen.getByRole('dialog', { name: 'Analysis settings' })).toBe(dialog);
    expect(screen.getByRole('status', { name: 'Loading cost analysis' })).toBeTruthy();
    await act(async () => refresh.resolve(snapshot));
    expect(dialog.getAttribute('data-state')).toBe('exiting');
    fireEvent(
      dialog,
      Object.assign(new Event('animationend', { bubbles: true }), {
        animationName: 'drawer-exit',
      })
    );
    expect(screen.queryByRole('dialog', { name: 'Analysis settings' })).toBeNull();
    expect(screen.getAllByText('Analysis settings saved')).toHaveLength(1);
    expect(app.updateSettings).toHaveBeenCalledOnce();
    expect(document.activeElement === settings).toBe(true);
    expect(app.container.querySelector('.results-enter')).toBeNull();
  });
});
