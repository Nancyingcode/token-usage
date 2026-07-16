# Environment-Aware Application Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Electron's native application menu visible in development and remove it from packaged production builds.

**Architecture:** A small pure policy helper converts Electron's packaged state into explicit window and application-menu decisions. The Electron main process consumes that policy when creating windows and after `app.whenReady()`, while unit tests validate both environments without launching Electron.

**Tech Stack:** Electron 31, TypeScript 5, Vitest 2, electron-vite

## Global Constraints

- Use `app.isPackaged` as the single source of truth for menu environment detection.
- Development builds must keep the default menu and show the menu bar at all times.
- Packaged production builds must remove the application menu and hide the window menu bar.
- Do not add a custom menu, change keyboard shortcuts, or modify renderer code.

---

### Task 1: Add and Integrate the Application Menu Policy

**Files:**
- Create: `src/main/menuPolicy.ts`
- Create: `tests/menuPolicy.test.ts`
- Modify: `src/main/main.ts:1-34`

**Interfaces:**
- Consumes: Electron's `app.isPackaged: boolean` and existing `Menu.setApplicationMenu(null)` API.
- Produces: `getApplicationMenuPolicy(isPackaged: boolean): ApplicationMenuPolicy`, where `ApplicationMenuPolicy` contains `autoHideMenuBar: boolean` and `removeApplicationMenu: boolean`.

- [x] **Step 1: Write the failing policy tests**

Create `tests/menuPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getApplicationMenuPolicy } from "../src/main/menuPolicy";

describe("getApplicationMenuPolicy", () => {
  it("keeps the menu visible in development", () => {
    expect(getApplicationMenuPolicy(false)).toEqual({
      autoHideMenuBar: false,
      removeApplicationMenu: false
    });
  });

  it("removes and hides the menu in packaged production", () => {
    expect(getApplicationMenuPolicy(true)).toEqual({
      autoHideMenuBar: true,
      removeApplicationMenu: true
    });
  });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/menuPolicy.test.ts`

Expected: FAIL because `../src/main/menuPolicy` does not exist.

- [x] **Step 3: Implement the minimal pure policy helper**

Create `src/main/menuPolicy.ts`:

```ts
export interface ApplicationMenuPolicy {
  autoHideMenuBar: boolean;
  removeApplicationMenu: boolean;
}

export function getApplicationMenuPolicy(
  isPackaged: boolean
): ApplicationMenuPolicy {
  return {
    autoHideMenuBar: isPackaged,
    removeApplicationMenu: isPackaged
  };
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/menuPolicy.test.ts`

Expected: PASS with 2 tests passing.

- [x] **Step 5: Integrate the policy into the Electron main process**

Update `src/main/main.ts` to import the helper, use it in `createWindow()`, and conditionally remove the application menu:

```ts
import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerUsageIpc } from "./ipc";
import { getApplicationMenuPolicy } from "./menuPolicy";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function createWindow(): void {
  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#f8f7f4",
    autoHideMenuBar: menuPolicy.autoHideMenuBar,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerUsageIpc();

  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  if (menuPolicy.removeApplicationMenu) {
    Menu.setApplicationMenu(null);
  }

  createWindow();
```

Keep the existing `activate` and `window-all-closed` handlers unchanged.

- [x] **Step 6: Run complete verification**

Run: `npm test`

Expected: PASS with all test files and tests passing.

Run: `npm run lint`

Expected: exits with code 0 and no ESLint errors.

Run: `npm run typecheck`

Expected: exits with code 0 and no TypeScript errors.

Run: `npm run build`

Expected: exits with code 0 and produces the Electron bundles under `out/`.

- [x] **Step 7: Commit the implementation**

```bash
git add src/main/menuPolicy.ts src/main/main.ts tests/menuPolicy.test.ts docs/superpowers/plans/2026-07-16-environment-aware-application-menu.md
git commit -m "fix: show application menu in development"
```
