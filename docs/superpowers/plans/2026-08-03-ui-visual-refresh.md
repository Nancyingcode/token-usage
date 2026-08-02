# UI 视觉优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 Renderer 收敛为已经确认的 Quiet Pro · Signature 视觉体系，同时修正导航命名、工具栏状态、概览图表语义、键盘标签页和刷新降级行为。

**Architecture:** 保持主进程、preload、IPC、扫描和核心计算不变，只在 Renderer 内增加语义化 CSS 令牌、共享展示组件和少量纯状态函数。迁移期间使用临时 `legacy.css` 保持界面可运行，各任务按责任逐段移走旧规则，最终删除临时文件。

**Tech Stack:** Electron 31、React 18、TypeScript 5、i18next、lucide-react、CSS、Vitest、Testing Library。

## Global Constraints

- 不新增 UI、动画、图表或 CSS-in-JS 依赖。
- 不修改 Codex 会话目录，不写入、删除或上传任何 Codex 会话数据。
- Renderer 不直接访问文件系统；主进程、preload 和 IPC 契约保持不变。
- 未知模型价格继续保留 Token，并明确标记为未计价；费用始终描述为本地估算。
- 品牌基础色固定为 `#102b27`、`#37b786`、`#6ce0b5`；页面画布为 `#f3f7f6`，主要文字为 `#17251f`。
- 正文和表格主体至少 12px；辅助标签至少 10px；紧凑控件至少 32px，主要表单控件优先 36px。
- 完整数据入场动效不超过 1.4 秒，禁止永久循环装饰动画，并支持 `prefers-reduced-motion: reduce`。
- 新增或修改用户可见文案时，同时维护英文和简体中文资源；组件中不硬编码用户可见文案。
- 金额、数字、百分比和日期继续使用现有 locale formatter。
- 状态不得只依赖颜色；交互控件必须支持键盘和清晰的 `:focus-visible`。
- 禁止 `any` 和 `var`；核心判断优先使用纯函数且不得修改输入对象。
- 新增 TS/TSX 文件按 `rules/file-header.md` 添加简洁的 `@file` 与 `@description` 文件头。
- 每个任务遵循红—绿—重构，并只提交该任务涉及的文件。

## 执行前文档基线

当前设计与计划文档因仓库“未明确要求时不主动提交”的规则保持未提交。用户明确选择执行方式后，先确认两份文档内容未变化，再建立独立文档提交：

```powershell
git add docs/superpowers/specs/2026-08-03-ui-visual-refresh-design.md docs/superpowers/plans/2026-08-03-ui-visual-refresh.md
git commit -m "docs: plan UI visual refresh"
```

该提交不包含生产代码、测试或其他用户变更。

## 文件结构

新增文件及责任：

- `src/renderer/styles/tokens.css`：颜色、字号、间距、圆角、阴影和动效令牌。
- `src/renderer/styles/base.css`：全局排版、基础控件和焦点规则。
- `src/renderer/styles/shell.css`：应用外壳、侧栏、工具栏和窗口响应式规则。
- `src/renderer/styles/components.css`：卡片、按钮、标签页、表格、状态、抽屉和对话框。
- `src/renderer/styles/views.css`：概览、性能、预算、成本优化和诊断等页面专属布局。
- `src/renderer/styles/legacy.css`：迁移期临时保存现有样式；Task 10 必须删除。
- `src/renderer/utils/toolbarState.ts`：周期控件能力与扫描状态的纯函数。
- `src/renderer/utils/activityGrid.ts`：按日期构建活动热力图展示模型。
- `src/renderer/components/AccessibleTabs.tsx`：完整实现 ARIA tab 键盘模型的受控标签页。
- `src/renderer/components/PageHeader.tsx`：统一页面标题、说明和操作区结构。
- `src/renderer/components/StatusBanner.tsx`：统一旧数据、警告和可恢复错误提示。
- `src/renderer/components/LoadingSkeleton.tsx`：初次加载时保留页面结构的可访问骨架屏。
- `src/renderer/components/ToastNotice.tsx`：非阻塞式短暂操作成功反馈。
- `src/renderer/hooks/useOverlayFocus.ts`：抽屉与对话框的初始焦点、焦点循环、Escape 和焦点恢复。
- `tests/uiStylePolicy.test.ts`：样式入口、令牌和最终迁移约束。
- `tests/toolbarState.test.ts`：周期能力与扫描状态测试。
- `tests/activityGrid.test.ts`：活动日期、零用量和周期外单元测试。
- `tests/accessibleTabs.test.tsx`：标签页方向键、Home、End 和 roving `tabIndex` 测试。
- `tests/useOverlayFocus.test.tsx`：浮层焦点与 Escape 行为测试。

---

### Task 1: 建立样式分层和设计令牌

**Files:**
- Create: `src/renderer/styles/tokens.css`
- Create: `src/renderer/styles/base.css`
- Create: `src/renderer/styles/shell.css`
- Create: `src/renderer/styles/components.css`
- Create: `src/renderer/styles/views.css`
- Create: `src/renderer/styles/legacy.css`
- Modify: `src/renderer/styles.css`
- Create: `tests/uiStylePolicy.test.ts`
- Modify: `tests/projectRowStyles.test.ts`

**Interfaces:**
- Consumes: `src/renderer/main.tsx` 现有的单一 `styles.css` 导入。
- Produces: 后续任务使用的 `--color-*`、`--space-*`、`--radius-*`、`--duration-*` CSS 自定义属性；迁移期新样式覆盖 `legacy.css`。

- [ ] **Step 1: 写入失败的样式入口测试**

```ts
/**
 * @file UI 样式策略测试
 * @description 约束 Renderer 样式入口、视觉令牌和迁移完成条件。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRendererStyle = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), 'src/renderer', relativePath), 'utf8');

describe('UI style policy', () => {
  it('loads layered styles in deterministic order', () => {
    expect(readRendererStyle('styles.css').trim()).toBe(
      [
        "@import './styles/tokens.css';",
        "@import './styles/base.css';",
        "@import './styles/legacy.css';",
        "@import './styles/shell.css';",
        "@import './styles/components.css';",
        "@import './styles/views.css';",
      ].join('\n')
    );
  });

  it('defines the approved brand tokens', () => {
    const tokens = readRendererStyle('styles/tokens.css');
    expect(tokens).toContain('--color-brand-950: #102b27;');
    expect(tokens).toContain('--color-brand-500: #37b786;');
    expect(tokens).toContain('--color-brand-300: #6ce0b5;');
    expect(tokens).toContain('--font-size-body: 0.8125rem;');
    expect(tokens).toContain('--control-height-compact: 2rem;');
  });
});
```

- [ ] **Step 2: 运行测试并确认因样式文件不存在而失败**

Run: `npm test -- tests/uiStylePolicy.test.ts`

Expected: FAIL，提示入口内容不匹配或 `styles/tokens.css` 不存在。

- [ ] **Step 3: 机械移动旧样式并创建分层入口**

在确认目标仍为 `src/renderer/styles.css` 后执行：

```powershell
New-Item -ItemType Directory -Force src\renderer\styles
Move-Item -LiteralPath src\renderer\styles.css -Destination src\renderer\styles\legacy.css
```

使用 `apply_patch` 新建 `src/renderer/styles.css`：

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/legacy.css';
@import './styles/shell.css';
@import './styles/components.css';
@import './styles/views.css';
```

- [ ] **Step 4: 写入确定的基础令牌与基础规则**

`tokens.css` 至少包含：

```css
:root {
  --color-brand-950: #102b27;
  --color-brand-700: #24765b;
  --color-brand-500: #37b786;
  --color-brand-300: #6ce0b5;
  --color-canvas: #f3f7f6;
  --color-surface: #ffffff;
  --color-text: #17251f;
  --color-text-muted: #71817b;
  --color-border: #dbe6e3;
  --color-success-text: #24765b;
  --color-warning-text: #76540f;
  --color-danger-text: #8e3030;
  --font-size-label: 0.625rem;
  --font-size-body-small: 0.75rem;
  --font-size-body: 0.8125rem;
  --font-size-title: 1.375rem;
  --font-size-metric: 1.75rem;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --radius-control: 0.5rem;
  --radius-card: 0.75rem;
  --radius-overlay: 1rem;
  --control-height-compact: 2rem;
  --control-height-default: 2.25rem;
  --shadow-overlay: 0 1.25rem 3.5rem rgba(16, 43, 39, 0.16);
  --duration-fast: 140ms;
  --duration-standard: 180ms;
  --duration-overlay: 220ms;
}
```

`base.css` 至少包含：

```css
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--color-text);
  background: var(--color-canvas);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; background: var(--color-canvas); }
button, input, select { font: inherit; }
button { cursor: pointer; }
button:focus-visible, input:focus-visible, select:focus-visible, [tabindex]:focus-visible {
  outline: 2px solid var(--color-brand-300);
  outline-offset: 2px;
}
```

`shell.css`、`components.css` 和 `views.css` 先保留职责注释，不复制旧规则。

同时把 `projectRowStyles.test.ts` 的样式读取改为迁移期组合，避免 Task 1 之后全量测试失效：

```ts
const STYLE_PATHS = [
  'src/renderer/styles/legacy.css',
  'src/renderer/styles/shell.css',
  'src/renderer/styles/components.css',
  'src/renderer/styles/views.css',
];

const stylesheet = (
  await Promise.all(STYLE_PATHS.map((path) => readFile(resolve(process.cwd(), path), 'utf8')))
).join('\n');
```

- [ ] **Step 5: 运行最小测试和类型检查**

Run: `npm test -- tests/uiStylePolicy.test.ts tests/projectRowStyles.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS，且应用样式行为保持不变。

- [ ] **Step 6: 提交样式架构**

```powershell
git add src/renderer/styles.css src/renderer/styles tests/uiStylePolicy.test.ts tests/projectRowStyles.test.ts
git commit -m "refactor: establish renderer style layers"
```

---

### Task 2: 更新品牌侧栏和导航命名

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles/shell.css`
- Modify: `src/renderer/styles/legacy.css`
- Modify: `tests/sidebar.test.tsx`
- Modify: `tests/rendererI18n.test.tsx`

**Interfaces:**
- Consumes: 现有 `ViewKey`、`activeView`、warning 和 budget badge props。
- Produces: `NAV_GROUPS` 的“洞察 / 控制”结构；显示名称为 `Projects` / “项目”和 `Settings` / “设置”；路由键仍为 `tools` 与 `wrapped`。

- [ ] **Step 1: 添加侧栏结构和翻译回归测试**

```tsx
it('renders the branded navigation groups in product order', () => {
  const markup = renderWithI18n(
    <Sidebar activeView="overview" warningCount={0} onChange={vi.fn()} />
  );

  expect(markup).toContain('Token Usage');
  expect(markup).toContain('Insights');
  expect(markup).toContain('Control');
  expect(markup.indexOf('Overview')).toBeLessThan(markup.indexOf('Sessions'));
  expect(markup.indexOf('Sessions')).toBeLessThan(markup.indexOf('Projects'));
  expect(markup.indexOf('Cost Optimization')).toBeLessThan(markup.indexOf('Budgets'));
  expect(markup).toContain('Settings');
  expect(markup).not.toContain('Wrapped');
});

it('renders the corrected Chinese project and settings names', () => {
  const markup = renderWithI18n(
    <Sidebar activeView="tools" warningCount={0} onChange={vi.fn()} />,
    'zh-CN'
  );
  expect(markup).toContain('项目');
  expect(markup).toContain('设置');
});
```

- [ ] **Step 2: 运行 Sidebar 与 i18n 测试并确认失败**

Run: `npm test -- tests/sidebar.test.tsx tests/rendererI18n.test.tsx`

Expected: FAIL，缺少品牌区、导航分组，英文仍显示 `Tools` / `Wrapped`。

- [ ] **Step 3: 将扁平导航改为类型安全的分组导航**

在 `Sidebar.tsx` 中定义：

```tsx
const NAV_GROUPS = [
  {
    key: 'insights',
    translationKey: 'navigation.group.insights',
    items: [
      { key: 'overview', translationKey: 'navigation.overview', icon: BarChart3 },
      { key: 'sessions', translationKey: 'navigation.sessions', icon: MessageSquareText },
      { key: 'tools', translationKey: 'navigation.tools', icon: Wrench },
      { key: 'performance', translationKey: 'navigation.performance', icon: Gauge },
    ],
  },
  {
    key: 'control',
    translationKey: 'navigation.group.control',
    items: [
      { key: 'costOptimization', translationKey: 'navigation.costOptimization', icon: TrendingDown },
      { key: 'budgets', translationKey: 'navigation.budgets', icon: WalletCards },
      { key: 'wrapped', translationKey: 'navigation.wrapped', icon: Settings },
    ],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  translationKey: 'navigation.group.insights' | 'navigation.group.control';
  items: ReadonlyArray<{
    key: ViewKey;
    translationKey: `navigation.${ViewKey}`;
    icon: typeof BarChart3;
  }>;
}>;
```

渲染品牌区、CSS 双轨迹标志、分组标题和原有 badge；不要改变按钮 `onClick` 或 `ViewKey`。

- [ ] **Step 4: 更新中英文文案并迁移侧栏样式**

英文：

```ts
navigation: {
  label: 'Primary navigation',
  group: { insights: 'Insights', control: 'Control' },
  overview: 'Overview',
  sessions: 'Sessions',
  tools: 'Projects',
  performance: 'Performance',
  costOptimization: 'Cost Optimization',
  budgets: 'Budgets',
  wrapped: 'Settings',
},
```

中文对应为“洞察”“控制”“项目”“设置”。将 `.app-frame`、`.sidebar`、`.nav-*` 规则从 `legacy.css` 移入 `shell.css`，并使用：

```css
.app-frame { min-height: 100vh; display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); }
.sidebar { padding: var(--space-6) var(--space-3); background: var(--color-brand-950); color: #ffffff; }
.nav-item { min-height: 2.125rem; border-radius: var(--radius-control); color: #aac4bc; }
.nav-item.active {
  color: #ffffff;
  background: #20473f;
  box-shadow: inset 3px 0 var(--color-brand-300);
}
```

删除旧的 1050px “隐藏全部导航文字”规则；最小窗口仍显示完整标签。

- [ ] **Step 5: 运行测试并验证侧栏 badge 未回归**

Run: `npm test -- tests/sidebar.test.tsx tests/rendererI18n.test.tsx`

Expected: PASS，包括 warning badge、budget badge、导航顺序和双语名称。

- [ ] **Step 6: 提交侧栏改造**

```powershell
git add src/renderer/components/Sidebar.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles/shell.css src/renderer/styles/legacy.css tests/sidebar.test.tsx tests/rendererI18n.test.tsx
git commit -m "feat: refresh branded sidebar navigation"
```

---

### Task 3: 保留刷新数据并显示真实工具栏状态

**Files:**
- Create: `src/renderer/utils/toolbarState.ts`
- Create: `src/renderer/components/StatusBanner.tsx`
- Create: `src/renderer/components/LoadingSkeleton.tsx`
- Modify: `src/renderer/utils/appContentModel.ts`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles/shell.css`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/legacy.css`
- Create: `tests/toolbarState.test.ts`
- Modify: `tests/toolbar.test.tsx`
- Modify: `tests/appContentModel.test.tsx`
- Modify: `tests/appContent.test.tsx`

**Interfaces:**
- Produces: `hasPeriodFilter(view: ViewKey): boolean`。
- Produces: `resolveToolbarScanState(input): 'scanning' | 'synced' | 'stale' | 'failed' | 'waiting'`。
- Produces: 数据型 `AppContentModel` 分支上的 `freshness: { refreshing: boolean; staleReason: string | null }`。
- Produces: `StatusBanner`，接受 `tone`、`title`、`description` 和可选 action。
- Produces: `LoadingSkeleton({ label })`，提供 `role="status"`、`aria-busy="true"` 与静态结构占位。

- [ ] **Step 1: 添加周期能力、状态和旧数据失败测试**

```ts
it('shows period filters only on views that consume UsagePeriod', () => {
  expect(hasPeriodFilter('overview')).toBe(true);
  expect(hasPeriodFilter('sessions')).toBe(true);
  expect(hasPeriodFilter('tools')).toBe(true);
  expect(hasPeriodFilter('performance')).toBe(true);
  expect(hasPeriodFilter('costOptimization')).toBe(true);
  expect(hasPeriodFilter('budgets')).toBe(false);
  expect(hasPeriodFilter('wrapped')).toBe(false);
});

it('reports stale when a previous scan exists and refresh fails', () => {
  expect(
    resolveToolbarScanState({ loading: false, error: 'Disk unavailable', scannedAt: '2026-08-03' })
  ).toBe('stale');
});

it('reports failed when the initial scan fails without previous data', () => {
  expect(
    resolveToolbarScanState({ loading: false, error: 'Disk unavailable' })
  ).toBe('failed');
});
```

在 `appContentModel.test.tsx` 增加：

```ts
it('keeps the last successful result when a later refresh fails', () => {
  const result = makeResult();
  expect(
    resolveAppContentModel(
      makeInput({ result, filteredSummary: READY_SUMMARY, error: 'Disk unavailable' })
    )
  ).toMatchObject({
    kind: 'ready',
    result,
    freshness: { refreshing: false, staleReason: 'Disk unavailable' },
  });
});

it('keeps content visible during a background refresh', () => {
  expect(
    resolveAppContentModel(makeInput({ loading: true, result: makeResult() }))
  ).toMatchObject({ kind: 'ready', freshness: { refreshing: true, staleReason: null } });
});

it('renders a structural skeleton only for the initial load', () => {
  const markup = renderAppContent({ kind: 'loading' });
  expect(markup).toContain('class="loading-skeleton"');
  expect(markup).toContain('aria-busy="true"');
});
```

`renderAppContent` 是在 `appContent.test.tsx` 中新增的本地 helper，完整渲染参数为：

```tsx
const renderAppContent = (model: AppContentModel): string =>
  renderWithI18n(
    <AppContent
      activeView="overview"
      model={model}
      onRefresh={vi.fn()}
      onProjectSelect={vi.fn()}
      selectedProjectPath={null}
      onClearProjectFilter={vi.fn()}
    />
  );
```

- [ ] **Step 2: 运行最小测试并确认当前错误优先级导致失败**

Run: `npm test -- tests/toolbarState.test.ts tests/toolbar.test.tsx tests/appContentModel.test.tsx tests/appContent.test.tsx`

Expected: FAIL；设置页仍显示日期范围，刷新错误会替换已有内容。

- [ ] **Step 3: 实现纯工具栏状态函数**

```ts
import type { ViewKey } from '../components/Sidebar';

const PERIOD_FILTER_VIEWS: ReadonlySet<ViewKey> = new Set([
  'overview', 'sessions', 'tools', 'performance', 'costOptimization',
]);

export interface ToolbarScanStateInput {
  loading: boolean;
  error: string | null;
  scannedAt?: string;
}

export type ToolbarScanState = 'scanning' | 'synced' | 'stale' | 'failed' | 'waiting';

export const hasPeriodFilter = (view: ViewKey): boolean => PERIOD_FILTER_VIEWS.has(view);

export const resolveToolbarScanState = ({
  loading,
  error,
  scannedAt,
}: ToolbarScanStateInput): ToolbarScanState => {
  if (loading) return 'scanning';
  if (error && scannedAt) return 'stale';
  if (error) return 'failed';
  if (scannedAt) return 'synced';
  return 'waiting';
};
```

- [ ] **Step 4: 重排 AppContentModel 的数据优先级**

为 `ready`、`empty` 和 `period-empty` 分支加入同一 `freshness` 字段；`period-empty` 同时携带现有 `result`，以便显示最近扫描时间。解析顺序固定为：已有结果 → 初次 error → 初次 loading → idle。数据型联合类型明确为：

```ts
interface AppFreshness {
  refreshing: boolean;
  staleReason: string | null;
}

type AppContentModel =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; result: UsageScanResult; freshness: AppFreshness }
  | { kind: 'period-empty'; period: UsagePeriod; result: UsageScanResult; freshness: AppFreshness }
  | {
      kind: 'ready';
      result: UsageScanResult;
      summary: UsageSummary;
      freshness: AppFreshness;
    };
```

已有结果分支使用：

```ts
const freshness = {
  refreshing: input.loading,
  staleReason: input.error,
};
```

`AppContentProps` 增加 `onRefresh: () => void`。`AppContent` 在数据型分支的页面内容之前渲染 `StatusBanner`：刷新中显示非阻塞状态；失败显示最后成功扫描时间、失败原因和调用 `onRefresh` 的重新扫描按钮。所有 AppContent 测试显式传入 `vi.fn()`；初次加载和初次错误继续使用完整状态页。

`StatusBanner` 接口固定为：

```ts
interface StatusBannerProps {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}
```

只有 `actionLabel` 与 `onAction` 同时存在时才渲染按钮。

`LoadingSkeleton` 固定渲染一个标题占位、四个指标占位和两个内容面板占位；辅助文案从 `label` 传入，组件内不硬编码用户文案：

```tsx
const LoadingSkeleton: React.FC<{ label: string }> = ({ label }) => (
  <section className="loading-skeleton" role="status" aria-busy="true" aria-label={label}>
    <span className="visually-hidden">{label}</span>
    <div className="loading-skeleton-heading" aria-hidden="true" />
    <div className="loading-skeleton-metrics" aria-hidden="true">
      {Array.from({ length: 4 }, (_, index) => <i key={index} />)}
    </div>
    <div className="loading-skeleton-panels" aria-hidden="true"><i /><i /></div>
  </section>
);
```

`AppContent` 的初次 `loading` 分支使用该组件；后台 refresh 因已有 result 进入数据分支，不显示 skeleton。

- [ ] **Step 5: 更新 Toolbar 和 App 连接**

`ToolbarProps` 增加 `error?: string | null`，移除 `SidebarIcon`。状态文案通过：

```tsx
const scanState = resolveToolbarScanState({ loading, error: error ?? null, scannedAt });
<span className={`scan-status scan-status--${scanState}`}>
  <i aria-hidden="true" />
  {t(`toolbar.scanState.${scanState}`)}
</span>
```

`App.tsx` 把 `error` 传给 Toolbar，把 `refresh` 同时传给 AppContent。中英文补充 `scanning`、`synced`、`stale`、`failed`、`waiting`、`showingPreviousData` 和 `retryScan`。

- [ ] **Step 6: 迁移工具栏和 StatusBanner 样式**

将 `.toolbar*`、`.period-toggle*`、`.language-selector`、`.icon-button` 从 `legacy.css` 移入 `shell.css`；将 `.state-panel`、`.status-banner`、`.loading-skeleton*` 和 `.visually-hidden` 移入 `components.css`。骨架 shimmer 只在 loading 元素存在期间运行，并在 `prefers-reduced-motion` 下关闭；状态点必须配套可见文字。

- [ ] **Step 7: 运行相关测试**

Run: `npm test -- tests/toolbarState.test.ts tests/toolbar.test.tsx tests/appContentModel.test.tsx tests/appContent.test.tsx`

Expected: PASS；预算和设置页无日期范围，已有数据在刷新和失败时保持可见。

- [ ] **Step 8: 提交真实状态与降级行为**

```powershell
git add src/renderer/utils/toolbarState.ts src/renderer/utils/appContentModel.ts src/renderer/components/StatusBanner.tsx src/renderer/components/LoadingSkeleton.tsx src/renderer/components/AppContent.tsx src/renderer/components/Toolbar.tsx src/renderer/App.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles/shell.css src/renderer/styles/components.css src/renderer/styles/legacy.css tests/toolbarState.test.ts tests/toolbar.test.tsx tests/appContentModel.test.tsx tests/appContent.test.tsx
git commit -m "fix: preserve usage data during refresh failures"
```

---

### Task 4: 实现完整键盘标签页并迁移两个工作台

**Files:**
- Create: `src/renderer/components/AccessibleTabs.tsx`
- Modify: `src/renderer/components/BudgetsView.tsx`
- Modify: `src/renderer/components/CostOptimizationView.tsx`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/legacy.css`
- Create: `tests/accessibleTabs.test.tsx`
- Modify: `tests/budgetsView.test.tsx`
- Modify: `tests/costOptimizationView.test.tsx`

**Interfaces:**
- Produces: `AccessibleTab<T>` 与 `AccessibleTabs<T>`。
- Produces: `getTabId(groupId, value)`、`getTabPanelId(groupId, value)`，供 tabpanel 建立准确关联。

- [ ] **Step 1: 写入 roving tabindex 与方向键测试**

```tsx
it('moves selection and focus with arrows, Home, and End', () => {
  const onChange = vi.fn();
  render(
    <AccessibleTabs
      groupId="demo"
      label="Demo views"
      value="overview"
      tabs={[
        { value: 'overview', label: 'Overview' },
        { value: 'pricing', label: 'Pricing' },
        { value: 'alerts', label: 'Alerts' },
      ]}
      onChange={onChange}
    />
  );

  const overview = screen.getByRole('tab', { name: 'Overview' });
  expect(overview.getAttribute('tabindex')).toBe('0');
  fireEvent.keyDown(overview, { key: 'ArrowRight' });
  expect(onChange).toHaveBeenLastCalledWith('pricing');
  fireEvent.keyDown(overview, { key: 'End' });
  expect(onChange).toHaveBeenLastCalledWith('alerts');
});
```

- [ ] **Step 2: 运行测试并确认组件不存在**

Run: `npm test -- tests/accessibleTabs.test.tsx`

Expected: FAIL，无法导入 `AccessibleTabs`。

- [ ] **Step 3: 实现类型安全的受控标签页**

```tsx
export interface AccessibleTab<T extends string> {
  value: T;
  label: string;
}

interface AccessibleTabsProps<T extends string> {
  groupId: string;
  label: string;
  value: T;
  tabs: ReadonlyArray<AccessibleTab<T>>;
  onChange: (value: T) => void;
}

export const getTabId = (groupId: string, value: string): string => `${groupId}-tab-${value}`;
export const getTabPanelId = (groupId: string, value: string): string =>
  `${groupId}-panel-${value}`;
```

组件内部保存 `Map<T, HTMLButtonElement>`，对 `ArrowLeft`、`ArrowRight`、`Home`、`End` 计算目标索引，调用 `onChange(target.value)` 后聚焦对应按钮。每个按钮设置 `role="tab"`、`aria-selected`、`aria-controls` 和 `tabIndex={selected ? 0 : -1}`。

- [ ] **Step 4: 迁移 Budgets 与 Cost Optimization**

删除两处手写 `role="tablist"` 循环，改为 `AccessibleTabs`。内容容器统一为：

```tsx
<div
  id={getTabPanelId('budget', activeTab)}
  role="tabpanel"
  aria-labelledby={getTabId('budget', activeTab)}
>
  {pageContent}
</div>
```

Cost Optimization 使用 `groupId="cost-optimization"` 和现有六个 tab，不改变 tab key 或内容选择逻辑。

- [ ] **Step 5: 统一标签页视觉并删除旧重复规则**

`components.css` 使用 `.accessible-tabs`、`.accessible-tab`、`.accessible-tab.active`；从 `legacy.css` 删除 `.budget-tabs*` 与 `.cost-optimization-tabs*`。标签高度至少 32px，活动状态同时使用文字加粗、浅绿表面和底部轨迹。

- [ ] **Step 6: 运行标签页和页面测试**

Run: `npm test -- tests/accessibleTabs.test.tsx tests/budgetsView.test.tsx tests/costOptimizationView.test.tsx`

Expected: PASS；点击、键盘选择、aria 关联和页面内容保持正确。

- [ ] **Step 7: 提交共享标签页**

```powershell
git add src/renderer/components/AccessibleTabs.tsx src/renderer/components/BudgetsView.tsx src/renderer/components/CostOptimizationView.tsx src/renderer/styles/components.css src/renderer/styles/legacy.css tests/accessibleTabs.test.tsx tests/budgetsView.test.tsx tests/costOptimizationView.test.tsx
git commit -m "feat: add accessible workspace tabs"
```

---

### Task 5: 重做概览指标、趋势语义、活动热力图和数据动效

**Files:**
- Create: `src/renderer/utils/activityGrid.ts`
- Modify: `src/renderer/components/MetricCard.tsx`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/views.css`
- Modify: `src/renderer/styles/legacy.css`
- Create: `tests/activityGrid.test.ts`
- Modify: `tests/overviewTrend.test.tsx`
- Modify: `tests/appContent.test.tsx`

**Interfaces:**
- Produces: `buildActivityCells(days, period, anchorDate): ActivityCell[]`，固定返回 84 个日期单元。
- Changes: `OverviewProps` 增加 `period: UsagePeriod` 与 `scannedAt: string`。
- Changes: `MetricCard` 使用 `emphasis: 'featured' | 'default'`，移除页面装饰性的四色 tone。

- [ ] **Step 1: 写入趋势图例和活动日期模型回归测试**

```ts
const makeActivityDay = (date: string, totalTokens: number): UsageDay => ({
  date,
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  sessionCount: totalTokens > 0 ? 1 : 0,
});

it('marks days outside the selected week separately from zero-usage days', () => {
  const cells = buildActivityCells(
    [makeActivityDay('2026-08-02', 100)],
    'week',
    '2026-08-03'
  );
  expect(cells).toHaveLength(84);
  expect(cells.find(({ date }) => date === '2026-07-27')).toMatchObject({ inPeriod: true, tokens: 0 });
  expect(cells.find(({ date }) => date === '2026-07-26')).toMatchObject({ inPeriod: false });
  expect(cells.find(({ date }) => date === '2026-08-02')).toMatchObject({ inPeriod: true, tokens: 100 });
});

it('changes the overview motion key only when visible data or period changes', () => {
  const summary = buildUsageSummary([PRICED_SESSION]);
  expect(buildOverviewMotionKey(summary, 'week')).toBe(
    buildOverviewMotionKey(summary, 'week')
  );
  expect(buildOverviewMotionKey(summary, 'week')).not.toBe(
    buildOverviewMotionKey(summary, 'month')
  );
});
```

在 Overview 渲染测试增加：

```tsx
expect(markup).toContain('Token Usage Trend');
expect(markup.match(/Total Tokens/g)).toHaveLength(1);
expect(markup).not.toContain('Cost Trends');
expect(markup).not.toContain('>Input<');
expect(markup).toContain('data-motion="overview-story"');
```

- [ ] **Step 2: 运行最小测试并确认失败**

Run: `npm test -- tests/activityGrid.test.ts tests/overviewTrend.test.tsx tests/appContent.test.tsx`

Expected: FAIL；活动工具不存在，当前图仍显示三项图例和 `Cost Trends`。

- [ ] **Step 3: 实现 84 天活动展示模型**

```ts
const ACTIVITY_CELL_COUNT = 84;
const PERIOD_DAY_COUNTS: Record<UsagePeriod, number> = {
  today: 1,
  week: 7,
  month: 30,
  total: ACTIVITY_CELL_COUNT,
};

export interface ActivityCell {
  date: string;
  tokens: number;
  level: 0 | 1 | 2 | 3 | 4;
  inPeriod: boolean;
}

const toUtcDate = (date: string): Date => new Date(`${date}T00:00:00.000Z`);
const toDateKey = (date: Date): string => date.toISOString().slice(0, 10);
const addUtcDays = (date: Date, amount: number): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
};

export const buildActivityCells = (
  days: UsageDay[],
  period: UsagePeriod,
  anchorDate: string
): ActivityCell[] => {
  const tokenByDate = new Map(days.map((day) => [day.date, day.totalTokens]));
  const end = toUtcDate(anchorDate);
  const activeDayCount = PERIOD_DAY_COUNTS[period];
  const periodStartIndex = ACTIVITY_CELL_COUNT - activeDayCount;
  const rawCells = Array.from({ length: ACTIVITY_CELL_COUNT }, (_, index) => {
    const date = toDateKey(addUtcDays(end, index - ACTIVITY_CELL_COUNT + 1));
    return {
      date,
      tokens: tokenByDate.get(date) ?? 0,
      inPeriod: index >= periodStartIndex,
    };
  });
  const maxTokens = Math.max(
    1,
    ...rawCells.filter(({ inPeriod }) => inPeriod).map(({ tokens }) => tokens)
  );

  return rawCells.map(({ date, tokens, inPeriod }) => ({
    date,
    tokens,
    inPeriod,
    level: !inPeriod || tokens === 0
      ? 0
      : (Math.min(
          ACTIVITY_LEVEL_COUNT,
          Math.ceil((tokens / maxTokens) * ACTIVITY_LEVEL_COUNT)
        ) as ActivityCell['level']),
  }));
};
```

以 `anchorDate` 的 UTC 日期为最后一个单元，向前生成 84 个连续日期。周期内缺失日期为 `tokens: 0`，周期外为 `inPeriod: false`；level 只根据周期内最大 Token 计算。所有日期计算使用 UTC，避免本地时区跨日。

- [ ] **Step 4: 修正趋势图语义与 Overview props**

移除 `CHART_COLORS` 和三项图例，保留唯一的总 Token 路径和图例。标题翻译改为 `tokenUsageTrend`；tooltip 仍保留输入、输出、缓存和估算费用。`AppContent` 从 `model.result.scannedAt` 与当前 `period` 传入 Overview。

活动格对周期内日期渲染可聚焦、只读的图形单元，不伪装成可点击按钮：

```tsx
<span
  className={`activity-cell level-${cell.level}`}
  role="img"
  tabIndex={0}
  aria-label={t('overview.activityDay', { date: cell.date, tokens: formatNumber(cell.tokens, locale) })}
/>
```

周期外单元渲染 `aria-hidden="true"` 的静态元素，并使用不同纹理而非零用量颜色。

- [ ] **Step 5: 更新 MetricCard 与一次性数据叙事**

费用卡传入 `emphasis="featured"`，其余卡为 `default`。导出纯函数 `buildOverviewMotionKey(summary, period)`，只在可见数据变化时生成新 key：

```tsx
export const buildOverviewMotionKey = (
  summary: UsageSummary,
  period: UsagePeriod
): string => [
  period,
  summary.totals.inputTokens,
  summary.totals.cachedInputTokens,
  summary.totals.outputTokens,
  summary.totals.reasoningOutputTokens,
  summary.totals.totalTokens,
  summary.sessions.length,
  ...summary.byDay.flatMap(({ date, totalTokens }) => [date, totalTokens]),
].join(':');

const motionKey = buildOverviewMotionKey(summary, period);
return <section key={motionKey} className="overview-grid" data-motion="overview-story">...</section>;
```

趋势 path 设置 `pathLength={1}`。CSS 使用 0–240ms 卡片 stagger、随后不超过 1.4 秒的 path draw 和 point reveal；不得使用无限动画：

```css
[data-motion='overview-story'] .trend-line {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: trend-draw 750ms 420ms ease forwards;
}
@media (prefers-reduced-motion: reduce) {
  [data-motion='overview-story'] * { animation: none !important; transition-duration: 0.01ms !important; }
  [data-motion='overview-story'] .trend-line { stroke-dashoffset: 0; }
}
```

- [ ] **Step 6: 迁移概览和 MetricCard 样式**

将 `.metric-*` 和通用 `.panel*` 移入 `components.css`；将 `.overview-*`、`.trend-*`、`.activity-*` 移入 `views.css`。删除旧 tone 彩虹配色，只保留品牌 featured 与默认表面；从 `legacy.css` 删除已迁移块。

- [ ] **Step 7: 运行概览测试并检查中英文**

Run: `npm test -- tests/activityGrid.test.ts tests/overviewTrend.test.tsx tests/appContent.test.tsx tests/rendererI18n.test.tsx`

Expected: PASS；单线图例、周期外热力格和双语文案正确。

- [ ] **Step 8: 提交概览视觉与语义修复**

```powershell
git add src/renderer/utils/activityGrid.ts src/renderer/components/MetricCard.tsx src/renderer/components/Overview.tsx src/renderer/components/AppContent.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles/components.css src/renderer/styles/views.css src/renderer/styles/legacy.css tests/activityGrid.test.ts tests/overviewTrend.test.tsx tests/appContent.test.tsx
git commit -m "feat: refresh overview data presentation"
```

---

### Task 6: 统一分析页面标题、表格和性能卡片

**Files:**
- Create: `src/renderer/components/PageHeader.tsx`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/components/ProjectsView.tsx`
- Modify: `src/renderer/components/SessionsView.tsx`
- Modify: `src/renderer/components/PerformanceView.tsx`
- Modify: `src/renderer/components/SettingsView.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/views.css`
- Modify: `src/renderer/styles/legacy.css`
- Modify: `tests/analyticsViews.test.tsx`
- Modify: `tests/overviewTrend.test.tsx`
- Modify: `tests/performanceView.test.tsx`
- Modify: `tests/projectRowStyles.test.ts`
- Modify: `tests/settingsView.test.tsx`
- Modify: `tests/toolbar.test.tsx`

**Interfaces:**
- Produces: `PageHeader({ eyebrow?, title, description?, actions? })`。
- Consumes: 现有项目选择、会话筛选、诊断跳转和 Toolbar 周期能力，不修改数据接口。

- [ ] **Step 1: 添加共享页面结构和表格语义测试**

```tsx
it('renders Projects with the shared page heading and numeric table columns', () => {
  const markup = renderWithI18n(<ProjectsView projects={[PROJECT]} onProjectSelect={vi.fn()} />);
  expect(markup).toContain('class="page-header"');
  expect(markup).toContain('Projects');
  expect(markup).toContain('table-cell--numeric');
  expect(markup).toContain('project-table-row');
});

it('keeps the global toolbar focused on status and controls', () => {
  const markup = renderToStaticMarkup(
    <I18nextProvider i18n={testI18n}>
      <Toolbar
        activeView="overview"
        loading={false}
        error={null}
        scannedAt="2026-08-03T08:00:00.000Z"
        onRefresh={vi.fn()}
        period="week"
        onPeriodChange={vi.fn()}
      />
    </I18nextProvider>
  );
  expect(markup).toContain('Local data synced');
  expect(markup).not.toContain('<strong>Overview</strong>');
});
```

为 Overview、Sessions、Performance、Settings 添加相同的页面标题类断言，并保留现有可见文本和交互断言。

- [ ] **Step 2: 运行四个页面测试并确认缺少共享结构**

Run: `npm test -- tests/analyticsViews.test.tsx tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/settingsView.test.tsx tests/toolbar.test.tsx`

Expected: FAIL，尚无 `PageHeader` 和数值列 class。

- [ ] **Step 3: 创建 PageHeader 并迁移页面结构**

```tsx
interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, actions }) => (
  <header className="page-header">
    <div className="page-header-copy">
      {eyebrow ? <span>{eyebrow}</span> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions ? <div className="page-header-actions">{actions}</div> : null}
  </header>
);
```

Overview、Projects、Sessions、Performance、Settings 顶层使用 `page-stack` + PageHeader。Toolbar 删除 `VIEW_TRANSLATION_KEYS` 和重复的当前页面 `<strong>`，左侧只显示真实扫描状态与最近扫描时间，右侧保留周期、语言和刷新。

新增说明文案固定为：

| 页面 | English | 简体中文 |
| --- | --- | --- |
| Overview | Track local cost, tokens, cache efficiency, and activity. | 查看本地费用、Token、缓存效率和活动。 |
| Projects | Compare local Codex usage by project. | 按项目比较本地 Codex 用量。 |
| Sessions | Inspect token usage and diagnostics for each local session. | 查看每个本地会话的 Token 用量和诊断。 |
| Performance | Review cache efficiency, cost, activity, and application errors. | 查看缓存效率、费用、活跃时段和应用错误。 |
| Settings | Review local data access, privacy, pricing assumptions, and scan warnings. | 查看本地数据访问、隐私、计价假设和扫描警告。 |

- [ ] **Step 4: 统一表格与性能卡片标记**

数值 span 增加 `table-cell--numeric`；主字段继续保留名称与元数据两层。可点击项目行保持原生 button 和现有 `onProjectSelect`。Performance 卡片只调整结构 class，不改变图表数据和峰值计算。

`projectRowStyles.test.ts` 改为读取 `components.css` 与 `views.css`，并断言 `.table-row` 使用 `color: var(--color-text-muted)`、`font-size: var(--font-size-body-small)`，项目按钮没有覆盖为浏览器默认字体。

- [ ] **Step 5: 迁移共享表格和分析页面样式**

将 `.data-table`、`.table-row`、`.table-head`、`.primary-cell`、`.ok-cell`、`.warning-cell` 移入 `components.css`；将 `.project-*`、`.session-*`、`.performance-*`、`.settings-*` 移入 `views.css`。正文至少 12px，表格行至少 48px，数值右对齐并使用 `font-variant-numeric: tabular-nums`。

- [ ] **Step 6: 运行分析页面与跨页导航测试**

Run: `npm test -- tests/analyticsViews.test.tsx tests/overviewTrend.test.tsx tests/projectRowStyles.test.ts tests/performanceView.test.tsx tests/settingsView.test.tsx tests/toolbar.test.tsx tests/appNavigation.test.tsx`

Expected: PASS；项目进入 Sessions、清除筛选和诊断跳转无回归。

- [ ] **Step 7: 提交分析页面迁移**

```powershell
git add src/renderer/components/PageHeader.tsx src/renderer/components/Overview.tsx src/renderer/components/ProjectsView.tsx src/renderer/components/SessionsView.tsx src/renderer/components/PerformanceView.tsx src/renderer/components/SettingsView.tsx src/renderer/components/Toolbar.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles/components.css src/renderer/styles/views.css src/renderer/styles/legacy.css tests/analyticsViews.test.tsx tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/projectRowStyles.test.ts tests/settingsView.test.tsx tests/toolbar.test.tsx
git commit -m "feat: unify analytics page presentation"
```

---

### Task 7: 迁移预算中心视觉体系

**Files:**
- Modify: `src/renderer/components/BudgetsView.tsx`
- Modify: `src/renderer/components/BudgetSummary.tsx`
- Modify: `src/renderer/components/BudgetList.tsx`
- Modify: `src/renderer/components/BudgetAlertBanner.tsx`
- Modify: `src/renderer/components/ModelPricingView.tsx`
- Modify: `src/renderer/components/BudgetDrawer.tsx`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/views.css`
- Modify: `src/renderer/styles/legacy.css`
- Modify: `tests/budgetsView.test.tsx`
- Modify: `tests/budgetDrawer.test.tsx`
- Modify: `tests/modelPricingView.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `AccessibleTabs`，Task 6 的 `PageHeader`，Task 3 的 `StatusBanner`。
- Produces: 统一的预算 summary、filter bar、table、progress 和 pricing form class；预算 actions 与 view model 类型不变。

- [ ] **Step 1: 添加预算页面共享组件与非颜色状态测试**

```tsx
it('uses shared heading, tabs, and textual budget status', () => {
  const markup = renderWithI18n(<BudgetsView snapshot={SNAPSHOT} actions={ACTIONS} />);
  expect(markup).toContain('class="page-header"');
  expect(markup).toContain('class="accessible-tabs"');
  expect(markup).toContain('budget-status-label');
  expect(markup).toContain('On track');
});
```

在现有测试 fixture 中分别覆盖正常、接近上限、超出、未计价，并断言每个状态包含文字而非只有 class。

- [ ] **Step 2: 运行预算测试并确认视觉结构断言失败**

Run: `npm test -- tests/budgetsView.test.tsx tests/budgetDrawer.test.tsx tests/modelPricingView.test.tsx`

Expected: FAIL，页面仍使用独立 heading 和旧状态结构。

- [ ] **Step 3: 迁移 BudgetsView 页面结构**

使用 PageHeader 承载标题、说明、阈值、编辑阈值和添加预算操作；使用 AccessibleTabs 切换概览与模型价格。旧数据使用 StatusBanner，filter bar 保持现有 scope/period 状态和 change handler。

- [ ] **Step 4: 统一预算摘要、列表和价格表单**

- BudgetSummary：三列卡片使用统一 `summary-card`，状态数字配文字。
- BudgetList：数值列右对齐，progress 同时显示百分比、已用值和限额。
- BudgetAlertBanner：每条提醒包含图标、标题、说明和具体操作。
- ModelPricingView：输入框高度 36px，字段错误靠近字段，未定价模型使用文字标签。
- BudgetDrawer：只应用共享 drawer class；焦点行为留给 Task 9。

- [ ] **Step 5: 迁移预算 CSS 并删除旧块**

通用 `.summary-card`、`.progress-track`、`.status-label`、`.filter-bar` 放入 `components.css`；所有 `.budget-*` 与 `.pricing-*` 页面布局放入 `views.css`。从 `legacy.css` 删除对应规则，不修改阈值颜色的业务含义。

- [ ] **Step 6: 运行预算最小测试集**

Run: `npm test -- tests/budgetsView.test.tsx tests/budgetViewModel.test.tsx tests/budgetForm.test.tsx tests/budgetDrawer.test.tsx tests/modelPricingView.test.tsx`

Expected: PASS；筛选、编辑、删除确认、价格补充和状态计算无回归。

- [ ] **Step 7: 提交预算视觉迁移**

```powershell
git add src/renderer/components/BudgetsView.tsx src/renderer/components/BudgetSummary.tsx src/renderer/components/BudgetList.tsx src/renderer/components/BudgetAlertBanner.tsx src/renderer/components/ModelPricingView.tsx src/renderer/components/BudgetDrawer.tsx src/renderer/styles/components.css src/renderer/styles/views.css src/renderer/styles/legacy.css tests/budgetsView.test.tsx tests/budgetDrawer.test.tsx tests/modelPricingView.test.tsx
git commit -m "feat: refresh budget workspace visuals"
```

---

### Task 8: 迁移成本优化与会话诊断视觉体系

**Files:**
- Modify: `src/renderer/components/CostOptimizationView.tsx`
- Modify: `src/renderer/components/CostOptimizationOverview.tsx`
- Modify: `src/renderer/components/ModelCostComparison.tsx`
- Modify: `src/renderer/components/CostAnomalies.tsx`
- Modify: `src/renderer/components/CostForecast.tsx`
- Modify: `src/renderer/components/SavingsRecommendations.tsx`
- Modify: `src/renderer/components/SessionDiagnosticsView.tsx`
- Modify: `src/renderer/components/SessionDiagnosisList.tsx`
- Modify: `src/renderer/components/SessionDiagnosisDetail.tsx`
- Modify: `src/renderer/components/SessionDiagnosisTimeline.tsx`
- Modify: `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/views.css`
- Modify: `src/renderer/styles/legacy.css`
- Modify: `tests/costOptimizationView.test.tsx`
- Modify: `tests/sessionDiagnosticsView.test.tsx`
- Modify: `tests/sessionDiagnosisList.test.tsx`
- Modify: `tests/sessionDiagnosisDetail.test.tsx`
- Modify: `tests/sessionDiagnosisTimeline.test.tsx`

**Interfaces:**
- Consumes: Task 4 的 `AccessibleTabs`，Task 6 的 `PageHeader`，Task 3 的 `StatusBanner` 与 `LoadingSkeleton`。
- Produces: 统一的 cost detail table、evidence card、severity/confidence badge 和 diagnosis layout class；诊断数据与 callbacks 不变。

- [ ] **Step 1: 添加工作台结构和非颜色诊断状态测试**

```tsx
const renderReadyCostOptimization = (): string =>
  renderWithI18n(
    <CostOptimizationView
      model={{ kind: 'ready', snapshot: SNAPSHOT }}
      projectOptions={['C:\\repo']}
      projectPath={null}
      activeTab="overview"
      diagnosisId={null}
      diagnosisDetailModel={{ kind: 'idle' }}
      onActiveTabChange={vi.fn()}
      onDiagnosisOpen={vi.fn()}
      onDiagnosisClose={vi.fn()}
      onProjectPathChange={vi.fn()}
      onUpdateSettings={vi.fn()}
    />
  );

it('renders the cost workspace with shared presentation primitives', () => {
  const markup = renderReadyCostOptimization();
  expect(markup).toContain('class="page-header"');
  expect(markup).toContain('class="accessible-tabs"');
  expect(markup).toContain('status-label');
});

it('keeps severity and confidence visible as text', () => {
  const markup = renderWithI18n(
    <SessionDiagnosisDetailView detail={makeDiagnosisDetail()} onBack={vi.fn()} />
  );
  expect(markup).toContain('Critical');
  expect(markup).toContain('High confidence');
});
```

- [ ] **Step 2: 运行成本优化和诊断测试并确认结构断言失败**

Run: `npm test -- tests/costOptimizationView.test.tsx tests/sessionDiagnosticsView.test.tsx tests/sessionDiagnosisList.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/sessionDiagnosisTimeline.test.tsx`

Expected: FAIL，尚未使用共享 heading、status 和新布局 class。

- [ ] **Step 3: 迁移 CostOptimizationView 外壳**

使用 PageHeader 承载标题、项目选择器和分析设置；AccessibleTabs 保留六个现有 tab；stale 与 warnings 使用 StatusBanner。loading 分支改用 LoadingSkeleton，error/ready 分支和 snapshot 数据不改变。

- [ ] **Step 4: 迁移六个分析标签页**

- Overview：最多一个深绿重点费用卡，其余为默认卡片。
- Comparison：价格、情景成本和节省金额右对齐；免责声明保留。
- Anomalies：severity、baseline 和 contribution chain 均有文字标签。
- Forecast：预测区间与预算穿越信息形成标题、数值和说明三层。
- Savings：金额、置信度、风险和重叠说明保持可见。
- Diagnostics：列表、详情、证据和 detector 状态使用同一 status-label 规则。

不得改变任何排序、筛选、置信度、费用门槛或诊断结论。

- [ ] **Step 5: 优化时间线可读性与焦点**

保留现有 SVG 数据点和 model switch 逻辑，统一品牌轨迹线；每个数据点继续支持 hover 与键盘焦点，focus ring 使用品牌浅色，tooltip 对比度达到 AA。`prefers-reduced-motion` 下不播放路径入场。

- [ ] **Step 6: 迁移成本与诊断 CSS**

通用 detail table、badge、definition list 和 evidence card 进入 `components.css`；`.cost-*` 与 `.session-diagnosis-*` 布局进入 `views.css`。逐块从 `legacy.css` 删除，避免复制后保留两个来源。

- [ ] **Step 7: 运行成本优化最小测试集**

Run: `npm test -- tests/costOptimizationView.test.tsx tests/costOptimizationSuggestions.test.ts tests/costAnomalies.test.tsx tests/costForecast.test.tsx tests/sessionDiagnosticsView.test.tsx tests/sessionDiagnosisList.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/sessionDiagnosisTimeline.test.tsx`

Expected: PASS；六个 tab、筛选、详情返回、诊断徽标和时间线交互无回归。

- [ ] **Step 8: 提交成本优化视觉迁移**

```powershell
git add src/renderer/components/CostOptimizationView.tsx src/renderer/components/CostOptimizationOverview.tsx src/renderer/components/ModelCostComparison.tsx src/renderer/components/CostAnomalies.tsx src/renderer/components/CostForecast.tsx src/renderer/components/SavingsRecommendations.tsx src/renderer/components/SessionDiagnosticsView.tsx src/renderer/components/SessionDiagnosisList.tsx src/renderer/components/SessionDiagnosisDetail.tsx src/renderer/components/SessionDiagnosisTimeline.tsx src/renderer/components/CostOptimizationSettingsDrawer.tsx src/renderer/styles/components.css src/renderer/styles/views.css src/renderer/styles/legacy.css tests/costOptimizationView.test.tsx tests/sessionDiagnosticsView.test.tsx tests/sessionDiagnosisList.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/sessionDiagnosisTimeline.test.tsx
git commit -m "feat: refresh cost optimization workspace"
```

---

### Task 9: 完善抽屉焦点、对话框和非阻塞反馈

**Files:**
- Create: `src/renderer/hooks/useOverlayFocus.ts`
- Create: `src/renderer/components/ToastNotice.tsx`
- Modify: `src/renderer/components/BudgetDrawer.tsx`
- Modify: `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- Modify: `src/renderer/components/ConfirmDialog.tsx`
- Modify: `src/renderer/components/BudgetsView.tsx`
- Modify: `src/renderer/components/CostOptimizationView.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles/components.css`
- Modify: `tests/budgetDrawer.test.tsx`
- Modify: `tests/costOptimizationSettingsDrawer.test.tsx`
- Modify: `tests/budgetsView.test.tsx`
- Create: `tests/useOverlayFocus.test.tsx`

**Interfaces:**
- Produces: `useOverlayFocus<T extends HTMLElement>(onClose): React.RefObject<T>`。
- Produces: `ToastNotice({ message, onDismiss, durationMs? })`，默认 4000ms。
- Changes: `BudgetDrawer` 增加 `onSaved?: () => void`；设置 drawer 成功回调后由父页面显示 toast。

- [ ] **Step 1: 写入浮层焦点和 toast 自动关闭测试**

```tsx
const OverlayHarness: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const dialogRef = useOverlayFocus<HTMLDivElement>(close);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open ? (
        <div ref={dialogRef} role="dialog" aria-label="Example dialog">
          <button type="button" onClick={close}>Close</button>
          <button type="button">Save</button>
        </div>
      ) : null}
    </>
  );
};

it('focuses the first control, traps Tab, closes on Escape, and restores focus', () => {
  render(<OverlayHarness />);
  const trigger = screen.getByRole('button', { name: 'Open' });
  fireEvent.click(trigger);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(document.activeElement).toBe(trigger);
});

it('dismisses a toast after the configured duration', () => {
  vi.useFakeTimers();
  const onDismiss = vi.fn();
  render(<ToastNotice message="Budget saved" onDismiss={onDismiss} durationMs={1000} />);
  vi.advanceTimersByTime(1000);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
```

- [ ] **Step 2: 运行浮层测试并确认缺少 hook 和 toast**

Run: `npm test -- tests/useOverlayFocus.test.tsx tests/budgetDrawer.test.tsx tests/costOptimizationSettingsDrawer.test.tsx`

Expected: FAIL，模块不存在或焦点行为不完整。

- [ ] **Step 3: 实现 useOverlayFocus**

Hook 在 mount 时保存 `document.activeElement`，聚焦容器内第一个 button/input/select/textarea/[tabindex]；处理 Escape；Tab 到末尾时回到第一个，Shift+Tab 从第一个回到最后一个；unmount 时恢复原焦点。查询选择器定义为具名常量，监听器在 cleanup 中移除。

```ts
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');
```

- [ ] **Step 4: 应用完整 dialog 语义**

BudgetDrawer 与 CostOptimizationSettingsDrawer 使用 `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 和 hook ref。ConfirmDialog 使用 `role="alertdialog"`。关闭按钮是第一个可聚焦控件，所有 onClose callbacks 使用稳定 `useCallback`。

- [ ] **Step 5: 实现并连接 ToastNotice**

```tsx
const DEFAULT_TOAST_DURATION_MS = 4000;

const ToastNotice: React.FC<ToastNoticeProps> = ({
  message,
  onDismiss,
  durationMs = DEFAULT_TOAST_DURATION_MS,
}) => {
  React.useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return <div className="toast-notice" role="status">...</div>;
};
```

预算策略保存和成本优化设置保存成功后关闭 drawer，并显示双语成功文案；失败时保持 drawer 打开并继续使用现有字段或全局错误。

- [ ] **Step 6: 添加抽屉和 toast 动效降级**

抽屉滑入不超过 220ms，toast 入场不超过 180ms；`prefers-reduced-motion` 下移除 transform 和 animation。禁止 `transition: all`。

- [ ] **Step 7: 运行浮层和表单测试**

Run: `npm test -- tests/useOverlayFocus.test.tsx tests/budgetDrawer.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/budgetsView.test.tsx`

Expected: PASS；保存、失败、关闭、Escape、焦点恢复和 toast 定时器正确。

- [ ] **Step 8: 提交浮层交互完善**

```powershell
git add src/renderer/hooks/useOverlayFocus.ts src/renderer/components/ToastNotice.tsx src/renderer/components/BudgetDrawer.tsx src/renderer/components/CostOptimizationSettingsDrawer.tsx src/renderer/components/ConfirmDialog.tsx src/renderer/components/BudgetsView.tsx src/renderer/components/CostOptimizationView.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles/components.css tests/useOverlayFocus.test.tsx tests/budgetDrawer.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/budgetsView.test.tsx
git commit -m "feat: polish overlay focus and feedback"
```

---

### Task 10: 删除临时样式、加强策略检查并完成验收

**Files:**
- Delete: `src/renderer/styles/legacy.css`
- Modify: `src/renderer/styles.css`
- Modify: `src/renderer/styles/tokens.css`
- Modify: `src/renderer/styles/base.css`
- Modify: `src/renderer/styles/shell.css`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/views.css`
- Modify: `tests/uiStylePolicy.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–9 已迁移的全部 selector。
- Produces: 最终五层样式入口，不再存在 legacy；自动阻止低于字号下限、裸业务色和无限动画回流。

- [ ] **Step 1: 先把策略测试改为最终约束并确认失败**

先把文件系统导入改为：

```ts
import { existsSync, readFileSync } from 'node:fs';
```

```ts
it('has no temporary legacy stylesheet after migration', () => {
  expect(readRendererStyle('styles.css')).not.toContain('legacy.css');
  expect(existsSync(resolve(process.cwd(), 'src/renderer/styles/legacy.css'))).toBe(false);
});

it('keeps raw colors inside tokens only', () => {
  for (const file of ['base.css', 'shell.css', 'components.css', 'views.css']) {
    expect(readRendererStyle(`styles/${file}`)).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  }
});

it('forbids undersized production text and unsafe blanket transitions', () => {
  const css = ['base.css', 'shell.css', 'components.css', 'views.css']
    .map((file) => readRendererStyle(`styles/${file}`))
    .join('\n');
  const fontSizes = css.match(/font-size:\s*[^;]+;/g) ?? [];
  expect(fontSizes.every((declaration) => declaration.includes('var(--font-size-'))).toBe(true);
  expect(css).not.toContain('transition: all');
  expect(css).toContain('@media (prefers-reduced-motion: reduce)');
});
```

- [ ] **Step 2: 运行策略测试并确认 legacy 约束失败**

Run: `npm test -- tests/uiStylePolicy.test.ts`

Expected: FAIL，仍导入且存在 `legacy.css`。

- [ ] **Step 3: 审计并迁移所有剩余规则**

运行：

```powershell
rg -n "^[.#@]|font-size:|#[0-9a-fA-F]" src\renderer\styles\legacy.css
rg -n "#[0-9a-fA-F]{3,8}|rgba?\(" src\renderer --glob "!**/styles/tokens.css"
```

第一条命令用于迁移 legacy；第二条命令最终应无输出。逐段按责任移动到 base/shell/components/views；颜色全部替换为 `tokens.css` 中具名令牌。若剩余选择器已经不再被 JSX 使用，先用 `rg` 确认零引用再删除。最终删除 `legacy.css`，入口变为：

```css
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/shell.css';
@import './styles/components.css';
@import './styles/views.css';
```

- [ ] **Step 4: 更新 README 的界面名称和视觉说明**

将界面结构中的 `Tools` / `Wrapped` 更新为 `Projects` / `Settings`，中文对应“项目”/“设置”；补充 Quiet Pro · Signature、只读本地状态和费用为本地估算的简短说明。不得把设计文档全文复制到 README。

- [ ] **Step 5: 运行策略、格式和受影响回归测试**

Run: `npm test -- tests/uiStylePolicy.test.ts tests/sidebar.test.tsx tests/toolbar.test.tsx tests/overviewTrend.test.tsx tests/accessibleTabs.test.tsx tests/useOverlayFocus.test.tsx`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

Run: `npm run lint`

Expected: PASS，无 warning。

- [ ] **Step 6: 运行全量测试**

Run: `npm test`

Expected: 全部测试 PASS；不得删除测试、放宽有效断言或隐藏错误。

- [ ] **Step 7: 运行生产构建并人工检查 Electron**

Run: `npm run build`

Expected: TypeScript 与 Electron/Vite 构建成功。

启动应用后检查：

- `1280 × 820` 与 `1024 × 680`。
- 英文与简体中文。
- 概览、会话、项目、性能、预算、成本优化、设置。
- 初次加载、后台刷新、旧数据、错误、空状态、未计价。
- 键盘导航、标签页方向键、抽屉焦点循环、Escape 和焦点恢复。
- 正常动态效果与系统减少动态效果。

- [ ] **Step 8: 确认变更范围并提交最终清理**

Run: `git status --short`

Expected: 只包含本计划相关文件，不包含 `.superpowers/` 或其他用户修改。

```powershell
git add src/renderer/styles.css src/renderer/styles/tokens.css src/renderer/styles/base.css src/renderer/styles/shell.css src/renderer/styles/components.css src/renderer/styles/views.css tests/uiStylePolicy.test.ts README.md
git commit -m "refactor: complete renderer visual system migration"
```

---

## 最终完成条件

- Tasks 1–10 的独立测试和提交均完成。
- `legacy.css` 已删除，样式入口只包含五个最终层次。
- 所有用户可见新文案均有英文和简体中文。
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 全部通过。
- 设计文档中的导航、图表、旧数据、动效、可访问性和本地只读约束全部有对应实现与测试。
