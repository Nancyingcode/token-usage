# Project Session Drilldown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click a project ranking row and open Sessions filtered to that project's highest-token sessions.

**Architecture:** Keep project navigation state in the renderer `App`, derive project-filtered sessions with a pure selector, and reuse the existing Projects and Sessions views. Use the full project path as identity, share the Unknown Project fallback with aggregation, and keep all scan data immutable.

**Tech Stack:** TypeScript 5.5, React 18, Electron 31, i18next 26, Vitest 2, CSS

## Global Constraints

- A project click opens the existing Sessions view; do not add a project details route, drawer, or inline expansion.
- A filtered session list is ordered by total tokens descending, then start time descending.
- An unfiltered session list preserves the incoming start-time-descending order.
- Full project paths are identities; display names must never merge same-named projects.
- An empty project path maps to one shared `UNKNOWN_PROJECT_KEY`; do not add case or slash normalization.
- Changing Today, Week, Month, or Total preserves the project filter.
- Direct sidebar navigation to Sessions clears the project filter.
- Scan refreshes retain the project identity and recompute from current data.
- The filter is transient renderer state and is not persisted across restarts.
- Existing scan error, loading, scan-empty, and period-empty precedence remains unchanged.
- The feature adds no IPC, preload API, filesystem write, network request, or dependency.
- English and Simplified Chinese copy must remain structurally identical through `TranslationShape`.
- Follow `AGENTS.md`: no `any`, no `var`, no magic values, use `React.FC`, define props with interfaces, extract compound JSX predicates, and do not store derivable React state.
- Add or update file headers when a modified component's responsibility becomes materially more complex.

## File Structure

- `src/shared/usageMath.ts`: owns the shared project-identity fallback used by aggregation.
- `src/renderer/utils/projectSessions.ts`: filters and orders sessions without mutating scan data.
- `src/renderer/App.tsx`: owns active view and selected project as one explicit navigation state.
- `src/renderer/components/ProjectsView.tsx`: exposes keyboard-accessible project selection.
- `src/renderer/components/AppContent.tsx`: passes navigation and filter contracts to sibling views.
- `src/renderer/components/SessionsView.tsx`: presents the active filter, selected sessions, and filtered empty state.
- `src/shared/i18n/locales/en.ts`: canonical English filter and empty-state copy.
- `src/shared/i18n/locales/zhCN.ts`: Simplified Chinese copy matching the English resource shape.
- `src/renderer/styles.css`: interactive project-row, filter-chip, focus, and empty-state presentation.
- `tests/projectSessions.test.ts`: selector, identity, ordering, and immutability tests.
- `tests/appNavigation.test.ts`: navigation transition tests.
- `tests/analyticsViews.test.tsx`: project-row and filtered Sessions rendering tests.
- `tests/appContent.test.tsx`: sibling-view prop wiring and application-level state precedence tests.

---

### Task 1: Share Project Identity And Select Project Sessions

**Files:**
- Create: `tests/projectSessions.test.ts`
- Create: `src/renderer/utils/projectSessions.ts`
- Modify: `tests/usageMath.test.ts`
- Modify: `src/main/sessionParser.ts`
- Modify: `src/shared/usageMath.ts`

**Interfaces:**
- Consumes: `UsageSession[]`, `selectedProjectPath: string | null`, and the existing project aggregation.
- Produces: `UNKNOWN_PROJECT_KEY`, `getProjectIdentity(projectPath): string`, and `selectProjectSessions(sessions, selectedProjectPath): UsageSession[]`.

- [ ] **Step 1: Write failing selector and identity tests**

Create `tests/projectSessions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { UNKNOWN_PROJECT_KEY } from '../src/shared/usageMath';
import { selectProjectSessions } from '../src/renderer/utils/projectSessions';
import type { UsageSession } from '../src/shared/usageTypes';

describe('selectProjectSessions', () => {
  it('preserves incoming order and returns a copy without a project filter', () => {
    const sessions = [
      makeSession('newer', '2026-07-24T11:00:00.000Z', 'C:\\work\\alpha', 10),
      makeSession('older', '2026-07-24T10:00:00.000Z', 'C:\\work\\beta', 20),
    ];

    const selected = selectProjectSessions(sessions, null);

    expect(selected.map(({ sessionId }) => sessionId)).toEqual(['newer', 'older']);
    expect(selected).not.toBe(sessions);
  });

  it('matches the exact project identity and keeps same-named paths separate', () => {
    const sessions = [
      makeSession('first-repo', '2026-07-24T09:00:00.000Z', 'C:\\one\\repo', 10),
      makeSession('second-repo', '2026-07-24T10:00:00.000Z', 'D:\\two\\repo', 20),
    ];

    expect(
      selectProjectSessions(sessions, 'C:\\one\\repo').map(({ sessionId }) => sessionId)
    ).toEqual(['first-repo']);
  });

  it('orders filtered sessions by tokens and then start time', () => {
    const sessions = [
      makeSession('low', '2026-07-24T12:00:00.000Z', 'C:\\work\\repo', 50),
      makeSession('high-old', '2026-07-24T09:00:00.000Z', 'C:\\work\\repo', 100),
      makeSession('high-new', '2026-07-24T11:00:00.000Z', 'C:\\work\\repo', 100),
    ];

    expect(
      selectProjectSessions(sessions, 'C:\\work\\repo').map(({ sessionId }) => sessionId)
    ).toEqual(['high-new', 'high-old', 'low']);
  });

  it('uses the shared Unknown Project identity', () => {
    const sessions = [
      makeSession('unknown', '2026-07-24T10:00:00.000Z', '', 100),
      makeSession('known', '2026-07-24T11:00:00.000Z', 'C:\\work\\repo', 200),
    ];

    expect(
      selectProjectSessions(sessions, UNKNOWN_PROJECT_KEY).map(({ sessionId }) => sessionId)
    ).toEqual(['unknown']);
  });

  it('keeps incoming order for equal tokens when either start time is invalid', () => {
    const sessions = [
      makeSession('invalid', 'not-a-date', 'C:\\work\\repo', 100),
      makeSession('valid', '2026-07-24T11:00:00.000Z', 'C:\\work\\repo', 100),
    ];

    expect(
      selectProjectSessions(sessions, 'C:\\work\\repo').map(({ sessionId }) => sessionId)
    ).toEqual(['invalid', 'valid']);
  });

  it('recomputes a retained project identity for new period or scan inputs', () => {
    const projectPath = 'C:\\work\\repo';
    const currentPeriodSessions = [
      makeSession('current', '2026-07-24T11:00:00.000Z', projectPath, 100),
    ];
    const refreshedSessions = [
      makeSession('other', '2026-07-24T12:00:00.000Z', 'C:\\work\\other', 200),
    ];

    expect(
      selectProjectSessions(currentPeriodSessions, projectPath).map(
        ({ sessionId }) => sessionId
      )
    ).toEqual(['current']);
    expect(selectProjectSessions(refreshedSessions, projectPath)).toEqual([]);
  });
});

const makeSession = (
  sessionId: string,
  startedAt: string,
  projectPath: string,
  totalTokens: number
): UsageSession => ({
  sessionId,
  startedAt,
  endedAt: startedAt,
  projectPath,
  projectName: projectPath.split('\\').pop() || UNKNOWN_PROJECT_KEY,
  usageSlices: [],
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  eventCount: 1,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});
```

Add this aggregation test to `tests/usageMath.test.ts`:

```ts
it('uses the shared identity for an empty project path', () => {
  const summary = buildUsageSummary([
    makeSession('unknown', '2026-07-24T10:00:00.000Z', '', 100),
  ]);

  expect(summary.byProject).toHaveLength(1);
  expect(summary.byProject[0].projectPath).toBe(UNKNOWN_PROJECT_KEY);
  expect(summary.byProject[0].projectName).toBe(UNKNOWN_PROJECT_KEY);
});
```

Add `UNKNOWN_PROJECT_KEY` to the existing `usageMath` import in that test.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/projectSessions.test.ts tests/usageMath.test.ts
```

Expected: FAIL because `projectSessions.ts`, `UNKNOWN_PROJECT_KEY`, and `getProjectIdentity` do not exist.

- [ ] **Step 3: Centralize the project identity**

Add these exports before `getProjectName` in `src/shared/usageMath.ts`:

```ts
export const UNKNOWN_PROJECT_KEY = 'Unknown Project';

export const getProjectIdentity = (projectPath: string): string =>
  projectPath || UNKNOWN_PROJECT_KEY;
```

Replace `getProjectName` with:

```ts
export const getProjectName = (projectPath: string): string => {
  const projectIdentity = getProjectIdentity(projectPath);
  const normalized = projectIdentity.replace(/\\/g, '/').replace(/\/+$/, '');
  const name = normalized.split('/').filter(Boolean).pop();
  return name || projectIdentity;
};
```

Replace the fallback inside `buildProjectTotals`:

```ts
const projectPath = getProjectIdentity(session.projectPath);
```

In `src/main/sessionParser.ts`, import `getProjectIdentity` from `usageMath` and replace the
parser's duplicate string fallback:

```ts
import {
  addTokenUsage,
  emptyTokenUsage,
  getProjectIdentity,
  getProjectName,
} from '../shared/usageMath';
```

```ts
const safeProjectPath = getProjectIdentity(projectPath);
```

- [ ] **Step 4: Implement the immutable selector**

Create `src/renderer/utils/projectSessions.ts`:

```ts
/**
 * @file Project session selection
 * @description Filters sessions by the shared project identity and applies drilldown ordering.
 */

import { getProjectIdentity } from '../../shared/usageMath';
import type { UsageSession } from '../../shared/usageTypes';

const compareStartTimeDescending = (left: UsageSession, right: UsageSession): number => {
  const leftTime = new Date(left.startedAt).getTime();
  const rightTime = new Date(right.startedAt).getTime();
  const hasInvalidTime = Number.isNaN(leftTime) || Number.isNaN(rightTime);

  return hasInvalidTime ? 0 : rightTime - leftTime;
};

const compareFilteredSessions = (left: UsageSession, right: UsageSession): number => {
  const tokenDifference = right.totalTokens - left.totalTokens;

  return tokenDifference === 0 ? compareStartTimeDescending(left, right) : tokenDifference;
};

export const selectProjectSessions = (
  sessions: UsageSession[],
  selectedProjectPath: string | null
): UsageSession[] => {
  if (selectedProjectPath === null) {
    return [...sessions];
  }

  return sessions
    .filter(
      (session) => getProjectIdentity(session.projectPath) === selectedProjectPath
    )
    .sort(compareFilteredSessions);
};
```

- [ ] **Step 5: Run focused tests, type checking, and lint**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/projectSessions.test.ts tests/usageMath.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: both focused test files PASS; TypeScript, ESLint, and Prettier exit with code 0.

- [ ] **Step 6: Commit the identity and selector**

```powershell
git add tests/projectSessions.test.ts tests/usageMath.test.ts src/main/sessionParser.ts src/renderer/utils/projectSessions.ts src/shared/usageMath.ts
git commit -m "feat: select sessions by project"
```

---

### Task 2: Model Renderer Navigation Transitions

**Files:**
- Create: `tests/appNavigation.test.ts`
- Modify: `src/renderer/App.tsx`

**Interfaces:**
- Consumes: existing `ViewKey` values and project paths reported by Projects.
- Produces: `AppNavigationState`, `AppNavigationAction`, `INITIAL_APP_NAVIGATION_STATE`, and `reduceAppNavigationState(state, action): AppNavigationState`.

- [ ] **Step 1: Write failing navigation reducer tests**

Create `tests/appNavigation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  INITIAL_APP_NAVIGATION_STATE,
  reduceAppNavigationState,
  type AppNavigationState,
} from '../src/renderer/App';

describe('reduceAppNavigationState', () => {
  it('opens Sessions with the selected project identity', () => {
    expect(
      reduceAppNavigationState(INITIAL_APP_NAVIGATION_STATE, {
        type: 'select-project',
        projectPath: 'C:\\work\\repo',
      })
    ).toEqual({
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
    });
  });

  it('clears a project when Sessions is selected directly', () => {
    const state: AppNavigationState = {
      activeView: 'tools',
      selectedProjectPath: 'C:\\work\\repo',
    };

    expect(
      reduceAppNavigationState(state, { type: 'select-view', view: 'sessions' })
    ).toEqual({
      activeView: 'sessions',
      selectedProjectPath: null,
    });
  });

  it('preserves a project when another non-Sessions view is selected', () => {
    const state: AppNavigationState = {
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
    };

    expect(
      reduceAppNavigationState(state, { type: 'select-view', view: 'performance' })
    ).toEqual({
      activeView: 'performance',
      selectedProjectPath: 'C:\\work\\repo',
    });
  });

  it('clears only the project filter when requested', () => {
    const state: AppNavigationState = {
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
    };

    expect(reduceAppNavigationState(state, { type: 'clear-project' })).toEqual({
      activeView: 'sessions',
      selectedProjectPath: null,
    });
  });
});
```

- [ ] **Step 2: Run the reducer test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appNavigation.test.ts
```

Expected: FAIL because the navigation types, initial state, and reducer are not exported.

- [ ] **Step 3: Add the navigation model**

Add this leading file header to `src/renderer/App.tsx`:

```ts
/**
 * @file Renderer application orchestration
 * @description Coordinates scan state, budget state, navigation, period selection, and view data.
 */
```

Replace the React import with:

```ts
import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
```

Add these exports after imports:

```ts
export interface AppNavigationState {
  activeView: ViewKey;
  selectedProjectPath: string | null;
}

export type AppNavigationAction =
  | { type: 'select-view'; view: ViewKey }
  | { type: 'select-project'; projectPath: string }
  | { type: 'clear-project' };

export const INITIAL_APP_NAVIGATION_STATE: AppNavigationState = {
  activeView: 'overview',
  selectedProjectPath: null,
};

export const reduceAppNavigationState = (
  state: AppNavigationState,
  action: AppNavigationAction
): AppNavigationState => {
  switch (action.type) {
    case 'select-view':
      return {
        activeView: action.view,
        selectedProjectPath:
          action.view === 'sessions' ? null : state.selectedProjectPath,
      };
    case 'select-project':
      return {
        activeView: 'sessions',
        selectedProjectPath: action.projectPath,
      };
    case 'clear-project':
      return {
        ...state,
        selectedProjectPath: null,
      };
  }
};
```

Use `useReducer` in `App` and replace all direct active-view writes:

```ts
const [navigation, dispatchNavigation] = useReducer(
  reduceAppNavigationState,
  INITIAL_APP_NAVIGATION_STATE
);
const { activeView } = navigation;

const handleViewChange = useCallback((view: ViewKey): void => {
  dispatchNavigation({ type: 'select-view', view });
}, []);
```

In the budget navigation effect, replace `setActiveView('budgets')` with:

```ts
dispatchNavigation({ type: 'select-view', view: 'budgets' });
```

Pass the named handler to Sidebar:

```tsx
onChange={handleViewChange}
```

- [ ] **Step 4: Run focused tests, type checking, and lint**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appNavigation.test.ts tests/sidebar.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: navigation and Sidebar tests PASS; TypeScript, ESLint, and Prettier exit with code 0.

- [ ] **Step 5: Commit the navigation model**

```powershell
git add tests/appNavigation.test.ts src/renderer/App.tsx
git commit -m "refactor: model app navigation state"
```

---

### Task 3: Make Project Rows Open Sessions

**Files:**
- Modify: `tests/analyticsViews.test.tsx`
- Modify: `tests/appContent.test.tsx`
- Modify: `src/renderer/components/ProjectsView.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `dispatchNavigation({ type: 'select-project', projectPath })`.
- Produces: `ProjectsViewProps.onProjectSelect(projectPath): void` and an exported hook-free `ProjectRow` used for focused interaction testing.

- [ ] **Step 1: Write failing project-row interaction tests**

Update the imports in `tests/analyticsViews.test.tsx`:

```ts
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import ProjectsView, { ProjectRow } from '../src/renderer/components/ProjectsView';
```

Add:

```ts
interface ProjectButtonProps {
  type: 'button';
  onClick: () => void;
}

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
```

Update the existing `ProjectsView` render call to pass `onProjectSelect={vi.fn()}`. Add this
assertion to that project markup test:

```ts
expect(markup).toContain('<button type="button" class="table-row project-table-row"');
```

In `tests/appContent.test.tsx`, import `vi`, pass `onProjectSelect={vi.fn()}` to every
`AppContent` fixture, and add:

```ts
it('renders interactive project rows in the Tools view', () => {
  const markup = renderWithI18n(
    <AppContent
      activeView="tools"
      model={{ kind: 'ready', result: RESULT, summary: SUMMARY }}
      onProjectSelect={vi.fn()}
    />
  );

  expect(markup).toContain('project-table-row');
  expect(markup).toContain('type="button"');
});
```

- [ ] **Step 2: Run focused view tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/analyticsViews.test.tsx tests/appContent.test.tsx
```

Expected: FAIL because `ProjectRow` and the `onProjectSelect` contracts do not exist.

- [ ] **Step 3: Implement the native project row**

Add this file header to `src/renderer/components/ProjectsView.tsx`:

```ts
/**
 * @file Project usage ranking
 * @description Displays project-level token totals and reports project drilldown selections.
 */
```

Import `SupportedLocale`:

```ts
import type { SupportedLocale } from '../../shared/i18n/locale';
```

Then replace the props and row rendering with:

```tsx
interface ProjectsViewProps {
  projects: UsageProject[];
  onProjectSelect: (projectPath: string) => void;
}

interface ProjectRowProps {
  project: UsageProject;
  max: number;
  locale: SupportedLocale;
  unknownDateLabel: string;
  onSelect: (projectPath: string) => void;
}

export const ProjectRow: React.FC<ProjectRowProps> = ({
  project,
  max,
  locale,
  unknownDateLabel,
  onSelect,
}) => (
  <button
    type="button"
    className="table-row project-table-row"
    onClick={() => onSelect(project.projectPath)}
  >
    <span className="primary-cell" title={project.projectPath}>
      {project.projectName}
    </span>
    <span>
      <TokenBar value={project.totalTokens} max={max} tone="green" />
    </span>
    <span>{formatNumber(project.sessionCount, locale)}</span>
    <span>{formatNumber(project.totalTokens, locale)}</span>
    <span>{formatShortDateTime(project.lastActivityAt, locale, unknownDateLabel)}</span>
  </button>
);

const ProjectsView: React.FC<ProjectsViewProps> = ({ projects, onProjectSelect }) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const max = Math.max(0, ...projects.map((project) => project.totalTokens));
  const unknownDateLabel = tCommon('value.unknownDate');

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('projects.eyebrow')}</p>
          <h3>{t('projects.title')}</h3>
        </div>
        <span>{t('projects.count', { count: projects.length })}</span>
      </div>
      <div className="data-table project-table">
        <div className="table-row table-head">
          <span>{t('projects.project')}</span>
          <span>{t('projects.share')}</span>
          <span>{t('projects.sessions')}</span>
          <span>{t('projects.tokens')}</span>
          <span>{t('projects.lastActive')}</span>
        </div>
        {projects.map((project) => (
          <ProjectRow
            key={project.projectPath}
            project={project}
            max={max}
            locale={locale}
            unknownDateLabel={unknownDateLabel}
            onSelect={onProjectSelect}
          />
        ))}
      </div>
    </section>
  );
};
```

- [ ] **Step 4: Wire project selection through AppContent and App**

Add this required prop to `AppContentProps`:

```ts
onProjectSelect: (projectPath: string) => void;
```

Destructure it and replace the Tools branch with:

```tsx
{activeView === 'tools' ? (
  <ProjectsView
    projects={model.summary.byProject}
    onProjectSelect={onProjectSelect}
  />
) : null}
```

In `App`, add:

```ts
const handleProjectSelect = useCallback((projectPath: string): void => {
  dispatchNavigation({ type: 'select-project', projectPath });
}, []);
```

Pass it to `AppContent`:

```tsx
onProjectSelect={handleProjectSelect}
```

- [ ] **Step 5: Add row interaction and focus styles**

Add after the project-table grid rule in `src/renderer/styles.css`:

```css
.project-table-row {
  width: 100%;
  margin: 0;
  border: 0;
  border-bottom: 1px solid #eeeeee;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.project-table-row:hover {
  background: #f7fbfc;
}

.project-table-row:focus-visible {
  z-index: 1;
  outline: 2px solid rgba(34, 199, 217, 0.6);
  outline-offset: -2px;
  background: #f2fbfc;
}
```

- [ ] **Step 6: Run focused tests, type checking, and lint**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/analyticsViews.test.tsx tests/appContent.test.tsx tests/appNavigation.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: all focused tests PASS; TypeScript, accessibility markup checks, ESLint, and Prettier exit with code 0.

- [ ] **Step 7: Commit project-row navigation**

```powershell
git add tests/analyticsViews.test.tsx tests/appContent.test.tsx src/renderer/components/ProjectsView.tsx src/renderer/components/AppContent.tsx src/renderer/App.tsx src/renderer/styles.css
git commit -m "feat: open sessions from projects"
```

---

### Task 4: Present And Clear The Project Filter

**Files:**
- Modify: `tests/analyticsViews.test.tsx`
- Modify: `tests/appContent.test.tsx`
- Modify: `tests/i18n.test.ts`
- Modify: `src/renderer/components/SessionsView.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: `selectProjectSessions(sessions, selectedProjectPath)` and `navigation.selectedProjectPath`.
- Produces: `SessionsViewProps.selectedProjectPath`, `SessionsViewProps.onClearProjectFilter`, and a localized removable filter chip plus filtered empty state.

- [ ] **Step 1: Write failing filtered Sessions tests**

In `tests/analyticsViews.test.tsx`, import `ProjectFilterChip` from `SessionsView` and
`UNKNOWN_PROJECT_KEY` from `usageMath`. Add a second session fixture:

```ts
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
```

Add:

```ts
interface FilterButtonProps {
  type: 'button';
  onClick: () => void;
  'aria-label': string;
}

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
  expect(markup.indexOf('High token session')).toBeLessThan(
    markup.indexOf('Low token session')
  );
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
```

Update every existing direct `SessionsView` fixture with:

```tsx
selectedProjectPath={null}
onClearProjectFilter={vi.fn()}
```

In `tests/appContent.test.tsx`, add `selectedProjectPath={null}` and
`onClearProjectFilter={vi.fn()}` to every `AppContent` fixture, then add:

```ts
it('passes the active project filter to Sessions', () => {
  const markup = renderWithI18n(
    <AppContent
      activeView="sessions"
      model={{ kind: 'ready', result: RESULT, summary: SUMMARY }}
      onProjectSelect={vi.fn()}
      selectedProjectPath={'C:\\repo'}
      onClearProjectFilter={vi.fn()}
    />
  );

  expect(markup).toContain('Project: repo');
});
```

Extend `tests/i18n.test.ts`:

```ts
expect(instance.t('analytics:sessions.projectFilter', { project: 'repo' })).toBe(
  '项目：repo'
);
expect(instance.t('analytics:sessions.showAll')).toBe('查看全部会话');
expect(instance.t('analytics:sessions.filteredEmptyTitle')).toBe(
  '此时间范围内该项目没有会话'
);
```

Use the actual UTF-8 Chinese strings from `zhCN.ts` when editing; do not copy mojibake from terminal output.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/analyticsViews.test.tsx tests/appContent.test.tsx tests/i18n.test.ts
```

Expected: FAIL because filtered Sessions props, copy, chip, and empty-state rendering do not exist.

- [ ] **Step 3: Add canonical English and matching Chinese copy**

Add these keys under `analytics.sessions` in `src/shared/i18n/locales/en.ts`:

```ts
projectFilter: 'Project: {{project}}',
clearProjectFilter: 'Clear project filter for {{project}}',
filteredCount_one: '{{count}} matching session',
filteredCount_other: '{{count}} matching sessions',
filteredEmptyTitle: 'No sessions for this project in this period',
filteredEmptyDescription: 'Change the date range or show all sessions.',
showAll: 'Show all sessions',
```

Add the matching keys under `analytics.sessions` in `src/shared/i18n/locales/zhCN.ts`:

```ts
projectFilter: '项目：{{project}}',
clearProjectFilter: '清除 {{project}} 的项目筛选',
filteredCount_one: '{{count}} 个匹配会话',
filteredCount_other: '{{count}} 个匹配会话',
filteredEmptyTitle: '此时间范围内该项目没有会话',
filteredEmptyDescription: '请更改日期范围或查看全部会话。',
showAll: '查看全部会话',
```

- [ ] **Step 4: Implement Sessions filter rendering**

Add this file header to `src/renderer/components/SessionsView.tsx`:

```ts
/**
 * @file Session usage list
 * @description Displays session token details and the transient project drilldown filter.
 */
```

Use these imports for the new dependencies:

```ts
import { AlertTriangle, X } from 'lucide-react';
import { getProjectName } from '../../shared/usageMath';
import { selectProjectSessions } from '../utils/projectSessions';
```

Replace the props and add the hook-free chip:

```tsx
interface SessionsViewProps {
  sessions: UsageSession[];
  selectedProjectPath: string | null;
  onClearProjectFilter: () => void;
}

interface ProjectFilterChipProps {
  projectPath: string;
  label: string;
  clearLabel: string;
  onClear: () => void;
}

export const ProjectFilterChip: React.FC<ProjectFilterChipProps> = ({
  projectPath,
  label,
  clearLabel,
  onClear,
}) => (
  <button
    type="button"
    className="project-filter-chip"
    title={projectPath}
    aria-label={clearLabel}
    onClick={onClear}
  >
    <span>{label}</span>
    <X size={ICON_SIZE_SMALL} aria-hidden="true" />
  </button>
);
```

Replace the component declaration so every new prop is in scope:

```ts
const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  selectedProjectPath,
  onClearProjectFilter,
}) => {
```

At the start of its function body, after the existing translation and locale declarations, derive
named display state:

```ts
const filteredSessions = React.useMemo(
  () => selectProjectSessions(sessions, selectedProjectPath),
  [selectedProjectPath, sessions]
);
const hasProjectFilter = selectedProjectPath !== null;
const projectName = hasProjectFilter ? getProjectName(selectedProjectPath) : '';
const showFilteredEmpty = hasProjectFilter && filteredSessions.length === 0;
const sessionCountLabel = hasProjectFilter
  ? t('sessions.filteredCount', { count: filteredSessions.length })
  : t('sessions.count', { count: filteredSessions.length });
```

Add the filter chip below the existing heading copy:

```tsx
{hasProjectFilter ? (
  <ProjectFilterChip
    projectPath={selectedProjectPath}
    label={t('sessions.projectFilter', { project: projectName })}
    clearLabel={t('sessions.clearProjectFilter', { project: projectName })}
    onClear={onClearProjectFilter}
  />
) : null}
```

Use `sessionCountLabel` for the heading count. Replace the table-body mapping with:

```tsx
{showFilteredEmpty ? (
  <div className="session-filter-empty">
    <h4>{t('sessions.filteredEmptyTitle')}</h4>
    <p>{t('sessions.filteredEmptyDescription')}</p>
    <button type="button" onClick={onClearProjectFilter}>
      {t('sessions.showAll')}
    </button>
  </div>
) : (
  filteredSessions.map((session) => (
    <div className="table-row" key={session.sourceFile}>
      <span className="primary-cell" title={session.sessionId}>
        {session.threadName || shortId(session.sessionId)}
      </span>
      <span title={session.projectPath}>{session.projectName}</span>
      <span>
        {formatShortDateTime(session.startedAt, locale, tCommon('value.unknownDate'))}
      </span>
      <span>{formatNumber(session.inputTokens, locale)}</span>
      <span>{formatNumber(session.cachedInputTokens, locale)}</span>
      <span>{formatNumber(session.outputTokens, locale)}</span>
      <span>{formatNumber(session.totalTokens, locale)}</span>
      <span className={session.warnings.length ? 'warning-cell' : 'ok-cell'}>
        {session.warnings.length ? <AlertTriangle size={ICON_SIZE_SMALL} /> : null}
        {session.warnings.length
          ? tCommon('item.warnings', { count: session.warnings.length })
          : tCommon('value.ok')}
      </span>
    </div>
  ))
)}
```

The `showFilteredEmpty` variable is required by the repository compound-JSX rule; do not inline its
two business predicates.

- [ ] **Step 5: Wire filter state and clearing**

Add these required props to `AppContentProps`:

```ts
selectedProjectPath: string | null;
onClearProjectFilter: () => void;
```

Destructure them and replace the Sessions branch:

```tsx
{activeView === 'sessions' ? (
  <SessionsView
    sessions={model.summary.sessions}
    selectedProjectPath={selectedProjectPath}
    onClearProjectFilter={onClearProjectFilter}
  />
) : null}
```

In `App`, read the project path from navigation and add the clear handler:

```ts
const { activeView, selectedProjectPath } = navigation;

const clearProjectFilter = useCallback((): void => {
  dispatchNavigation({ type: 'clear-project' });
}, []);
```

Pass both props to `AppContent`:

```tsx
selectedProjectPath={selectedProjectPath}
onClearProjectFilter={clearProjectFilter}
```

- [ ] **Step 6: Add filter and empty-state styles**

Add to `src/renderer/styles.css` near the table styles:

```css
.project-filter-chip {
  max-width: 320px;
  margin-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid #b9e9ed;
  border-radius: 999px;
  background: #effbfc;
  color: #157985;
  font: inherit;
  cursor: pointer;
}

.project-filter-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-filter-chip:focus-visible,
.session-filter-empty button:focus-visible {
  outline: 2px solid rgba(34, 199, 217, 0.65);
  outline-offset: 2px;
}

.session-filter-empty {
  min-width: 760px;
  padding: 36px 16px;
  text-align: center;
}

.session-filter-empty h4 {
  margin: 0;
  font-size: 13px;
}

.session-filter-empty p {
  margin: 6px 0 14px;
  color: #777777;
  font-size: 11px;
}

.session-filter-empty button {
  padding: 7px 10px;
  border: 1px solid #d7d7d7;
  border-radius: 5px;
  background: #ffffff;
  color: #333333;
  cursor: pointer;
}
```

- [ ] **Step 7: Run focused tests, type checking, and lint**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/projectSessions.test.ts tests/appNavigation.test.ts tests/analyticsViews.test.tsx tests/appContent.test.tsx tests/i18n.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: all focused selector, navigation, renderer, state-precedence, and localization tests PASS; TypeScript, ESLint, and Prettier exit with code 0.

- [ ] **Step 8: Commit the project-filter experience**

```powershell
git add tests/analyticsViews.test.tsx tests/appContent.test.tsx tests/i18n.test.ts src/renderer/components/SessionsView.tsx src/renderer/components/AppContent.tsx src/renderer/App.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles.css
git commit -m "feat: filter sessions by selected project"
```

---

### Task 5: Full Verification

**Files:**
- Inspect: every file changed by Tasks 1-4.
- Modify only if a verification failure identifies a concrete defect.

**Interfaces:**
- Consumes: the complete project-session drilldown.
- Produces: fresh evidence for behavior, static analysis, formatting, and production build health.

- [ ] **Step 1: Run the complete test suite**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
```

Expected: every Vitest file passes with zero failed tests.

- [ ] **Step 2: Run type checking**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: both Node and web TypeScript projects exit with code 0.

- [ ] **Step 3: Run lint and formatting checks**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: ESLint reports zero warnings or errors and Prettier reports no formatting differences.

- [ ] **Step 4: Build the production application**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: both TypeScript builds and `electron-vite build` exit with code 0.

- [ ] **Step 5: Inspect the final repository state**

```powershell
git status --short
git diff --check
git log -5 --oneline
```

Expected: no uncommitted implementation changes, no whitespace errors, and the four planned commits appear in order. Preserve unrelated user-owned changes, including any pre-existing `AGENTS.md` modification.
