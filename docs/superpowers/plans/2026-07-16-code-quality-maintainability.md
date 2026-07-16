# Code Quality and Maintainability Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the codebase with `AGENTS.md` by adding Prettier, standardizing React component declarations and constants, consolidating duplicated pure logic, and removing dead renderer state without changing behavior.

**Architecture:** Formatting remains a repository-level tool concern. Derived usage metrics and session ID extraction become small pure shared modules with direct unit tests, while renderer components retain presentation and formatting responsibilities. Existing Electron, IPC, scanner, parser, and renderer data flow remains unchanged.

**Tech Stack:** Electron 31, React 18, TypeScript 5, ESLint 10, Prettier 3, Vitest 2, electron-vite 2

## Global Constraints

- Preserve all existing UI behavior, IPC contracts, scan results, and token aggregation rules.
- Use npm because the repository uses `package-lock.json` and npm scripts.
- Do not modify or stage the user's untracked `AGENTS.md` or `style-guide.md` files.
- Use `React.FC<Props>` and named Props interfaces for renderer components.
- Use `UPPER_CASE_SNAKE_CASE` for module-level constants.
- Do not add `any`, `var`, a custom Electron menu, new UI functionality, parser behavior changes, or scanner concurrency changes.
- Keep default-exported components compatible with existing imports.

---

### Task 1: Add Prettier and Integrate Formatting Checks

**Files:**
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `eslint.config.js`
- Modify: `lint-staged.config.cjs`
- Format: `src/**/*.{ts,tsx}`, `tests/**/*.ts`, and root configuration files supported by Prettier

**Interfaces:**
- Consumes: existing `npm run lint`, `npm run lint:fix`, and Husky `pre-commit` workflow.
- Produces: `npm run lint` as a non-mutating ESLint and Prettier check; `npm run lint:fix` as the automatic fixer; staged-file formatting through `lint-staged`.

- [x] **Step 1: Install Prettier as a development dependency**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install --save-dev prettier
```

Expected: `prettier` appears only in `devDependencies`, and `package-lock.json` records the installed version.

- [x] **Step 2: Add the formatting configuration**

Create `.prettierrc.json`:

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "none"
}
```

Create `.prettierignore`:

```text
node_modules/
dist/
out/
coverage/
docs/
*.md
package-lock.json
```

- [x] **Step 3: Update npm scripts and explicit ESLint safeguards**

Change the script entries in `package.json` to:

```json
"lint": "eslint . && prettier --check .",
"lint:fix": "eslint . --fix && prettier --write .",
```

Add these explicit rules inside the TypeScript ESLint rules object in `eslint.config.js`:

```js
"@typescript-eslint/no-explicit-any": "error",
"no-var": "error",
```

Keep the existing React Hooks, unused-variable, and React Refresh rules unchanged.

- [x] **Step 4: Update staged-file automation**

Replace `lint-staged.config.cjs` with:

```js
module.exports = {
  "*.{js,cjs,mjs,ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,css,html}": "prettier --write"
};
```

- [x] **Step 5: Verify the formatting check detects existing differences**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: ESLint passes; Prettier either passes immediately or reports specific unformatted files. A Prettier failure at this step proves the formatting gate is active.

- [x] **Step 6: Apply formatting and verify the tooling gate**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint:fix
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: all three commands exit with code 0. `AGENTS.md`, `style-guide.md`, documentation, generated output, and `package-lock.json` are not reformatted by Prettier.

- [x] **Step 7: Commit the tooling integration**

```powershell
git add .prettierrc.json .prettierignore package.json package-lock.json eslint.config.js lint-staged.config.cjs src tests electron.vite.config.ts vite.config.ts tsconfig.json tsconfig.node.json tsconfig.web.json
git commit -m "chore: integrate prettier formatting"
```

Before committing, verify `git status --short` still shows `AGENTS.md` and `style-guide.md` as untracked and unstaged.

---

### Task 2: Extract and Reuse Derived Usage Metrics

**Files:**
- Create: `src/shared/usageMetrics.ts`
- Create: `tests/usageMetrics.test.ts`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/components/PerformanceView.tsx`

**Interfaces:**
- Consumes: `UsageSession[]` and raw token counts from existing `UsageSummary` values.
- Produces: `estimateTokenCost(totalTokens: number): number`, `getCachePercentage(inputTokens: number, cachedInputTokens: number): number`, `countSessionWarnings(sessions: UsageSession[]): number`, and `getWarningRate(sessions: UsageSession[]): number`.

- [x] **Step 1: Write failing tests for the shared metric API**

Create `tests/usageMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  countSessionWarnings,
  estimateTokenCost,
  getCachePercentage,
  getWarningRate
} from "../src/shared/usageMetrics";
import type { UsageSession } from "../src/shared/usageTypes";

describe("usageMetrics", () => {
  it("estimates cost from total tokens", () => {
    expect(estimateTokenCost(1_000_000)).toBe(1.35);
  });

  it("calculates cache percentage and handles empty input", () => {
    expect(getCachePercentage(200, 50)).toBe(25);
    expect(getCachePercentage(0, 50)).toBe(0);
  });

  it("counts warnings and calculates their session rate", () => {
    const sessions = [makeSession(2), makeSession(0), makeSession(1)];

    expect(countSessionWarnings(sessions)).toBe(3);
    expect(getWarningRate(sessions)).toBe(100);
    expect(getWarningRate([])).toBe(0);
  });
});

function makeSession(warningCount: number): UsageSession {
  return {
    sessionId: `session-${warningCount}`,
    startedAt: "2026-07-16T00:00:00.000Z",
    endedAt: "2026-07-16T00:00:00.000Z",
    projectPath: "C:\\repo",
    projectName: "repo",
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    eventCount: 0,
    sourceFile: `session-${warningCount}.jsonl`,
    warnings: Array.from({ length: warningCount }, () => ({ message: "warning" }))
  };
}
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageMetrics.test.ts
```

Expected: FAIL because `src/shared/usageMetrics.ts` does not exist.

- [x] **Step 3: Implement the minimal shared metrics module**

Create `src/shared/usageMetrics.ts`:

```ts
import type { UsageSession } from "./usageTypes";

const TOKENS_PER_MILLION = 1_000_000;
const ESTIMATED_COST_PER_MILLION_TOKENS = 1.35;
const PERCENT_SCALE = 100;

export function estimateTokenCost(totalTokens: number): number {
  return (totalTokens / TOKENS_PER_MILLION) * ESTIMATED_COST_PER_MILLION_TOKENS;
}

export function getCachePercentage(
  inputTokens: number,
  cachedInputTokens: number
): number {
  if (inputTokens <= 0) {
    return 0;
  }

  return Math.round((cachedInputTokens / inputTokens) * PERCENT_SCALE);
}

export function countSessionWarnings(sessions: UsageSession[]): number {
  return sessions.reduce((total, session) => total + session.warnings.length, 0);
}

export function getWarningRate(sessions: UsageSession[]): number {
  if (sessions.length === 0) {
    return 0;
  }

  return (countSessionWarnings(sessions) / sessions.length) * PERCENT_SCALE;
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageMetrics.test.ts
```

Expected: PASS with 3 tests.

- [x] **Step 5: Replace renderer-local derived calculations**

In `Overview.tsx`, import and use the shared helpers:

```ts
import { estimateTokenCost, getCachePercentage } from "../../shared/usageMetrics";

const totalCost = estimateTokenCost(summary.totals.totalTokens);
const cachePercentage = getCachePercentage(
  summary.totals.inputTokens,
  summary.totals.cachedInputTokens
);
```

Use `cachePercentage` in the Tokens metric detail, then remove the local `estimateCost` and `cachePercent` functions.

In `PerformanceView.tsx`, import the shared helpers and calculate each value once:

```ts
import {
  countSessionWarnings,
  estimateTokenCost,
  getCachePercentage,
  getWarningRate
} from "../../shared/usageMetrics";

const cacheRate = getCachePercentage(
  summary.totals.inputTokens,
  summary.totals.cachedInputTokens
);
const totalCost = estimateTokenCost(summary.totals.totalTokens);
const warningCount = countSessionWarnings(summary.sessions);
const warningRate = getWarningRate(summary.sessions);
```

Render cost with `totalCost.toFixed(2)`, warning text with `warningRate.toFixed(2)` and `warningCount`, and the donut with `100 - warningRate`. Remove local `warningTotal` and `errorRate` functions.

- [x] **Step 6: Verify the metric refactor**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: all tests pass and both checks exit with code 0.

- [x] **Step 7: Commit the shared metrics refactor**

```powershell
git add src/shared/usageMetrics.ts tests/usageMetrics.test.ts src/renderer/components/Overview.tsx src/renderer/components/PerformanceView.tsx
git commit -m "refactor: centralize usage metrics"
```

---

### Task 3: Centralize Session ID Extraction

**Files:**
- Create: `src/shared/sessionId.ts`
- Create: `tests/sessionId.test.ts`
- Modify: `src/main/sessionParser.ts`
- Modify: `src/main/usageScanner.ts`

**Interfaces:**
- Consumes: a rollout filename or full Windows/POSIX path.
- Produces: `getSessionId(sourcePath: string): string` with the existing `.jsonl` fallback behavior.

- [x] **Step 1: Write failing tests for path and fallback behavior**

Create `tests/sessionId.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getSessionId } from "../src/shared/sessionId";

describe("getSessionId", () => {
  it("extracts an id from a rollout filename", () => {
    expect(getSessionId("rollout-2026-07-16T12-30-45-session-id.jsonl")).toBe(
      "session-id"
    );
  });

  it("extracts an id from a full Windows path", () => {
    expect(
      getSessionId(
        "C:\\Users\\me\\.codex\\sessions\\2026\\07\\16\\rollout-2026-07-16T12-30-45-abc.jsonl"
      )
    ).toBe("abc");
  });

  it("falls back to a non-rollout filename without its extension", () => {
    expect(getSessionId("C:/sessions/custom.jsonl")).toBe("custom");
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sessionId.test.ts
```

Expected: FAIL because `src/shared/sessionId.ts` does not exist.

- [x] **Step 3: Implement the pure session ID helper**

Create `src/shared/sessionId.ts`:

```ts
const ROLLOUT_SESSION_FILE_PATTERN =
  /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/;
const JSONL_EXTENSION_PATTERN = /\.jsonl$/;

export function getSessionId(sourcePath: string): string {
  const normalizedPath = sourcePath.replace(/\\/g, "/");
  const sourceName = normalizedPath.split("/").pop() ?? sourcePath;
  const match = sourceName.match(ROLLOUT_SESSION_FILE_PATTERN);

  return match?.[1] ?? sourceName.replace(JSONL_EXTENSION_PATTERN, "");
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sessionId.test.ts
```

Expected: PASS with 3 tests.

- [x] **Step 5: Replace both duplicate implementations**

In `sessionParser.ts`, remove the `node:path` import and local `sessionIdFromFile` function. Import the helper and initialize the ID directly:

```ts
import { getSessionId } from "../shared/sessionId";

let sessionId = getSessionId(sourceFile);
```

In `usageScanner.ts`, import the same helper, replace `sessionIdFromPath(file)` with `getSessionId(file)`, and delete the local `sessionIdFromPath` function:

```ts
import { getSessionId } from "../shared/sessionId";

const sourceSessionId = getSessionId(file);
```

- [x] **Step 6: Verify parser compatibility and shared behavior**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: all tests pass, including existing parser tests, and both checks exit with code 0.

- [x] **Step 7: Commit the session ID refactor**

```powershell
git add src/shared/sessionId.ts tests/sessionId.test.ts src/main/sessionParser.ts src/main/usageScanner.ts
git commit -m "refactor: centralize session id parsing"
```

---

### Task 4: Standardize React Components and Named Constants

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/EmptyState.tsx`
- Modify: `src/renderer/components/MetricCard.tsx`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/components/PerformanceView.tsx`
- Modify: `src/renderer/components/ProjectsView.tsx`
- Modify: `src/renderer/components/SessionsView.tsx`
- Modify: `src/renderer/components/SettingsView.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/components/TokenBar.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/main/main.ts`

**Interfaces:**
- Consumes: existing component Props interfaces and shared metric functions from Task 2.
- Produces: behavior-equivalent `React.FC<Props>` components, named helper Props interfaces, and local explanatory constants.

- [x] **Step 1: Remove dead query state from `App.tsx`**

Use this import and declaration structure:

```ts
import React, { useCallback, useEffect, useState } from "react";
import type { UsageScanResult } from "../shared/usageTypes";

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewKey>("overview");
  const [result, setResult] = useState<UsageScanResult | null>(null);
```

Delete `query`, `filteredSessions`, `useMemo`, `UsageSession`, and `sessionMatchesQuery`. Render the sessions view with:

```tsx
{activeView === "sessions" ? (
  <SessionsView sessions={result.summary.sessions} />
) : null}
```

Close the component with `};` and preserve `export default App;`.

- [x] **Step 2: Convert top-level renderer components to `React.FC`**

Apply these exact declaration forms while preserving each existing JSX body:

```ts
const EmptyState: React.FC<EmptyStateProps> = ({ sessionsDir, warnings }) => {
const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, icon: Icon, tone }) => {
const Overview: React.FC<OverviewProps> = ({ summary }) => {
const PerformanceView: React.FC<PerformanceViewProps> = ({ summary }) => {
const ProjectsView: React.FC<ProjectsViewProps> = ({ projects }) => {
const SessionsView: React.FC<SessionsViewProps> = ({ sessions }) => {
const SettingsView: React.FC<SettingsViewProps> = ({ result }) => {
const Sidebar: React.FC<SidebarProps> = ({ activeView, warningCount, onChange }) => {
const TokenBar: React.FC<TokenBarProps> = ({ value, max, tone = "blue" }) => {
const Toolbar: React.FC<ToolbarProps> = ({ activeView, loading, scannedAt, onRefresh }) => {
```

End each declaration with `};` and add `export default ComponentName;` after any module-local helpers so existing default imports remain unchanged.

- [x] **Step 3: Add named Props interfaces for helper components**

In `Overview.tsx`, add and use:

```ts
interface TrendChartProps {
  days: UsageDay[];
  max: number;
}

interface ActivityGridProps {
  days: UsageDay[];
}

const TrendChart: React.FC<TrendChartProps> = ({ days, max }) => {
const ActivityGrid: React.FC<ActivityGridProps> = ({ days }) => {
```

In `PerformanceView.tsx`, add and use:

```ts
interface MiniLineProps {
  days: Array<{ date: string; totalTokens: number }>;
  max: number;
  tone: "cyan" | "blue";
}

interface DonutProps {
  value: number;
}

const MiniLine: React.FC<MiniLineProps> = ({ days, max, tone }) => {
const Donut: React.FC<DonutProps> = ({ value }) => {
```

- [x] **Step 4: Rename module constants and extract targeted magic values**

Use module-local uppercase constants with these ownership boundaries:

```ts
// main.ts
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 820;
const MINIMUM_WINDOW_WIDTH = 1024;
const MINIMUM_WINDOW_HEIGHT = 680;
const WINDOW_BACKGROUND_COLOR = "#f8f7f4";

// MetricCard.tsx
const COMPACT_NUMBER_THRESHOLD = 1_000;

// Overview.tsx
const CHART_COLORS = ["#3b82f6", "#a855f7", "#22c7d9"];
const TREND_HISTORY_DAYS = 24;
const ACTIVITY_HISTORY_DAYS = 84;
const ACTIVITY_CELL_COUNT = 84;
const ACTIVITY_LEVEL_COUNT = 4;

// PerformanceView.tsx
const PERFORMANCE_HISTORY_DAYS = 30;
const PEAK_SESSION_COUNT = 12;
const DONUT_RADIUS = 48;
const PERCENT_SCALE = 100;

// SessionsView.tsx
const SHORT_ID_MAX_LENGTH = 12;
const SHORT_ID_PREFIX_LENGTH = 8;
const SHORT_ID_SUFFIX_LENGTH = 4;

// SettingsView.tsx
const MAX_VISIBLE_WARNINGS = 8;

// Sidebar.tsx
const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "sessions", label: "Sessions", icon: MessageSquareText },
  { key: "tools", label: "Tools", icon: Wrench },
  { key: "performance", label: "Performance", icon: Gauge },
  { key: "wrapped", label: "Wrapped", icon: Boxes }
];

// TokenBar.tsx
const MINIMUM_VISIBLE_HEIGHT_PERCENT = 3;
const PERCENT_SCALE = 100;

// Toolbar.tsx
const VIEW_LABELS: Record<ViewKey, string> = {
  overview: "Overview",
  sessions: "Sessions",
  tools: "Tools",
  performance: "Performance",
  wrapped: "Wrapped"
};
```

Replace only the corresponding existing literals and lower-case module constants. Keep SVG view-box geometry local because those values directly describe the static SVG coordinate system and extracting every coordinate would reduce readability.

- [x] **Step 5: Format and verify the structural refactor**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint:fix
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: all commands exit with code 0; all tests pass; Electron main, preload, and renderer bundles are produced under `out/`.

- [x] **Step 6: Confirm the final diff and commit**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; `AGENTS.md` and `style-guide.md` remain untracked and unstaged.

Commit only implementation and plan files:

```powershell
git add src tests package.json package-lock.json .prettierrc.json .prettierignore eslint.config.js lint-staged.config.cjs docs/superpowers/plans/2026-07-16-code-quality-maintainability.md
git commit -m "refactor: align code with repository standards"
```
