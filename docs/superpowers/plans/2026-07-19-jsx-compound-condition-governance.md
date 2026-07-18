# JSX 复合条件治理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 把 JSX 中的复合业务判断迁移为可测试的内容模型和具名条件，并使用 ESLint 10 原生规则阻止同类代码回归。

**架构：** 使用 `resolveAppContentModel` 将应用错误、加载、空数据、周期空数据和正常内容转换为可辨识联合类型，再由 `AppContent` 组件按模型渲染。局部复合条件使用纯函数命名；ESLint 的 `no-restricted-syntax` 仅约束 TSX 条件渲染结构，不干扰普通 TypeScript 表达式和值回退。

**技术栈：** Electron 31、React 18、TypeScript 5、Vitest 2、ESLint 10、React DOM Server、Prettier 3。

## 全局约束

- 直接在 `master` 分支实施，不创建新分支或 worktree。
- 设计文档和实施计划使用中文。
- 禁止 `any`、`var`、未命名魔法值和类组件。
- React 组件使用 `React.FC<Props>`，组件 Props 使用 `interface`。
- 普通函数使用具名 `const` 函数表达式。
- 不安装 Airbnb 配置、第三方状态机库或新的 ESLint 插件。
- 不把 props、扫描结果或现有 state 可计算出的条件保存到新的 React state。
- 不改变界面视觉、扫描流程、周期切换和错误状态优先级。
- 当前未提交的 `AGENTS.md` 是用户新增规范；仅在任务 4 中按设计修订并提交，不得提前覆盖或丢弃。

## 文件结构

- 新建 `src/renderer/utils/appContentModel.ts`：唯一负责把运行状态转换为可辨识的主内容模型。
- 新建 `src/renderer/components/AppContent.tsx`：只负责根据内容模型渲染现有状态和页面组件。
- 修改 `src/renderer/App.tsx`：保留扫描和周期过滤职责，移除复合 JSX 条件。
- 修改 `src/renderer/components/Sidebar.tsx`：使用具名纯函数表达 warning badge 条件。
- 修改 `eslint.config.js`：只对 renderer TSX 启用复合 JSX 条件限制。
- 修改 `AGENTS.md`：明确规则边界，并修复新增示例与现有规范的冲突。
- 新建 `tests/appContentModel.test.ts`、`tests/appContent.test.tsx`、`tests/sidebar.test.tsx`、`tests/eslintPolicy.test.ts`：分别保护模型、渲染、局部条件和 ESLint 规则。

---

### Task 1：建立可辨识的应用内容模型

**文件：**
- 新建：`src/renderer/utils/appContentModel.ts`
- 新建：`tests/appContentModel.test.ts`

**接口：**
- 输入：`ResolveAppContentModelInput`
- 产出：`AppContentModel`
- 产出：`resolveAppContentModel(input: ResolveAppContentModelInput): AppContentModel`
- 状态优先级：`error` → `loading` → `idle` → `empty` → `period-empty` → `ready`

- [ ] **步骤 1：编写状态优先级失败测试**

创建 `tests/appContentModel.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult, UsageSession } from '../src/shared/usageTypes';
import {
  resolveAppContentModel,
  type ResolveAppContentModelInput,
} from '../src/renderer/utils/appContentModel';

const SESSION: UsageSession = {
  sessionId: 'session-1',
  startedAt: '2026-07-19T08:00:00.000Z',
  endedAt: '2026-07-19T08:10:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  inputTokens: 10,
  cachedInputTokens: 2,
  outputTokens: 4,
  reasoningOutputTokens: 1,
  totalTokens: 15,
  eventCount: 1,
  sourceFile: 'session-1.jsonl',
  warnings: [],
};

const EMPTY_SUMMARY = buildUsageSummary([]);
const READY_SUMMARY = buildUsageSummary([SESSION]);

const makeResult = (summary = READY_SUMMARY): UsageScanResult => ({
  sessionsDir: 'C:\\Users\\tester\\.codex\\sessions',
  scannedAt: '2026-07-19T08:15:00.000Z',
  summary,
  warnings: [],
});

const makeInput = (
  overrides: Partial<ResolveAppContentModelInput> = {}
): ResolveAppContentModelInput => ({
  error: null,
  loading: false,
  result: makeResult(),
  filteredSummary: READY_SUMMARY,
  period: 'month',
  ...overrides,
});

describe('resolveAppContentModel', () => {
  it('prioritizes an error over loading', () => {
    expect(resolveAppContentModel(makeInput({ error: 'Scan failed', loading: true }))).toEqual({
      kind: 'error',
      message: 'Scan failed',
    });
  });

  it('returns loading when no error exists', () => {
    expect(resolveAppContentModel(makeInput({ loading: true }))).toEqual({ kind: 'loading' });
  });

  it('returns idle before a scan result exists', () => {
    expect(
      resolveAppContentModel(makeInput({ result: null, filteredSummary: null }))
    ).toEqual({ kind: 'idle' });
  });

  it('returns empty when the complete scan has no sessions', () => {
    const result = makeResult(EMPTY_SUMMARY);
    const model = resolveAppContentModel(
      makeInput({ result, filteredSummary: EMPTY_SUMMARY })
    );

    expect(model).toEqual({ kind: 'empty', result });
  });

  it('returns period-empty when only the filtered summary is empty', () => {
    expect(
      resolveAppContentModel(makeInput({ filteredSummary: EMPTY_SUMMARY, period: 'week' }))
    ).toEqual({ kind: 'period-empty', period: 'week' });
  });

  it('returns ready with the result and filtered summary', () => {
    const result = makeResult();
    const model = resolveAppContentModel(makeInput({ result }));

    expect(model).toEqual({ kind: 'ready', result, summary: READY_SUMMARY });
  });
});
```

- [ ] **步骤 2：运行模型测试并确认失败**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appContentModel.test.ts
```

预期：FAIL，提示无法解析 `src/renderer/utils/appContentModel`。

- [ ] **步骤 3：实现最小内容模型**

创建 `src/renderer/utils/appContentModel.ts`：

```ts
import type {
  UsagePeriod,
  UsageScanResult,
  UsageSummary,
} from '../../shared/usageTypes';

export interface ResolveAppContentModelInput {
  error: string | null;
  loading: boolean;
  result: UsageScanResult | null;
  filteredSummary: UsageSummary | null;
  period: UsagePeriod;
}

export type AppContentModel =
  | { kind: 'error'; message: string }
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'empty'; result: UsageScanResult }
  | { kind: 'period-empty'; period: UsagePeriod }
  | {
      kind: 'ready';
      result: UsageScanResult;
      summary: UsageSummary;
    };

export const resolveAppContentModel = ({
  error,
  loading,
  result,
  filteredSummary,
  period,
}: ResolveAppContentModelInput): AppContentModel => {
  if (error) {
    return { kind: 'error', message: error };
  }

  if (loading) {
    return { kind: 'loading' };
  }

  if (!result || !filteredSummary) {
    return { kind: 'idle' };
  }

  if (result.summary.sessions.length === 0) {
    return { kind: 'empty', result };
  }

  if (filteredSummary.sessions.length === 0) {
    return { kind: 'period-empty', period };
  }

  return { kind: 'ready', result, summary: filteredSummary };
};
```

- [ ] **步骤 4：运行模型测试并确认通过**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appContentModel.test.ts
```

预期：`1` 个测试文件、`6` 项测试全部通过。

- [ ] **步骤 5：运行 lint 与类型检查**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：两个命令退出码均为 `0`。

- [ ] **步骤 6：提交内容模型**

```powershell
git add src/renderer/utils/appContentModel.ts tests/appContentModel.test.ts
git commit -m "feat: model application content states"
```

---

### Task 2：提取 AppContent 并接入 App

**文件：**
- 新建：`src/renderer/components/AppContent.tsx`
- 修改：`src/renderer/App.tsx`
- 新建：`tests/appContent.test.tsx`

**接口：**
- 消费：`AppContentModel`
- 消费：`ViewKey`
- 产出：`AppContent: React.FC<AppContentProps>`
- Props：`model: AppContentModel`、`activeView: ViewKey`

- [ ] **步骤 1：编写 AppContent 失败测试**

创建 `tests/appContent.test.tsx`：

```tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppContent from '../src/renderer/components/AppContent';
import type { AppContentModel } from '../src/renderer/utils/appContentModel';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult, UsageSession } from '../src/shared/usageTypes';

const SESSION: UsageSession = {
  sessionId: 'session-1',
  startedAt: '2026-07-19T08:00:00.000Z',
  endedAt: '2026-07-19T08:10:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  inputTokens: 10,
  cachedInputTokens: 2,
  outputTokens: 4,
  reasoningOutputTokens: 1,
  totalTokens: 15,
  eventCount: 1,
  sourceFile: 'session-1.jsonl',
  warnings: [],
};

const SUMMARY = buildUsageSummary([SESSION]);
const RESULT: UsageScanResult = {
  sessionsDir: 'C:\\Users\\tester\\.codex\\sessions',
  scannedAt: '2026-07-19T08:15:00.000Z',
  summary: SUMMARY,
  warnings: [],
};

const STATE_CASES: Array<{ model: AppContentModel; expectedText: string }> = [
  { model: { kind: 'error', message: 'Disk unavailable' }, expectedText: 'Scan failed' },
  { model: { kind: 'loading' }, expectedText: 'Scanning local Codex sessions' },
  { model: { kind: 'empty', result: RESULT }, expectedText: 'No Codex sessions found' },
  {
    model: { kind: 'period-empty', period: 'week' },
    expectedText: 'No sessions in this period',
  },
];

describe('AppContent', () => {
  it.each(STATE_CASES)('renders the $model.kind model', ({ model, expectedText }) => {
    const markup = renderToStaticMarkup(
      <AppContent activeView="overview" model={model} />
    );

    expect(markup).toContain(expectedText);
  });

  it('renders the selected page for a ready model', () => {
    const markup = renderToStaticMarkup(
      <AppContent
        activeView="overview"
        model={{ kind: 'ready', result: RESULT, summary: SUMMARY }}
      />
    );

    expect(markup).toContain('Cost Trends');
  });

  it('renders no markup for idle', () => {
    const markup = renderToStaticMarkup(
      <AppContent activeView="overview" model={{ kind: 'idle' }} />
    );

    expect(markup).toBe('');
  });
});
```

- [ ] **步骤 2：运行 AppContent 测试并确认失败**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appContent.test.tsx
```

预期：FAIL，提示无法解析 `src/renderer/components/AppContent`。

- [ ] **步骤 3：创建 AppContent 组件**

创建 `src/renderer/components/AppContent.tsx`：

```tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { AppContentModel } from '../utils/appContentModel';
import { ICON_SIZE_LARGE } from '../constants/ui';
import EmptyState from './EmptyState';
import Overview from './Overview';
import PeriodEmptyState from './PeriodEmptyState';
import PerformanceView from './PerformanceView';
import ProjectsView from './ProjectsView';
import SessionsView from './SessionsView';
import SettingsView from './SettingsView';
import type { ViewKey } from './Sidebar';

interface AppContentProps {
  activeView: ViewKey;
  model: AppContentModel;
}

const AppContent: React.FC<AppContentProps> = ({ activeView, model }) => {
  switch (model.kind) {
    case 'error':
      return (
        <section className="state-panel">
          <AlertCircle size={ICON_SIZE_LARGE} />
          <div>
            <h2>Scan failed</h2>
            <p>{model.message}</p>
          </div>
        </section>
      );
    case 'loading':
      return (
        <section className="state-panel">
          <div className="loader" />
          <div>
            <h2>Scanning local Codex sessions</h2>
            <p>Read-only JSONL parsing. No edits, no uploads.</p>
          </div>
        </section>
      );
    case 'empty':
      return (
        <EmptyState sessionsDir={model.result.sessionsDir} warnings={model.result.warnings} />
      );
    case 'period-empty':
      return <PeriodEmptyState period={model.period} />;
    case 'ready':
      return (
        <>
          {activeView === 'overview' ? <Overview summary={model.summary} /> : null}
          {activeView === 'sessions' ? <SessionsView sessions={model.summary.sessions} /> : null}
          {activeView === 'tools' ? <ProjectsView projects={model.summary.byProject} /> : null}
          {activeView === 'performance' ? <PerformanceView summary={model.summary} /> : null}
          {activeView === 'wrapped' ? <SettingsView result={model.result} /> : null}
        </>
      );
    case 'idle':
      return null;
  }
};

export default AppContent;
```

- [ ] **步骤 4：运行 AppContent 测试并确认通过**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appContent.test.tsx
```

预期：`1` 个测试文件、`6` 项测试全部通过。

- [ ] **步骤 5：让 App 使用内容模型**

修改 `src/renderer/App.tsx`：

1. 删除 `AlertCircle`、各内容页面、空状态组件和 `ICON_SIZE_LARGE` 的直接导入。
2. 增加以下导入：

```ts
import AppContent from './components/AppContent';
import { resolveAppContentModel } from './utils/appContentModel';
```

3. 在 `warningCount` 后计算模型：

```ts
const contentModel = resolveAppContentModel({
  error,
  loading,
  result,
  filteredSummary,
  period,
});
```

4. 删除 Toolbar 后的全部复合条件渲染块，替换为：

```tsx
<AppContent activeView={activeView} model={contentModel} />
```

- [ ] **步骤 6：运行模型、组件和既有周期测试**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/appContentModel.test.ts tests/appContent.test.tsx tests/toolbar.test.tsx tests/overviewTrend.test.tsx
```

预期：四个测试文件全部通过，测试总数不少于 `15`。

- [ ] **步骤 7：运行 lint 与类型检查**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：两个命令退出码均为 `0`。

- [ ] **步骤 8：提交 App 内容重构**

```powershell
git add src/renderer/App.tsx src/renderer/components/AppContent.tsx tests/appContent.test.tsx
git commit -m "refactor: centralize application content rendering"
```

---

### Task 3：提取 Sidebar warning badge 条件

**文件：**
- 修改：`src/renderer/components/Sidebar.tsx`
- 新建：`tests/sidebar.test.tsx`

**接口：**
- 新增内部函数：`shouldShowWarningBadge(view: ViewKey, warningCount: number): boolean`
- 不改变 `SidebarProps` 和默认导出。

- [ ] **步骤 1：编写 Sidebar 失败测试**

创建 `tests/sidebar.test.tsx`：

```tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Sidebar from '../src/renderer/components/Sidebar';

describe('Sidebar', () => {
  it('shows the warning badge when warnings exist', () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        activeView="overview"
        warningCount={3}
        onChange={vi.fn()}
      />
    );

    expect(markup).toContain('<em class="nav-badge">3</em>');
  });

  it('hides the warning badge when warnings are absent', () => {
    const markup = renderToStaticMarkup(
      <Sidebar
        activeView="overview"
        warningCount={0}
        onChange={vi.fn()}
      />
    );

    expect(markup).not.toContain('nav-badge');
  });
});
```

- [ ] **步骤 2：建立测试基线**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sidebar.test.tsx
```

预期：现有行为使 `2` 项测试通过；该基线用于保护无行为重构。

- [ ] **步骤 3：提取具名纯函数并替换 JSX 条件**

在 `NAV_ITEMS` 后增加：

```ts
const shouldShowWarningBadge = (view: ViewKey, warningCount: number): boolean =>
  view === 'wrapped' && warningCount > 0;
```

在 `NAV_ITEMS.map` 回调内、`Icon` 声明之后增加：

```ts
const showWarningBadge = shouldShowWarningBadge(item.key, warningCount);
```

将 JSX 改为：

```tsx
{showWarningBadge ? <em className="nav-badge">{warningCount}</em> : null}
```

- [ ] **步骤 4：运行 Sidebar 测试并确认行为不变**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sidebar.test.tsx
```

预期：`1` 个测试文件、`2` 项测试全部通过。

- [ ] **步骤 5：运行 lint 与类型检查**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：两个命令退出码均为 `0`。

- [ ] **步骤 6：提交 Sidebar 重构**

```powershell
git add src/renderer/components/Sidebar.tsx tests/sidebar.test.tsx
git commit -m "refactor: name sidebar badge condition"
```

---

### Task 4：修订规范并启用 ESLint 防回归

**文件：**
- 修改：`AGENTS.md`
- 修改：`eslint.config.js`
- 新建：`tests/eslintPolicy.test.ts`

**接口：**
- 新增 renderer TSX 专用 `no-restricted-syntax` 规则。
- 规则拒绝复合 JSX 三元条件和多谓词直接条件渲染。
- 规则允许单条件三元表达式与值回退表达式。

- [ ] **步骤 1：编写 ESLint 规则失败测试**

创建 `tests/eslintPolicy.test.ts`：

```ts
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });
const FIXTURE_PATH = 'src/renderer/CompoundConditionFixture.tsx';

const lintSource = async (source: string): Promise<string[]> => {
  const [result] = await eslint.lintText(source, { filePath: FIXTURE_PATH });
  return result.messages.map(({ ruleId }) => ruleId ?? 'unknown');
};

describe('JSX compound condition lint policy', () => {
  it('rejects compound ternary and direct rendering conditions', async () => {
    const ternaryRules = await lintSource(`
      const Example = ({ ready, visible }: { ready: boolean; visible: boolean }) => (
        <>{ready && visible ? <span>Ready</span> : null}</>
      );
      export default Example;
    `);
    const directRules = await lintSource(`
      const Example = ({ ready, visible }: { ready: boolean; visible: boolean }) => (
        <>{ready && visible && <span>Ready</span>}</>
      );
      export default Example;
    `);

    expect(ternaryRules).toContain('no-restricted-syntax');
    expect(directRules).toContain('no-restricted-syntax');
  });

  it('allows single conditions and value fallbacks', async () => {
    const singleConditionRules = await lintSource(`
      const Example = ({ visible }: { visible: boolean }) => (
        <>{visible ? <span>Visible</span> : null}</>
      );
      export default Example;
    `);
    const fallbackRules = await lintSource(`
      const Example = ({ name }: { name?: string }) => <span>{name || 'Unknown'}</span>;
      export default Example;
    `);

    expect(singleConditionRules).not.toContain('no-restricted-syntax');
    expect(fallbackRules).not.toContain('no-restricted-syntax');
  });
});
```

- [ ] **步骤 2：运行 ESLint 策略测试并确认失败**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/eslintPolicy.test.ts
```

预期：FAIL，复合条件返回的 rule id 不包含 `no-restricted-syntax`。

- [ ] **步骤 3：增加 renderer TSX 专用规则块**

在 `eslint.config.js` 的 renderer browser globals 规则块之后、`prettierConfig` 之前增加：

```js
{
  files: ['src/renderer/**/*.tsx'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector:
          'JSXExpressionContainer > ConditionalExpression[test.type="LogicalExpression"]',
        message:
          'Extract compound JSX conditions into a named boolean, pure function, or render model.',
      },
      {
        selector:
          'JSXExpressionContainer > LogicalExpression[left.type="LogicalExpression"]:has(JSXElement)',
        message:
          'Extract compound JSX conditions into a named boolean, pure function, or render model.',
      },
      {
        selector:
          'JSXExpressionContainer > LogicalExpression[left.type="LogicalExpression"]:has(JSXFragment)',
        message:
          'Extract compound JSX conditions into a named boolean, pure function, or render model.',
      },
      {
        selector:
          'JSXExpressionContainer > LogicalExpression[right.type="LogicalExpression"]:has(JSXElement)',
        message:
          'Extract compound JSX conditions into a named boolean, pure function, or render model.',
      },
      {
        selector:
          'JSXExpressionContainer > LogicalExpression[right.type="LogicalExpression"]:has(JSXFragment)',
        message:
          'Extract compound JSX conditions into a named boolean, pure function, or render model.',
      },
    ],
  },
},
```

- [ ] **步骤 4：运行策略测试并确认正反例通过**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/eslintPolicy.test.ts
```

预期：`1` 个测试文件、`2` 项测试全部通过。

- [ ] **步骤 5：修订 AGENTS.md 新增规则与示例**

保留 `AGENTS.md` 前 38 行现有内容，将用户新增段落替换为：

````markdown
- JSX/DOM 内部的渲染判断如果组合两个或更多业务谓词，应优先提取为具名布尔变量或纯函数；多个互斥界面分支应建立明确的渲染状态模型。只有条件具有独立生命周期并由事件直接改变时，才定义为 React state，禁止保存可由 props 或现有 state 推导出的重复状态。

```ts
// 错误示例
type ViewKey = 'overview' | 'wrapped';

interface WarningBadgeProps {
  view: ViewKey;
  count: number;
}

export const WarningBadge: React.FC<WarningBadgeProps> = ({ view, count }) => (
  <>{view === 'wrapped' && count > 0 ? <em className="nav-badge">{count}</em> : null}</>
);
```

```ts
// 正确示例
type ViewKey = 'overview' | 'wrapped';

interface WarningBadgeProps {
  view: ViewKey;
  count: number;
}

const shouldShowWarningBadge = (view: ViewKey, count: number): boolean =>
  view === 'wrapped' && count > 0;

export const WarningBadge: React.FC<WarningBadgeProps> = ({ view, count }) => {
  const showWarningBadge = shouldShowWarningBadge(view, count);

  return <>{showWarningBadge ? <em className="nav-badge">{count}</em> : null}</>;
};
```
````

确保文件末尾有换行，删除原示例中的尾随空格。

- [ ] **步骤 6：运行 lint、策略测试和类型检查**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/eslintPolicy.test.ts tests/appContentModel.test.ts tests/appContent.test.tsx tests/sidebar.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：lint 无 error/warning；四个测试文件全部通过；两套 TypeScript 配置均无错误。

- [ ] **步骤 7：确认 Airbnb 依赖没有被恢复**

运行：

```powershell
rg -n 'eslint-config-airbnb|eslint-plugin-import|eslint-plugin-jsx-a11y|eslint-plugin-react["/]' package.json package-lock.json
```

预期：无匹配输出，`rg` 退出码为 `1`。

- [ ] **步骤 8：提交规范与 ESLint 约束**

```powershell
git add AGENTS.md eslint.config.js tests/eslintPolicy.test.ts
git commit -m "chore: enforce JSX condition policy"
```

---

### Task 5：全量验证与范围审查

**文件：**
- 检查：全部本次修改的源代码、测试、规范和 ESLint 配置。

**接口：**
- 不新增接口；本任务只验证计划验收标准。

- [ ] **步骤 1：执行完整测试套件**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
```

预期：全部测试文件通过，测试文件数不少于 `14`，测试数不少于 `40`。

- [ ] **步骤 2：执行 lint 与类型检查**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：两个命令退出码均为 `0`，无 error 或 warning。

- [ ] **步骤 3：执行生产构建**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

预期：Electron main、preload 和 renderer 三个构建阶段全部成功。

- [ ] **步骤 4：扫描禁用模式**

运行：

```powershell
rg -n '\bany\b|\bvar\b|^(export default )?(export )?(async )?function\s' src tests --glob '*.{ts,tsx}'
```

预期：无匹配输出，`rg` 退出码为 `1`。

- [ ] **步骤 5：检查空白、提交范围和历史**

运行：

```powershell
git diff --check
git status --short
git log -6 --oneline
```

预期：无空白错误；工作区没有计划外修改；历史包含四个实施提交和本计划文档提交。

- [ ] **步骤 6：进行最终代码审查**

审查以下要点：

- `resolveAppContentModel` 的分支顺序与设计一致。
- `AppContentModel` 每个分支只携带渲染所需数据，没有非空断言。
- `App.tsx` 不再包含复合 JSX 业务判断。
- `Sidebar.tsx` 的 JSX 只消费 `showWarningBadge`。
- ESLint 测试同时覆盖拒绝和允许用例。
- `AGENTS.md` 示例不违反同一文件中的 no-any、Props、命名和格式规则。

预期：没有 Critical 或 Important 级别问题；若发现问题，修复后重新执行步骤 1 至步骤 5，并使用匹配修复内容的提交信息单独提交。
