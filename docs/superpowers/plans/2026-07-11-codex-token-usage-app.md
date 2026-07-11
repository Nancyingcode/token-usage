# Codex Token Usage App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Electron app that automatically scans Codex session JSONL files and displays token usage by day, project, and session.

**Architecture:** Electron main process owns filesystem access and exposes a narrow read-only IPC API. Shared TypeScript modules parse session JSONL and aggregate usage records. React renders a Lumo-inspired local-first dashboard with overview, projects, sessions, and settings views.

**Tech Stack:** Electron, Vite, React, TypeScript, Vitest, lucide-react.

## Global Constraints

- Data source: automatically scan `%USERPROFILE%\.codex\sessions`.
- Primary parser: JSONL session files, not the SQLite log database.
- Scope: token counts first, with optional cost estimation as a derived view.
- Visual direction: inspired by Lumo's privacy-first, calm, light, restrained interface, without copying Proton branding.
- Platform target: Windows first, with paths abstracted for future macOS/Linux support.
- Renderer must never access the filesystem directly.
- Parsing errors must not crash the app.

---

## File Structure

- `package.json`: scripts and dependencies for Electron, Vite, React, TypeScript, and Vitest.
- `tsconfig.json`: shared TypeScript compiler settings.
- `tsconfig.node.json`: Electron main/preload and Vitest Node settings.
- `tsconfig.web.json`: React renderer settings.
- `vite.config.ts`: renderer dev/build config and Vitest config.
- `electron.vite.config.ts`: main/preload build config if using electron-vite.
- `index.html`: renderer mount point.
- `src/shared/usageTypes.ts`: shared token usage, session, project, day, warning, and scan result types.
- `src/shared/usageMath.ts`: pure summing, sorting, grouping, and formatting helpers.
- `src/main/codexPaths.ts`: resolves default Codex directories.
- `src/main/sessionParser.ts`: parses JSONL lines and session files into normalized records.
- `src/main/usageScanner.ts`: discovers session files, reads `session_index.jsonl`, and returns a `UsageScanResult`.
- `src/main/ipc.ts`: registers read-only IPC handlers.
- `src/main/main.ts`: Electron app lifecycle and browser window creation.
- `src/preload/preload.ts`: exposes `window.codexUsage.scan()`.
- `src/renderer/global.d.ts`: renderer global type declarations.
- `src/renderer/main.tsx`: React entry point.
- `src/renderer/App.tsx`: app shell, scan state, filters, and view switching.
- `src/renderer/components/*.tsx`: dashboard, tables, metric cards, charts, sidebar, toolbar, settings, and empty/error states.
- `src/renderer/styles.css`: Lumo-inspired visual system and responsive layout.
- `tests/sessionParser.test.ts`: parser unit tests.
- `tests/usageMath.test.ts`: aggregation unit tests.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main/main.ts`
- Create: `src/preload/preload.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm test`
- Produces: a minimal Electron window that renders React text.

- [ ] **Step 1: Create package and config files**

Create `package.json` with scripts:

```json
{
  "name": "codex-token-usage",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/main/main.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc -p tsconfig.node.json && tsc -p tsconfig.web.json && electron-vite build",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.node.json && tsc -p tsconfig.web.json"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "lucide-react": "^0.468.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.3",
    "vite": "^5.3.3",
    "vitest": "^2.0.2"
  }
}
```

- [ ] **Step 2: Add TypeScript and Vite configs**

Create configs that compile main/preload with Node types and renderer with DOM types. `vite.config.ts` must include React and Vitest with `environment: "node"` for tests.

- [ ] **Step 3: Add minimal Electron and React entry points**

`src/main/main.ts` creates a secure BrowserWindow with `contextIsolation: true`, `nodeIntegration: false`, and preload loaded from `src/preload/preload.ts`. `src/renderer/App.tsx` renders the text `Codex Token Usage`.

- [ ] **Step 4: Install dependencies**

Run: `npm install`

Expected: dependencies install and `package-lock.json` is created.

- [ ] **Step 5: Verify scaffold**

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json tsconfig.web.json vite.config.ts index.html src
git commit -m "chore: scaffold electron app"
```

---

### Task 2: Shared Usage Types and Aggregation

**Files:**
- Create: `src/shared/usageTypes.ts`
- Create: `src/shared/usageMath.ts`
- Create: `tests/usageMath.test.ts`

**Interfaces:**
- Produces: `emptyTokenUsage(): TokenUsage`
- Produces: `addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage`
- Produces: `buildUsageSummary(sessions: UsageSession[]): UsageSummary`

- [ ] **Step 1: Write failing aggregation tests**

Create `tests/usageMath.test.ts` covering:

```ts
import { describe, expect, it } from "vitest";
import { addTokenUsage, buildUsageSummary } from "../src/shared/usageMath";
import type { UsageSession } from "../src/shared/usageTypes";

it("adds all token fields", () => {
  expect(addTokenUsage(
    { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 13 },
    { inputTokens: 5, cachedInputTokens: 1, outputTokens: 7, reasoningOutputTokens: 2, totalTokens: 12 }
  )).toEqual({ inputTokens: 15, cachedInputTokens: 3, outputTokens: 10, reasoningOutputTokens: 3, totalTokens: 25 });
});

it("groups sessions by local day and project", () => {
  const sessions: UsageSession[] = [
    makeSession("a", "2026-07-11T01:00:00.000Z", "C:\\Users\\me\\alpha", 100),
    makeSession("b", "2026-07-11T10:00:00.000Z", "C:\\Users\\me\\beta", 50)
  ];
  const summary = buildUsageSummary(sessions);
  expect(summary.totals.totalTokens).toBe(150);
  expect(summary.byDay.length).toBe(1);
  expect(summary.byProject.map((project) => project.projectName)).toEqual(["alpha", "beta"]);
});

function makeSession(sessionId: string, startedAt: string, projectPath: string, totalTokens: number): UsageSession {
  return {
    sessionId,
    startedAt,
    endedAt: startedAt,
    projectPath,
    projectName: projectPath.split("\\").pop() ?? projectPath,
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
    eventCount: 1,
    sourceFile: `${sessionId}.jsonl`,
    warnings: []
  };
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/usageMath.test.ts`

Expected: FAIL because `usageMath` and `usageTypes` do not exist.

- [ ] **Step 3: Implement types and aggregation helpers**

Define `TokenUsage`, `UsageSession`, `UsageProject`, `UsageDay`, `UsageSummary`, `UsageWarning`, and `UsageScanResult`. Implement token addition, project-name extraction, day grouping with `Intl.DateTimeFormat`, project grouping, and descending token sorting.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/usageMath.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared tests/usageMath.test.ts
git commit -m "feat: add usage aggregation helpers"
```

---

### Task 3: Codex Session Parser

**Files:**
- Create: `src/main/sessionParser.ts`
- Create: `tests/sessionParser.test.ts`

**Interfaces:**
- Consumes: `TokenUsage`, `UsageSession`
- Produces: `parseSessionJsonl(sourceFile: string, content: string, threadName?: string): UsageSession`

- [ ] **Step 1: Write failing parser tests**

Create tests for:

```ts
import { describe, expect, it } from "vitest";
import { parseSessionJsonl } from "../src/main/sessionParser";

it("sums last_token_usage events", () => {
  const content = [
    JSON.stringify({ timestamp: "2026-07-11T01:00:00.000Z", type: "session_meta", payload: { session_id: "s1", cwd: "C:\\repo\\alpha" } }),
    JSON.stringify({ timestamp: "2026-07-11T01:01:00.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: usage(10, 2, 3, 1, 13), total_token_usage: usage(10, 2, 3, 1, 13) } } }),
    JSON.stringify({ timestamp: "2026-07-11T01:02:00.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: usage(7, 1, 5, 2, 12), total_token_usage: usage(17, 3, 8, 3, 25) } } })
  ].join("\n");
  const session = parseSessionJsonl("s1.jsonl", content, "Alpha thread");
  expect(session.sessionId).toBe("s1");
  expect(session.threadName).toBe("Alpha thread");
  expect(session.projectName).toBe("alpha");
  expect(session.inputTokens).toBe(17);
  expect(session.totalTokens).toBe(25);
  expect(session.eventCount).toBe(2);
});

it("falls back to largest total_token_usage when increments are missing", () => {
  const content = [
    JSON.stringify({ timestamp: "2026-07-11T01:00:00.000Z", type: "session_meta", payload: { session_id: "s2", cwd: "C:\\repo\\beta" } }),
    JSON.stringify({ timestamp: "2026-07-11T01:01:00.000Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage(5, 0, 1, 0, 6) } } }),
    JSON.stringify({ timestamp: "2026-07-11T01:02:00.000Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: usage(20, 4, 6, 1, 26) } } })
  ].join("\n");
  const session = parseSessionJsonl("s2.jsonl", content);
  expect(session.totalTokens).toBe(26);
  expect(session.cachedInputTokens).toBe(4);
});

it("keeps partial data when a line is malformed", () => {
  const content = [
    JSON.stringify({ timestamp: "2026-07-11T01:00:00.000Z", type: "session_meta", payload: { session_id: "s3", cwd: "C:\\repo\\gamma" } }),
    "{bad json",
    JSON.stringify({ timestamp: "2026-07-11T01:01:00.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: usage(1, 0, 1, 0, 2) } } })
  ].join("\n");
  const session = parseSessionJsonl("s3.jsonl", content);
  expect(session.totalTokens).toBe(2);
  expect(session.warnings.length).toBe(1);
});

function usage(input_tokens: number, cached_input_tokens: number, output_tokens: number, reasoning_output_tokens: number, total_tokens: number) {
  return { input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens };
}
```

- [ ] **Step 2: Run parser tests to verify failure**

Run: `npm test -- tests/sessionParser.test.ts`

Expected: FAIL because parser is missing.

- [ ] **Step 3: Implement `parseSessionJsonl`**

Parse line by line with `JSON.parse` inside `try/catch`. Track session metadata, first and last timestamps, summed `last_token_usage`, largest total snapshot, event count, and warnings. Convert Codex snake_case token fields into shared camelCase fields.

- [ ] **Step 4: Run parser tests to verify pass**

Run: `npm test -- tests/sessionParser.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/sessionParser.ts tests/sessionParser.test.ts
git commit -m "feat: parse codex session token usage"
```

---

### Task 4: Filesystem Scanner and IPC

**Files:**
- Create: `src/main/codexPaths.ts`
- Create: `src/main/usageScanner.ts`
- Create: `src/main/ipc.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/preload.ts`
- Create: `src/renderer/global.d.ts`

**Interfaces:**
- Consumes: `parseSessionJsonl(sourceFile, content, threadName?)`
- Produces: `scanCodexUsage(options?: { sessionsDir?: string }): Promise<UsageScanResult>`
- Produces: `window.codexUsage.scan(): Promise<UsageScanResult>`

- [ ] **Step 1: Implement path resolution and scanner**

`getDefaultCodexSessionsDir()` returns `path.join(os.homedir(), ".codex", "sessions")`. `scanCodexUsage` recursively finds `*.jsonl` files under that directory, loads optional thread names from `path.join(os.homedir(), ".codex", "session_index.jsonl")`, parses files, aggregates summary, and returns warnings for missing directories or unreadable files.

- [ ] **Step 2: Add IPC API**

Register `ipcMain.handle("usage:scan", () => scanCodexUsage())`. In preload, expose:

```ts
contextBridge.exposeInMainWorld("codexUsage", {
  scan: () => ipcRenderer.invoke("usage:scan")
});
```

Add `src/renderer/global.d.ts` with the `window.codexUsage` type.

- [ ] **Step 3: Wire IPC during app startup**

Call `registerUsageIpc()` before creating the BrowserWindow. Keep `contextIsolation: true` and `nodeIntegration: false`.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/codexPaths.ts src/main/usageScanner.ts src/main/ipc.ts src/main/main.ts src/preload/preload.ts src/renderer/global.d.ts
git commit -m "feat: expose local codex usage scanner"
```

---

### Task 5: Dashboard UI

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/components/Sidebar.tsx`
- Create: `src/renderer/components/Toolbar.tsx`
- Create: `src/renderer/components/MetricCard.tsx`
- Create: `src/renderer/components/Overview.tsx`
- Create: `src/renderer/components/ProjectsView.tsx`
- Create: `src/renderer/components/SessionsView.tsx`
- Create: `src/renderer/components/SettingsView.tsx`
- Create: `src/renderer/components/EmptyState.tsx`
- Create: `src/renderer/components/TokenBar.tsx`

**Interfaces:**
- Consumes: `window.codexUsage.scan()`
- Consumes: `UsageScanResult`
- Produces: usable dashboard with Overview, Projects, Sessions, Settings.

- [ ] **Step 1: Build scan state and navigation shell**

`App.tsx` should call `window.codexUsage.scan()` on mount, store `loading`, `result`, `error`, `activeView`, `query`, and `dateRange`, and render sidebar plus main content.

- [ ] **Step 2: Build overview components**

Overview shows total token cards, input/cached/output/reasoning cards, a simple CSS bar trend for daily totals, and top projects. Use lucide icons for refresh, search, alert, folder, calendar, and settings.

- [ ] **Step 3: Build Projects and Sessions views**

Projects view renders ranked project rows sorted by total tokens. Sessions view filters by query across session id, thread name, and project path, then renders token columns and warning status.

- [ ] **Step 4: Build Settings and empty/error states**

Settings shows detected data path, local-only status, last scan time, warning count, and cost-estimation placeholder. Empty state appears when no sessions are found. Error state appears when IPC fails.

- [ ] **Step 5: Apply Lumo-inspired visual styling**

Use a light neutral background, restrained accent colors, 8px radius cards, compact tables, stable toolbar sizing, no landing page, no decorative gradient orbs, and Chinese UI copy for the user-facing app.

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS and `dist` output exists.

- [ ] **Step 7: Commit**

```bash
git add src/renderer
git commit -m "feat: build token usage dashboard"
```

---

### Task 6: Verification and Polish

**Files:**
- Modify as needed: parser, scanner, renderer styles, docs.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified local Electron app.

- [ ] **Step 1: Run unit tests**

Run: `npm test`

Expected: all parser and aggregation tests pass.

- [ ] **Step 2: Run typecheck and build**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Run the app**

Run: `npm run dev`

Expected: Electron window opens, scans the user's Codex sessions, and displays dashboard data without renderer filesystem access.

- [ ] **Step 4: Hand-check one session total**

Pick one `.codex\sessions\...\rollout-*.jsonl` file. Compare summed `last_token_usage.total_tokens` from the file with the session row in the app. Expected: values match, or the row shows a warning if fallback logic was used.

- [ ] **Step 5: Final commit**

```bash
git status --short
git add .
git commit -m "chore: verify codex token usage app"
```

