# Total Usage Period Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an unbounded Total usage period and restore the last selected period from renderer `localStorage`, falling back to Month.

**Architecture:** Extend the shared period model with a distinct rolling-period subtype and make the existing summary selector return the complete summary for Total. Keep persistence in a focused renderer utility with an injectable storage interface, then wire it into the controlled toolbar state in `App`.

**Tech Stack:** TypeScript 5.5, React 18, Electron, i18next, Vitest 2

## Global Constraints

- Toolbar order is Today, Week, Month, Total.
- Total includes every session in the complete scanned `UsageSummary` without applying a `startedAt` boundary.
- Month is the fallback when the stored preference is missing, invalid, or unreadable.
- Storage write failures must not roll back the current in-memory selection.
- The preference remains renderer-only; do not add main-process storage, IPC, preload APIs, or dependencies.
- English uses `Total`; Simplified Chinese uses `全部`.
- Existing Today, Week, Month, budget-period, loading, error, and empty-state semantics remain unchanged.
- Follow `AGENTS.md`: no `any`, no `var`, no magic values, functional React components, and explicit render-state modeling.

---

### Task 1: Model Total And Select The Complete Summary

**Files:**
- Modify: `tests/usageMath.test.ts`
- Modify: `src/shared/usageTypes.ts`
- Modify: `src/shared/usageMath.ts`

**Interfaces:**
- Consumes: the existing `UsageSummary` returned by the scanner.
- Produces: `RollingUsagePeriod`, `UsagePeriod`, and `filterUsageSummary(summary, period, now): UsageSummary`.

- [ ] **Step 1: Write the failing Total selector test**

Update the type import and add this test to `tests/usageMath.test.ts`:

```ts
import type { UsagePeriod, UsageSession } from '../src/shared/usageTypes';

it('returns the complete summary for total without applying time validation', () => {
  const now = new Date(2026, 6, 16, 15, 30, 0, 0);
  const sessions = [
    makeSession('old', localDaysAgo(now, 365, 9), 'C:\\repo\\old', 10),
    makeSession(
      'future',
      new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
      'C:\\repo\\future',
      20
    ),
    makeSession('invalid', 'not-a-date', 'C:\\repo\\invalid', 30),
  ];
  const summary = buildUsageSummary(sessions);

  const filtered = filterUsageSummary(summary, 'total' as UsagePeriod, now);

  expect(filtered).toBe(summary);
  expect(filtered.sessions).toHaveLength(3);
  expect(filtered.totals.totalTokens).toBe(60);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- tests/usageMath.test.ts
```

Expected: FAIL because the current selector calculates an invalid rolling boundary for `total` and returns a rebuilt empty summary rather than the original complete summary.

- [ ] **Step 3: Extend the period types and implement the Total branch**

Replace the period declaration in `src/shared/usageTypes.ts` with:

```ts
export type RollingUsagePeriod = 'today' | 'week' | 'month';

export type UsagePeriod = RollingUsagePeriod | 'total';
```

Update the imports and period map in `src/shared/usageMath.ts`:

```ts
import type {
  RollingUsagePeriod,
  TokenUsage,
  UsageDay,
  UsagePeriod,
  UsageProject,
  UsageSession,
  UsageSummary,
} from './usageTypes';

const PERIOD_DAY_COUNTS: Record<RollingUsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
};
```

Add the unbounded branch at the start of `filterUsageSummary`, before reading `now`:

```ts
export const filterUsageSummary = (
  summary: UsageSummary,
  period: UsagePeriod,
  now: Date = new Date()
): UsageSummary => {
  if (period === 'total') {
    return summary;
  }

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
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm test -- tests/usageMath.test.ts
```

Expected: PASS for all usage-math tests, including the new Total behavior and the existing rolling boundaries.

- [ ] **Step 5: Commit the selector change**

```powershell
git add tests/usageMath.test.ts src/shared/usageTypes.ts src/shared/usageMath.ts
git commit -m "feat: add total usage period"
```

---

### Task 2: Add A Safe Renderer Preference Utility

**Files:**
- Create: `tests/usagePeriodPreference.test.ts`
- Create: `src/renderer/utils/usagePeriodPreference.ts`

**Interfaces:**
- Consumes: a minimal `UsagePeriodStorage` with `getItem` and `setItem`.
- Produces: `DEFAULT_USAGE_PERIOD`, `loadUsagePeriodPreference(storage): UsagePeriod`, and `saveUsagePeriodPreference(period, storage): void`.

- [ ] **Step 1: Write failing preference tests**

Create `tests/usagePeriodPreference.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USAGE_PERIOD,
  loadUsagePeriodPreference,
  saveUsagePeriodPreference,
  type UsagePeriodStorage,
} from '../src/renderer/utils/usagePeriodPreference';

describe('usage period preference', () => {
  it('restores every valid saved period', () => {
    const getItem = vi.fn<UsagePeriodStorage['getItem']>();
    const storage: UsagePeriodStorage = {
      getItem,
      setItem: vi.fn<UsagePeriodStorage['setItem']>(),
    };

    for (const period of ['today', 'week', 'month', 'total'] as const) {
      getItem.mockReturnValueOnce(period);
      expect(loadUsagePeriodPreference(storage)).toBe(period);
    }
  });

  it.each([null, '', 'day', 'all'])(
    'falls back to Month for missing or invalid value %s',
    (storedValue) => {
      const storage: UsagePeriodStorage = {
        getItem: vi.fn<UsagePeriodStorage['getItem']>().mockReturnValue(storedValue),
        setItem: vi.fn<UsagePeriodStorage['setItem']>(),
      };

      expect(loadUsagePeriodPreference(storage)).toBe(DEFAULT_USAGE_PERIOD);
    }
  );

  it('falls back to Month when storage cannot be read', () => {
    const storage: UsagePeriodStorage = {
      getItem: vi.fn<UsagePeriodStorage['getItem']>().mockImplementation(() => {
        throw new Error('storage unavailable');
      }),
      setItem: vi.fn<UsagePeriodStorage['setItem']>(),
    };

    expect(loadUsagePeriodPreference(storage)).toBe('month');
  });

  it('saves a selection and tolerates write failures', () => {
    const setItem = vi.fn<UsagePeriodStorage['setItem']>();
    const storage: UsagePeriodStorage = {
      getItem: vi.fn<UsagePeriodStorage['getItem']>(),
      setItem,
    };

    expect(() => saveUsagePeriodPreference('total', storage)).not.toThrow();
    expect(setItem).toHaveBeenCalledWith('codex-token-usage.usage-period', 'total');

    setItem.mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    expect(() => saveUsagePeriodPreference('week', storage)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm test -- tests/usagePeriodPreference.test.ts
```

Expected: FAIL because `src/renderer/utils/usagePeriodPreference.ts` does not exist.

- [ ] **Step 3: Implement the preference boundary**

Create `src/renderer/utils/usagePeriodPreference.ts`:

```ts
/**
 * @file Usage period preference
 * @description Validates and persists the renderer-only usage period selection.
 */

import type { UsagePeriod } from '../../shared/usageTypes';

const USAGE_PERIOD_STORAGE_KEY = 'codex-token-usage.usage-period';

export const DEFAULT_USAGE_PERIOD: UsagePeriod = 'month';

export interface UsagePeriodStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const isUsagePeriod = (value: string | null): value is UsagePeriod =>
  value === 'today' || value === 'week' || value === 'month' || value === 'total';

export const loadUsagePeriodPreference = (storage: UsagePeriodStorage): UsagePeriod => {
  try {
    const storedPeriod = storage.getItem(USAGE_PERIOD_STORAGE_KEY);
    return isUsagePeriod(storedPeriod) ? storedPeriod : DEFAULT_USAGE_PERIOD;
  } catch {
    return DEFAULT_USAGE_PERIOD;
  }
};

export const saveUsagePeriodPreference = (
  period: UsagePeriod,
  storage: UsagePeriodStorage
): void => {
  try {
    storage.setItem(USAGE_PERIOD_STORAGE_KEY, period);
  } catch {
    // The current in-memory selection remains usable when persistence is unavailable.
  }
};
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm test -- tests/usagePeriodPreference.test.ts
```

Expected: PASS with four preference tests.

- [ ] **Step 5: Commit the preference utility**

```powershell
git add tests/usagePeriodPreference.test.ts src/renderer/utils/usagePeriodPreference.ts
git commit -m "feat: persist usage period preference"
```

---

### Task 3: Wire Total Into Toolbar, Localization, And App State

**Files:**
- Modify: `tests/toolbar.test.tsx`
- Modify: `tests/i18n.test.ts`
- Modify: `tests/appContentModel.test.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/components/PeriodEmptyState.tsx`
- Modify: `src/renderer/utils/appContentModel.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`

**Interfaces:**
- Consumes: `RollingUsagePeriod`, `UsagePeriod`, `loadUsagePeriodPreference`, and `saveUsagePeriodPreference`.
- Produces: a four-option controlled `PeriodToggle`, localized Total labels, persisted `App` selection, and a period-empty state restricted to rolling periods.

- [ ] **Step 1: Write failing toolbar, localization, and render-state tests**

Add `UsagePeriod` to the type imports in `tests/toolbar.test.tsx`, then add:

```ts
it('renders Total after Month and reports Total clicks', () => {
  const onPeriodChange = vi.fn();
  const buttons = getButtons(
    PeriodToggle({ period: 'total' as UsagePeriod, onPeriodChange })
  );

  expect(buttons.map((button) => button.props.children)).toEqual([
    'Today',
    'Week',
    'Month',
    'Total',
  ]);
  expect(buttons.map((button) => button.props['aria-pressed'])).toEqual([
    false,
    false,
    false,
    true,
  ]);

  buttons[3].props.onClick();
  expect(onPeriodChange).toHaveBeenCalledWith('total');
});
```

Extend the final test in `tests/i18n.test.ts` with:

```ts
expect(instance.t('common:toolbar.total')).toBe('全部');
```

Add this test to `tests/appContentModel.test.tsx`:

```ts
it('does not classify Total as a rolling-period empty state', () => {
  const model = resolveAppContentModel(
    makeInput({ filteredSummary: EMPTY_SUMMARY, period: 'total' })
  );

  expect(model.kind).toBe('ready');
});
```

- [ ] **Step 2: Run the focused renderer tests and verify RED**

Run:

```powershell
npm test -- tests/toolbar.test.tsx tests/i18n.test.ts tests/appContentModel.test.tsx
```

Expected: FAIL because Total is absent from the toolbar and translation resources, and the content model still allows Total to become `period-empty`.

- [ ] **Step 3: Add Total to the toolbar and translations**

Update `PeriodLabels`, `DEFAULT_PERIOD_LABELS`, `PERIOD_OPTIONS`, and `periodLabels` in `src/renderer/components/Toolbar.tsx`:

```ts
interface PeriodLabels {
  ariaLabel: string;
  today: string;
  week: string;
  month: string;
  total: string;
}

const DEFAULT_PERIOD_LABELS: PeriodLabels = {
  ariaLabel: 'Date range',
  today: 'Today',
  week: 'Week',
  month: 'Month',
  total: 'Total',
};

const PERIOD_OPTIONS: Array<{
  value: UsagePeriod;
  labelKey: keyof Omit<PeriodLabels, 'ariaLabel'>;
}> = [
  { value: 'today', labelKey: 'today' },
  { value: 'week', labelKey: 'week' },
  { value: 'month', labelKey: 'month' },
  { value: 'total', labelKey: 'total' },
];
```

Add `total: t('toolbar.total')` to the localized `periodLabels`.

Add these keys to `src/shared/i18n/locales/en.ts` and `src/shared/i18n/locales/zhCN.ts` respectively:

```ts
total: 'Total',
```

```ts
total: '全部',
```

- [ ] **Step 4: Restrict period-specific empty rendering to rolling periods**

In `src/renderer/components/PeriodEmptyState.tsx`, import `RollingUsagePeriod` instead of `UsagePeriod` and use it for the prop and translation record:

```ts
interface PeriodEmptyStateProps {
  period: RollingUsagePeriod;
}

const PERIOD_TRANSLATION_KEYS = {
  today: 'state.period.today',
  week: 'state.period.week',
  month: 'state.period.month',
} as const satisfies Record<RollingUsagePeriod, string>;
```

In `src/renderer/utils/appContentModel.ts`, import `RollingUsagePeriod` and change the union member:

```ts
| { kind: 'period-empty'; period: RollingUsagePeriod }
```

Narrow the empty branch:

```ts
if (filteredSummary.sessions.length === 0 && period !== 'total') {
  return { kind: 'period-empty', period };
}
```

- [ ] **Step 5: Restore and save the period in App**

Import the preference functions in `src/renderer/App.tsx`:

```ts
import {
  loadUsagePeriodPreference,
  saveUsagePeriodPreference,
} from './utils/usagePeriodPreference';
```

Remove the file-level `DEFAULT_USAGE_PERIOD` constant. Replace the period state with a lazy initializer and add a controlled handler:

```ts
const [period, setPeriod] = useState<UsagePeriod>(() =>
  loadUsagePeriodPreference(window.localStorage)
);

const handlePeriodChange = useCallback((nextPeriod: UsagePeriod): void => {
  setPeriod(nextPeriod);
  saveUsagePeriodPreference(nextPeriod, window.localStorage);
}, []);
```

Pass `handlePeriodChange` to the toolbar:

```tsx
onPeriodChange={handlePeriodChange}
```

- [ ] **Step 6: Run focused tests and type checking**

Run:

```powershell
npm test -- tests/toolbar.test.tsx tests/i18n.test.ts tests/appContentModel.test.tsx tests/usagePeriodPreference.test.ts tests/usageMath.test.ts
npm run typecheck
```

Expected: all focused tests PASS and TypeScript exits with code 0.

- [ ] **Step 7: Commit the renderer integration**

```powershell
git add tests/toolbar.test.tsx tests/i18n.test.ts tests/appContentModel.test.tsx src/renderer/components/Toolbar.tsx src/renderer/components/PeriodEmptyState.tsx src/renderer/utils/appContentModel.ts src/renderer/App.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts
git commit -m "feat: restore total usage selection"
```

---

### Task 4: Full Verification

**Files:**
- Inspect: all files changed by Tasks 1-3
- Modify only if formatting or verification exposes a defect.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: fresh evidence that tests, static analysis, formatting, and production packaging all succeed.

- [ ] **Step 1: Run the complete test suite**

```powershell
npm test
```

Expected: every Vitest file passes with zero failures.

- [ ] **Step 2: Run type checking**

```powershell
npm run typecheck
```

Expected: both Node and web TypeScript projects exit with code 0.

- [ ] **Step 3: Run lint and formatting checks**

```powershell
npm run lint
```

Expected: ESLint reports zero warnings or errors and Prettier reports that all matched files use the expected style.

- [ ] **Step 4: Build the production application**

```powershell
npm run build
```

Expected: TypeScript and `electron-vite build` exit with code 0.

- [ ] **Step 5: Inspect the final diff**

```powershell
git status --short
git diff --check
git log -4 --oneline
```

Expected: no unstaged implementation changes, no whitespace errors, and the three feature commits follow the plan.
