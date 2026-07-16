# Airbnb Rules on ESLint 10 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Airbnb core, module, React, Hooks, and JSX accessibility rules through ESLint 10 while retaining TypeScript ESLint 8 and preserving application behavior.

**Architecture:** `FlatCompat` translates the classic Airbnb presets, `@eslint/compat` adapts their legacy plugin APIs, and TypeScript ESLint 8 supplies syntax-aware equivalents for conflicting core rules. A programmatic ESLint regression test proves that every required rule family remains active, while Prettier owns formatting with Airbnb-compatible output settings.

**Tech Stack:** ESLint 10, TypeScript ESLint 8, Airbnb config 19, React 18, Prettier 3, Vitest 2, Electron 31

## Global Constraints

- Keep ESLint on major version 10 and TypeScript ESLint on major version 8.
- Do not install or extend `eslint-config-airbnb-typescript`.
- Load Airbnb core, module, React, Hooks, and JSX accessibility rule families; do not silently omit a family if compatibility fails.
- Use `--legacy-peer-deps` only for the known upstream peer-range mismatch.
- Do not add file-level or line-level `eslint-disable` comments for ordinary violations.
- Preserve token calculations, JSONL parsing semantics, warning order, UI copy, navigation, IPC, Electron security options, and menu behavior.
- Do not modify or stage the user's untracked `AGENTS.md` or `style-guide.md`.
- Stop and report if a compatibility plugin fails to load or a new global rule exception is required beyond the approved design.

---

### Task 1: Install and Prove the ESLint 10 Compatibility Bridge

**Files:**
- Create: `tests/eslintConfig.test.ts`
- Modify: `eslint.config.js`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: ESLint 10's `ESLint.calculateConfigForFile()` API and existing TypeScript/TSX source paths.
- Produces: a flat configuration that exposes Airbnb core/import/React/Hooks/a11y rules and TypeScript-aware replacements at error severity.

- [x] **Step 1: Write the failing configuration regression test**

Create `tests/eslintConfig.test.ts`:

```ts
import { ESLint } from 'eslint';
import type { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';

const ERROR_SEVERITY = 2;
const OFF_SEVERITY = 0;

describe('eslint configuration', () => {
  it('loads every required Airbnb rule family for TSX', async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const config = await eslint.calculateConfigForFile('src/renderer/App.tsx');

    expect(ruleSeverity(config.rules?.eqeqeq)).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['import/no-unresolved'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['react/jsx-no-target-blank'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['react-hooks/rules-of-hooks'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['jsx-a11y/alt-text'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['@typescript-eslint/no-shadow'])).toBe(ERROR_SEVERITY);
    expect(ruleSeverity(config.rules?.['no-shadow'])).toBe(OFF_SEVERITY);
    expect(ruleSeverity(config.rules?.['comma-dangle'])).toBe(OFF_SEVERITY);
  });
});

function ruleSeverity(rule: Linter.RuleEntry | undefined): Linter.RuleSeverity | undefined {
  return Array.isArray(rule) ? rule[0] : rule;
}
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/eslintConfig.test.ts
```

Expected: FAIL because the current configuration has no `import/no-unresolved`, React, JSX accessibility, or TypeScript `no-shadow` rule.

- [x] **Step 3: Install the compatibility and Airbnb dependencies**

Run:

```powershell
$env:npm_config_offline='false'
& 'C:\Program Files\nodejs\npm.cmd' install --save-dev --legacy-peer-deps @eslint/compat @eslint/eslintrc eslint-config-airbnb@19.0.4 eslint-config-prettier eslint-import-resolver-typescript eslint-plugin-import@2.32.0 eslint-plugin-jsx-a11y@6.10.2 eslint-plugin-react@7.37.5
```

Expected: all packages appear in `devDependencies`; `eslint` remains `^10.7.0`, `typescript-eslint` remains `^8.64.0`, and npm records the compatibility installation in `package-lock.json`.

- [x] **Step 4: Replace the flat ESLint configuration**

Replace `eslint.config.js` with:

```js
import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const TYPESCRIPT_FILES = ['src/**/*.{ts,tsx}', 'tests/**/*.ts', '*.config.ts'];
const NODE_FILES = [
  'src/main/**/*.ts',
  'src/preload/**/*.ts',
  'tests/**/*.ts',
  'scripts/**/*.cjs',
  '*.config.{js,cjs,mjs,ts}',
];
const COMMONJS_FILES = ['scripts/**/*.cjs', '*.config.cjs'];
const DEVELOPMENT_DEPENDENCY_FILES = [
  'tests/**',
  'scripts/**',
  'src/main/**',
  'src/preload/**',
  '**/*.config.{js,cjs,mjs,ts}',
];

const compat = new FlatCompat({
  baseDirectory: CONFIG_DIRECTORY,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const AIRBNB_CONFIGS = fixupConfigRules(compat.extends('airbnb', 'airbnb/hooks'));
const TYPESCRIPT_CONFIGS = tseslint.configs.recommended.map((config) => ({
  ...config,
  files: TYPESCRIPT_FILES,
}));

export default tseslint.config(
  {
    ignores: [
      '.husky/_/**',
      'coverage/**',
      'dist/**',
      'docs/**',
      'node_modules/**',
      'out/**',
      '*.tsbuildinfo',
    ],
  },
  ...AIRBNB_CONFIGS,
  ...TYPESCRIPT_CONFIGS,
  {
    settings: {
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.node.json', './tsconfig.web.json'],
        },
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: {
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: DEVELOPMENT_DEPENDENCY_FILES,
        },
      ],
    },
  },
  {
    files: TYPESCRIPT_FILES,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'default-param-last': 'off',
      '@typescript-eslint/default-param-last': 'error',
      'no-dupe-class-members': 'off',
      '@typescript-eslint/no-dupe-class-members': 'error',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^React$',
        },
      ],
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          classes: true,
          functions: false,
          typedefs: true,
          variables: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }],
      'react/prop-types': 'off',
      'react/require-default-props': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: NODE_FILES,
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: COMMONJS_FILES,
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
);
```

- [x] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/eslintConfig.test.ts
```

Expected: PASS with the required rule families at severity 2 and superseded/formatting rules at severity 0. If ESLint reports a plugin API or configuration translation error, stop and report that exact error instead of deleting the failing rule family.

- [x] **Step 6: Verify retained major versions and commit the bridge**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- --version
& 'C:\Program Files\nodejs\npm.cmd' ls eslint typescript-eslint --depth=0
```

Expected: ESLint reports major 10 and TypeScript ESLint reports major 8.

Commit:

```powershell
git add eslint.config.js package.json package-lock.json tests/eslintConfig.test.ts
git commit -m "chore: bridge airbnb rules to eslint 10"
```

---

### Task 2: Align Prettier and Staged Checks with Airbnb

**Files:**
- Modify: `.prettierrc.json`
- Modify: `package.json`
- Modify: `lint-staged.config.cjs`
- Format: root JavaScript/TypeScript/JSON/HTML/CSS files, `scripts/**`, `src/**`, and `tests/**`

**Interfaces:**
- Consumes: the compatibility configuration from Task 1.
- Produces: single-quote, ES5-trailing-comma output and zero-warning lint commands for local and staged files.

- [x] **Step 1: Update Prettier to Airbnb-compatible visible style**

Replace `.prettierrc.json` with:

```json
{
  "printWidth": 100,
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5"
}
```

- [x] **Step 2: Require zero warnings in npm and staged lint**

Change the scripts in `package.json` to:

```json
"lint": "eslint . --max-warnings=0 && prettier --check .",
"lint:fix": "eslint . --fix --max-warnings=0 && prettier --write .",
```

Replace `lint-staged.config.cjs` with:

```js
module.exports = {
  '*.{js,cjs,mjs,ts,tsx}': ['eslint --fix --max-warnings=0', 'prettier --write'],
  '*.{json,css,html}': 'prettier --write',
};
```

- [x] **Step 3: Verify the full Airbnb gate is active**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: FAIL on existing Airbnb and Prettier violations. The output must include rule names from at least two Airbnb families, such as `no-restricted-syntax`, `import/*`, `react/*`, or `jsx-a11y/*`, rather than a configuration-load error.

- [x] **Step 4: Apply deterministic automatic fixes**

Run Prettier first, then ESLint auto-fix separately so semantic errors do not prevent formatting:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec prettier -- --write .
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- . --fix
```

Expected: JavaScript and TypeScript use single quotes and ES5 trailing commas. ESLint may still exit nonzero for non-fixable semantic rules; those are handled in Tasks 3 and 4.

- [x] **Step 5: Confirm ignored user and generated files were not formatted**

Run:

```powershell
git status --short
```

Expected: `AGENTS.md` and `style-guide.md` remain untracked; `docs/**`, `out/**`, and `package-lock.json` have no Prettier-only modifications.

---

### Task 3: Remediate Core, Module, and TypeScript Airbnb Rules

**Files:**
- Modify: `scripts/prepare-husky.cjs`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/sessionParser.ts`
- Modify: `src/main/usageScanner.ts`
- Modify: `src/shared/sessionId.ts`
- Modify: `src/shared/usageMath.ts`
- Modify: corresponding imports in `src/main/**` and `tests/**`

**Interfaces:**
- Consumes: existing scanner/parser/session-ID APIs.
- Produces: behavior-equivalent control flow and Airbnb-compliant default exports where a module exposes one implementation value.

- [x] **Step 1: Replace prohibited script iteration and console output**

In `scripts/prepare-husky.cjs`, replace the hook-writing loop with:

```js
hookNames.forEach((hookName) => {
  writeFileSync(path.join(huskyDir, hookName), `#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n`);
});
```

Replace both `console.log(...)` calls with newline-terminated stdout writes:

```js
process.stdout.write('husky: proxy hooks created; git config was skipped\n');
process.stdout.write('husky: proxy hooks created; git command not found\n');
```

- [x] **Step 2: Preserve sequential scanner behavior without restricted loops**

In `scanCodexUsage`, replace the file loop with a sequential promise reduction:

```ts
await files.reduce<Promise<void>>(async (previousFile, file) => {
  await previousFile;

  try {
    const content = await fs.readFile(file, 'utf8');
    const sourceSessionId = getSessionId(file);
    const session = parseSessionJsonl(file, content, threadNames.get(sourceSessionId));
    sessions.push(session);
    warnings.push(...session.warnings);
  } catch (error) {
    warnings.push({
      sourceFile: file,
      message: `Unable to read session file: ${errorMessage(error)}`,
    });
  }
}, Promise.resolve());
```

In `findJsonlFiles`, replace the entry loop with a sequential reduction that preserves discovery order:

```ts
const discoveredFiles = await entries.reduce<Promise<string[]>>(
  async (previousEntries, entry) => {
    const collectedFiles = await previousEntries;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return [...collectedFiles, ...(await findJsonlFiles(fullPath, warnings))];
    }

    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      return [...collectedFiles, fullPath];
    }

    return collectedFiles;
  },
  Promise.resolve([])
);

files.push(...discoveredFiles);
```

- [x] **Step 3: Replace shared aggregation loops with reductions**

In `buildDailyTotals`, construct the map with:

```ts
const days = sessions.reduce<Map<string, UsageDay>>((dailyTotals, session) => {
  const date = getLocalDateKey(session.startedAt);
  const current = dailyTotals.get(date) ?? {
    date,
    sessionCount: 0,
    ...emptyTokenUsage(),
  };

  dailyTotals.set(date, {
    ...addTokenUsage(current, session),
    date,
    sessionCount: current.sessionCount + 1,
  });

  return dailyTotals;
}, new Map());
```

In `buildProjectTotals`, construct the map with:

```ts
const projects = sessions.reduce<Map<string, UsageProject>>((projectTotals, session) => {
  const projectPath = session.projectPath || 'Unknown Project';
  const current = projectTotals.get(projectPath) ?? {
    projectPath,
    projectName: session.projectName || getProjectName(projectPath),
    sessionCount: 0,
    lastActivityAt: session.endedAt,
    shareOfTotal: 0,
    ...emptyTokenUsage(),
  };
  const lastActivityAt =
    new Date(session.endedAt).getTime() > new Date(current.lastActivityAt).getTime()
      ? session.endedAt
      : current.lastActivityAt;

  projectTotals.set(projectPath, {
    ...addTokenUsage(current, session),
    projectPath,
    projectName: current.projectName,
    sessionCount: current.sessionCount + 1,
    lastActivityAt,
    shareOfTotal: 0,
  });

  return projectTotals;
}, new Map());
```

- [x] **Step 4: Use default exports for single-value implementation modules**

Change these declarations and every corresponding import/test import:

```ts
// src/main/ipc.ts
export default function registerUsageIpc(): void {

// src/main/sessionParser.ts
export default function parseSessionJsonl(

// src/shared/sessionId.ts
export default function getSessionId(sourcePath: string): string {
```

Keep modules with multiple implementation exports, such as `usageMath.ts`, `usageMetrics.ts`, and `codexPaths.ts`, as named exports.

- [x] **Step 5: Run focused behavioral verification**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sessionId.test.ts tests/sessionParser.test.ts tests/usageMath.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: session ID, parser, and aggregation tests pass; both TypeScript projects pass.

- [x] **Step 6: Run ESLint and resolve only the planned rule families**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- scripts src/main src/shared tests --fix
```

Expected: no remaining core, import, or TypeScript errors in these paths. If a remaining error requires a new global exception or an API behavior change, stop and update the design rather than suppressing it.

- [x] **Step 7: Commit core and module remediation**

```powershell
git add scripts src/main src/shared tests package.json package-lock.json eslint.config.js .prettierrc.json lint-staged.config.cjs
git commit -m "refactor: satisfy airbnb core rules"
```

---

### Task 4: Remediate React, Hooks, and Accessibility Rules

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/components/PerformanceView.tsx`
- Modify: `src/renderer/components/SettingsView.tsx`
- Modify: any renderer file changed by deterministic Airbnb/Prettier fixes

**Interfaces:**
- Consumes: existing `React.FC<Props>` component contracts and `UsageSummary` data.
- Produces: stable JSX keys, declaration-before-use ordering, and zero React/Hooks/a11y lint errors with unchanged rendered content.

- [x] **Step 1: Move helper component declarations before use**

In `Overview.tsx`, keep constants first, then place `TrendChart` and `ActivityGrid` before `Overview`. Keep `export default Overview;` at the bottom.

In `PerformanceView.tsx`, keep constants first, then place `MiniLine` and `Donut` before `PerformanceView`. The `peakHour` function declaration may remain after the component because the approved TypeScript rule allows function declarations before definition.

The declarations remain typed exactly as:

```ts
const TrendChart: React.FC<TrendChartProps> = ({ days, max }) => {
const ActivityGrid: React.FC<ActivityGridProps> = ({ days }) => {
const MiniLine: React.FC<MiniLineProps> = ({ days, max, tone }) => {
const Donut: React.FC<DonutProps> = ({ value }) => {
```

- [x] **Step 2: Remove array-index JSX keys**

In `Overview.tsx`, use the already unique day date:

```tsx
{points.map((point) => (
  <circle key={point.day.date} cx={point.x} cy={point.y} r="2.4" />
))}
```

In `SettingsView.tsx`, remove the map index and derive the warning key from stable warning data:

```tsx
{result.warnings.slice(0, MAX_VISIBLE_WARNINGS).map((warning) => (
  <p key={`${warning.sourceFile}-${warning.line}-${warning.message}`}>
```

- [x] **Step 3: Replace the remaining renderer restricted loop**

In `peakHour`, build the hours map with:

```ts
const hours = summary.sessions.reduce<Map<number, number>>((hourTotals, session) => {
  const hour = new Date(session.startedAt).getHours();
  hourTotals.set(hour, (hourTotals.get(hour) ?? 0) + session.totalTokens);
  return hourTotals;
}, new Map());
```

- [x] **Step 4: Run renderer-specific Airbnb verification**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- src/renderer --fix --max-warnings=0
& 'C:\Program Files\nodejs\npm.cmd' exec prettier -- --write src/renderer
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- src/renderer --max-warnings=0
```

Expected: renderer lint exits with code 0 and no React, Hooks, or JSX accessibility warnings. If an error requires changing visible behavior or adding a new global exception, stop and update the design.

- [x] **Step 5: Commit renderer remediation**

```powershell
git add src/renderer
git commit -m "refactor: satisfy airbnb react rules"
```

---

### Task 5: Run Full Verification and Hook Simulation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-16-airbnb-eslint10-migration.md` checkbox status only

**Interfaces:**
- Consumes: all migrated tooling and source changes.
- Produces: final evidence that lint, tests, types, build, and staged hooks succeed under ESLint 10.

- [x] **Step 1: Run all project verification commands**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: all Vitest files pass; ESLint reports zero warnings; Prettier reports all files formatted; both TypeScript projects pass; Electron main, preload, and renderer bundles are generated under `out/`.

- [x] **Step 2: Verify the compatibility rules through print-config**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec eslint -- --print-config src/renderer/App.tsx
```

Expected: output contains active `import/no-unresolved`, `react/jsx-no-target-blank`, `react-hooks/rules-of-hooks`, `jsx-a11y/alt-text`, and `@typescript-eslint/no-shadow` entries.

- [x] **Step 3: Stage the implementation and simulate the pre-commit hook**

Stage only implementation and plan files:

```powershell
git add .prettierrc.json eslint.config.js lint-staged.config.cjs package.json package-lock.json scripts src tests docs/superpowers/plans/2026-07-16-airbnb-eslint10-migration.md
```

Verify `git status --short` shows `AGENTS.md` and `style-guide.md` as untracked, then run:

```powershell
& 'C:\Program Files\Git\bin\sh.exe' .husky/_/pre-commit
```

Expected: lint-staged runs ESLint with zero warnings and Prettier successfully for staged JavaScript, TypeScript, TSX, JSON, CSS, and HTML files.

- [x] **Step 4: Re-run tests after staged auto-fixes**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: all commands still pass after lint-staged's modifications.

- [x] **Step 5: Commit the verified migration plan state**

```powershell
git diff --cached --check
git commit -m "chore: enforce airbnb rules on eslint 10"
```

Expected: commitlint and pre-commit hooks pass; the resulting commit contains no `AGENTS.md` or `style-guide.md` changes.
