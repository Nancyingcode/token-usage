# Rolling Period Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Today, Week, and Month filter every usage view over rolling local-day periods with consistent totals, projects, sessions, and charts.

**Architecture:** A pure shared function filters sessions by an injected current time and rebuilds the complete `UsageSummary` through the existing aggregator. `App` owns the selected period and passes a controlled value to `Toolbar`, while all usage views consume one memoized filtered summary.

**Tech Stack:** Electron 31, React 18, TypeScript 5, Vitest 2, ESLint 10 with Airbnb rules

## Global Constraints

- `today` covers local midnight today through the supplied current time.
- `week` covers local midnight six days ago through the supplied current time.
- `month` covers local midnight twenty-nine days ago through the supplied current time.
- Classify sessions by `startedAt`; exclude invalid and future timestamps.
- Keep Month as the initial selection.
- Switching periods must not trigger IPC or filesystem scans.
- Overview, Sessions, Projects, and Performance must use the same filtered summary.
- Keep scan warnings and the sidebar warning count scan-wide.
- Preserve the existing toolbar layout, button order, and visual styling.
- Do not modify or stage the user's untracked `AGENTS.md` or `style-guide.md`.

---

### Task 1: Add Rolling Summary Filtering

**Files:**
- Modify: `src/shared/usageTypes.ts`
- Modify: `src/shared/usageMath.ts`
- Modify: `tests/usageMath.test.ts`

**Interfaces:**
- Produces: `UsagePeriod = 'today' | 'week' | 'month'`.
- Produces: `filterUsageSummary(summary: UsageSummary, period: UsagePeriod, now?: Date): UsageSummary`.
- Reuses: `buildUsageSummary(sessions: UsageSession[]): UsageSummary`.

- [x] **Step 1: Write failing period boundary tests**

Extend `tests/usageMath.test.ts` imports:

```ts
import { addTokenUsage, buildUsageSummary, filterUsageSummary } from '../src/shared/usageMath';
```

Add these tests inside `describe('usageMath', ...)`:

```ts
  it('filters today, week, and month as rolling local calendar days', () => {
    const now = new Date(2026, 6, 16, 15, 30, 0, 0);
    const sessions = [
      makeSession('today', localDaysAgo(now, 0, 10), 'C:\\repo\\today', 10),
      makeSession('six-days', localDaysAgo(now, 6, 0), 'C:\\repo\\week', 20),
      makeSession('seven-days', localDaysAgo(now, 7, 12), 'C:\\repo\\month', 30),
      makeSession('twenty-nine-days', localDaysAgo(now, 29, 0), 'C:\\repo\\month', 40),
      makeSession('thirty-days', localDaysAgo(now, 30, 12), 'C:\\repo\\old', 50),
    ];
    const summary = buildUsageSummary(sessions);

    expect(filterUsageSummary(summary, 'today', now).sessions.map(({ sessionId }) => sessionId)).toEqual([
      'today',
    ]);
    expect(filterUsageSummary(summary, 'week', now).sessions.map(({ sessionId }) => sessionId)).toEqual([
      'today',
      'six-days',
    ]);
    expect(filterUsageSummary(summary, 'month', now).sessions.map(({ sessionId }) => sessionId)).toEqual([
      'today',
      'six-days',
      'seven-days',
      'twenty-nine-days',
    ]);
  });

  it('excludes future and invalid sessions and rebuilds every summary group', () => {
    const now = new Date(2026, 6, 16, 15, 30, 0, 0);
    const sessions = [
      makeSession('valid-a', localDaysAgo(now, 1, 9), 'C:\\repo\\alpha', 25),
      makeSession('valid-b', localDaysAgo(now, 2, 9), 'C:\\repo\\beta', 75),
      makeSession('future', new Date(now.getTime() + 1).toISOString(), 'C:\\repo\\future', 200),
      makeSession('invalid', 'not-a-date', 'C:\\repo\\invalid', 300),
    ];

    const filtered = filterUsageSummary(buildUsageSummary(sessions), 'week', now);

    expect(filtered.totals.totalTokens).toBe(100);
    expect(filtered.sessions.map(({ sessionId }) => sessionId)).toEqual(['valid-a', 'valid-b']);
    expect(filtered.byDay).toHaveLength(2);
    expect(filtered.byProject.map(({ projectName }) => projectName)).toEqual(['beta', 'alpha']);
  });
```

Add the helper below `makeSession`:

```ts
function localDaysAgo(now: Date, days: number, hour: number): string {
  const timestamp = new Date(now);
  timestamp.setDate(timestamp.getDate() - days);
  timestamp.setHours(hour, 0, 0, 0);
  return timestamp.toISOString();
}
```

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageMath.test.ts
```

Expected: FAIL because `filterUsageSummary` is not exported.

- [x] **Step 3: Add the shared period type**

Add to `src/shared/usageTypes.ts` before `UsageSummary`:

```ts
export type UsagePeriod = 'today' | 'week' | 'month';
```

- [x] **Step 4: Implement the pure filter**

Update the type import in `src/shared/usageMath.ts` to include `UsagePeriod`, then add:

```ts
const PERIOD_DAY_COUNTS: Record<UsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};

export function filterUsageSummary(
  summary: UsageSummary,
  period: UsagePeriod,
  now: Date = new Date()
): UsageSummary {
  const endTime = now.getTime();

  if (Number.isNaN(endTime)) {
    return buildUsageSummary([]);
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (PERIOD_DAY_COUNTS[period] - 1));
  const startTime = start.getTime();

  return buildUsageSummary(
    summary.sessions.filter((session) => {
      const startedAt = new Date(session.startedAt).getTime();
      return !Number.isNaN(startedAt) && startedAt >= startTime && startedAt <= endTime;
    })
  );
}
```

- [x] **Step 5: Run focused tests, lint, and typecheck**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageMath.test.ts
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- src/shared tests/usageMath.test.ts --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: all four usageMath tests pass, ESLint exits with zero warnings, and both TypeScript projects pass.

- [x] **Step 6: Commit the filtering core**

```powershell
git add src/shared/usageTypes.ts src/shared/usageMath.ts tests/usageMath.test.ts
git commit -m "feat: add rolling usage period filtering"
```

---

### Task 2: Wire The Controlled Period Selector

**Files:**
- Create: `src/renderer/components/PeriodEmptyState.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `eslint.config.js`
- Modify: `tsconfig.web.json`
- Create: `tests/toolbar.test.tsx`

**Interfaces:**
- Consumes: `UsagePeriod` and `filterUsageSummary` from Task 1.
- Adds Toolbar props: `period: UsagePeriod` and `onPeriodChange: (period: UsagePeriod) => void`.
- Produces: named `PeriodToggle` component for isolated interaction testing.
- Produces: `PeriodEmptyState` with `period: UsagePeriod`.

- [x] **Step 1: Write the failing controlled-toggle test**

Create `tests/toolbar.test.tsx`:

```ts
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodToggle } from '../src/renderer/components/Toolbar';

interface PeriodButtonProps {
  'aria-pressed': boolean;
  children: React.ReactNode;
  onClick: () => void;
}

describe('PeriodToggle', () => {
  it('marks the selected period and reports button clicks', () => {
    const onPeriodChange = vi.fn();
    const buttons = getButtons(PeriodToggle({ period: 'week', onPeriodChange }));

    expect(buttons.map((button) => button.props['aria-pressed'])).toEqual([false, true, false]);

    buttons[0].props.onClick();
    expect(onPeriodChange).toHaveBeenCalledWith('today');
  });
});

function getButtons(element: React.ReactNode): Array<React.ReactElement<PeriodButtonProps>> {
  if (!React.isValidElement<{ children: React.ReactNode }>(element)) {
    return [];
  }

  return React.Children.toArray(element.props.children).filter(
    (child): child is React.ReactElement<PeriodButtonProps> =>
      React.isValidElement<PeriodButtonProps>(child) && child.type === 'button'
  );
}
```

- [x] **Step 2: Run the toggle test and verify RED**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/toolbar.test.tsx
```

Expected: FAIL because `Toolbar` does not export `PeriodToggle`. Use the `.tsx` suffix so the Web composite TypeScript project owns this renderer test; add `tests/**/*.tsx` and the `vitest` type to `tsconfig.web.json`, and extend `TYPESCRIPT_FILES` in `eslint.config.js` to cover `tests/**/*.{ts,tsx}`.

- [x] **Step 3: Create the range-specific empty state**

Create `src/renderer/components/PeriodEmptyState.tsx`:

```tsx
import React from 'react';
import { CalendarX2 } from 'lucide-react';
import type { UsagePeriod } from '../../shared/usageTypes';

interface PeriodEmptyStateProps {
  period: UsagePeriod;
}

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  today: 'today',
  week: 'the last 7 days',
  month: 'the last 30 days',
};

const PeriodEmptyState: React.FC<PeriodEmptyStateProps> = ({ period }) => (
  <section className="state-panel">
    <CalendarX2 size={24} />
    <div>
      <h2>No sessions in this period</h2>
      <p>No Codex sessions started during {PERIOD_LABELS[period]}.</p>
    </div>
  </section>
);

export default PeriodEmptyState;
```

- [x] **Step 4: Make Toolbar a controlled segmented input**

In `src/renderer/components/Toolbar.tsx`, import `UsagePeriod`, add the two props, and add:

```tsx
interface PeriodToggleProps {
  period: UsagePeriod;
  onPeriodChange: (period: UsagePeriod) => void;
}

interface ToolbarProps extends PeriodToggleProps {
  activeView: ViewKey;
  loading: boolean;
  scannedAt?: string;
  onRefresh: () => void;
}

const PERIOD_OPTIONS: Array<{ value: UsagePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];
```

Destructure `period` and `onPeriodChange`, then replace the three static buttons with:

```tsx
export const PeriodToggle: React.FC<PeriodToggleProps> = ({ period, onPeriodChange }) => (
  <div className="period-toggle" aria-label="Date range">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={period === option.value ? 'active' : undefined}
            aria-pressed={period === option.value}
            onClick={() => onPeriodChange(option.value)}
          >
            {option.label}
          </button>
        ))}
  </div>
);
```

Render `<PeriodToggle period={period} onPeriodChange={onPeriodChange} />` in the toolbar actions.

- [x] **Step 5: Run the toggle test and verify GREEN**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/toolbar.test.tsx
```

Expected: the selected-state and click-callback test passes.

- [x] **Step 6: Derive one filtered summary in App**

In `src/renderer/App.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { filterUsageSummary } from '../shared/usageMath';
import type { UsagePeriod, UsageScanResult } from '../shared/usageTypes';
import PeriodEmptyState from './components/PeriodEmptyState';

const DEFAULT_USAGE_PERIOD: UsagePeriod = 'month';
```

Add state and the derived summary inside `App`:

```tsx
  const [period, setPeriod] = useState<UsagePeriod>(DEFAULT_USAGE_PERIOD);

  const filteredSummary = useMemo(
    () => (result ? filterUsageSummary(result.summary, period) : null),
    [period, result]
  );
```

Pass controlled props to Toolbar:

```tsx
          period={period}
          onPeriodChange={setPeriod}
```

Keep the existing full-scan empty state. After it, render:

```tsx
        {!error &&
        !loading &&
        result &&
        result.summary.sessions.length > 0 &&
        filteredSummary?.sessions.length === 0 ? (
          <PeriodEmptyState period={period} />
        ) : null}
```

Replace the populated-view condition with `filteredSummary && filteredSummary.sessions.length > 0`, and pass `filteredSummary` to Overview and Performance, `filteredSummary.sessions` to Sessions, and `filteredSummary.byProject` to Projects. Keep `SettingsView result={result}` unchanged so scan warnings remain global.

- [x] **Step 7: Verify the renderer integration**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- src/renderer --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- tests/toolbar.test.tsx --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' exec prettier -- --check src/renderer
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/toolbar.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: renderer and test ESLint have zero warnings, Prettier matches, the toggle test passes, both TypeScript projects pass, and Electron main/preload/renderer production bundles build.

- [x] **Step 8: Commit the controlled selector**

```powershell
git add eslint.config.js tsconfig.web.json src/renderer/App.tsx src/renderer/components/Toolbar.tsx src/renderer/components/PeriodEmptyState.tsx tests/toolbar.test.tsx
git commit -m "feat: connect usage period selector"
```

---

### Task 3: Run Full Verification And Hook Simulation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-rolling-period-filter.md` checkbox status only

**Interfaces:**
- Consumes: the shared filter and controlled renderer integration.
- Produces: verified commits on `master` with no staged user-owned files.

- [x] **Step 1: Run all project verification commands**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: all tests pass, ESLint reports zero warnings, Prettier reports all files formatted, both TypeScript projects pass, and all Electron bundles build.

- [x] **Step 2: Stage the plan and simulate pre-commit**

```powershell
git add docs/superpowers/plans/2026-07-16-rolling-period-filter.md
git status --short
& 'C:\Program Files\Git\bin\sh.exe' .husky/_/pre-commit
```

Expected: only the plan is staged, `AGENTS.md` and `style-guide.md` remain untracked, and lint-staged exits successfully.

- [x] **Step 3: Re-run full verification after hook processing**

Repeat the four commands from Step 1.

Expected: all commands still exit successfully after lint-staged processing.

- [x] **Step 4: Commit the verified plan state**

```powershell
git diff --cached --check
git commit -m "docs: record rolling period implementation"
```

Expected: commitlint and pre-commit pass, and the commit excludes `AGENTS.md` and `style-guide.md`.
