# 代码审查问题分层修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 修复代码审查确认的六类问题，在不安装 Airbnb 相关依赖的前提下提升解析可靠性、扫描性能和规范可执行性。

**架构：** 修复按数据入口、统计语义、扫描编排和展示工具四个边界推进。运行时数据在解析入口完成校验，扫描器负责有限并发和错误聚合，renderer 仅消费稳定类型并通过共享常量与格式化工具展示。

**技术栈：** Electron 31、React 18、TypeScript 5、Vitest 2、ESLint 10、Prettier 3。

## 全局约束

- 直接在 `master` 分支实施，不创建新分支或 worktree。
- 设计文档和实施计划使用中文。
- 不安装 `eslint-config-airbnb`、`eslint-plugin-import`、`eslint-plugin-jsx-a11y`、`eslint-plugin-react` 或其他 Airbnb 相关依赖。
- 不新增运行时校验库、并发库或格式化库。
- 禁止 `any`、`var` 和未命名的业务或布局魔法值。
- React 组件使用 `React.FC<Props>`，组件 Props 使用 `interface`。
- 不覆盖当前未提交的 `package-lock.json` 变更。

## 文件结构

- 新建 `src/shared/runtimeTypes.ts`：跨主进程模块复用的运行时类型守卫。
- 新建 `src/shared/ipcChannels.ts`：主进程和 preload 共用的 IPC 通道常量。
- 新建 `src/renderer/utils/formatters.ts`：renderer 数字与日期格式化。
- 修改 `src/main/sessionParser.ts`：逐行结构校验和 Token 字段校验。
- 修改 `src/main/usageScanner.ts`：无参数副作用的目录发现和有限并发读取。
- 修改 `src/shared/usageMetrics.ts`：删除基于 warning 的错误率计算。
- 修改 `src/renderer/components/PerformanceView.tsx`：Error Rate 固定为零并集中图表参数。
- 修改 `src/renderer/components/Overview.tsx`：集中趋势图布局参数。
- 修改 `src/main/ipc.ts`、`src/preload/preload.ts`：使用共享 IPC 通道。
- 修改 renderer 组件：使用共享格式化工具和具名 UI 常量。
- 修改 `eslint.config.js`：使用 ESLint 原生规则落实选定规范。
- 修改现有测试并新增解析、扫描、Performance 和格式化测试。

---

### 任务 1：为 JSONL 解析增加运行时类型边界

**文件：**
- 新建：`src/shared/runtimeTypes.ts`
- 修改：`src/main/sessionParser.ts`
- 修改：`tests/sessionParser.test.ts`

**接口：**
- 产出：`isRecord(value: unknown): value is Record<string, unknown>`
- 产出：`parseSessionJsonl(sourceFile: string, content: string, threadName?: string): UsageSession`
- 规则：非对象记录和非法 Token 字段生成行级 warning，其他合法行继续解析。

- [ ] **步骤 1：添加异常结构回归测试**

在 `tests/sessionParser.test.ts` 添加以下场景，并把测试辅助函数改为 `const` 函数表达式：

```ts
it('skips non-object JSON records without losing valid usage', () => {
  const content = [
    'null',
    '[]',
    JSON.stringify({
      timestamp: '2026-07-11T01:01:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: usage(4, 1, 2, 0, 6) },
      },
    }),
  ].join('\n');

  const session = parseSessionJsonl('invalid-records.jsonl', content);

  expect(session.totalTokens).toBe(6);
  expect(session.warnings).toHaveLength(2);
  expect(session.warnings.map(({ line }) => line)).toEqual([1, 2]);
});

it('rejects invalid token fields without contaminating totals', () => {
  const content = [
    JSON.stringify({
      timestamp: '2026-07-11T01:00:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: {
            input_tokens: '10',
            total_tokens: -1,
          },
        },
      },
    }),
    JSON.stringify({
      timestamp: '2026-07-11T01:01:00.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: usage(3, 0, 2, 0, 5) },
      },
    }),
  ].join('\n');

  const session = parseSessionJsonl('invalid-token.jsonl', content);

  expect(session.totalTokens).toBe(5);
  expect(session.eventCount).toBe(1);
  expect(session.warnings).toHaveLength(1);
});
```

- [ ] **步骤 2：运行解析器测试并确认失败**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sessionParser.test.ts
```

预期：`null` 记录触发运行时异常，或非法 Token 值使断言失败。

- [ ] **步骤 3：实现共享类型守卫与行级校验**

在 `src/shared/runtimeTypes.ts` 提供：

```ts
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
```

在 `sessionParser.ts` 中让 `JSON.parse` 保持 `unknown`，并使用以下边界函数：

```ts
interface ParsedLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

const TOKEN_USAGE_KEYS = [
  'input_tokens',
  'cached_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'total_tokens',
] as const;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isParsedLine = (value: unknown): value is ParsedLine => {
  if (!isRecord(value)) {
    return false;
  }

  if (!isOptionalString(value.timestamp) || !isOptionalString(value.type)) {
    return false;
  }

  return value.payload === undefined || isRecord(value.payload);
};

const isValidTokenValue = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

const toTokenUsage = (raw: unknown): TokenUsage | undefined => {
  if (!isRecord(raw) || TOKEN_USAGE_KEYS.some((key) => !isValidTokenValue(raw[key]))) {
    return undefined;
  }

  return {
    inputTokens: raw.input_tokens ?? 0,
    cachedInputTokens: raw.cached_input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    reasoningOutputTokens: raw.reasoning_output_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0,
  };
};
```

解析循环在根记录非法时追加 `Invalid JSONL record skipped.`；Token 对象存在但校验失败时追加 `Invalid token usage skipped.` 并返回到下一行。只有成功解析的 Token 事件增加 `eventCount`。

- [ ] **步骤 4：运行解析器测试并确认通过**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sessionParser.test.ts
```

预期：5 项解析器测试全部通过。

- [ ] **步骤 5：提交解析可靠性修复**

```powershell
git add src/shared/runtimeTypes.ts src/main/sessionParser.ts tests/sessionParser.test.ts
git commit -m "fix: validate session records at runtime"
```

---

### 任务 2：把 Error Rate 与扫描 warning 解耦

**文件：**
- 修改：`src/shared/usageMetrics.ts`
- 修改：`src/renderer/components/PerformanceView.tsx`
- 修改：`tests/usageMetrics.test.ts`
- 新建：`tests/performanceView.test.tsx`

**接口：**
- 移除：`countSessionWarnings`、`getWarningRate`
- 行为：Performance Error Rate 始终显示 `0.00% (0/N)`，其中 `N` 是当前会话数。

- [ ] **步骤 1：编写 Performance 静态渲染测试**

使用 `renderToStaticMarkup` 构造包含多个 warning 的汇总：

```tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PerformanceView from '../src/renderer/components/PerformanceView';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';

const makeSession = (warningCount: number): UsageSession => ({
  sessionId: `session-${warningCount}`,
  startedAt: '2026-07-16T00:00:00.000Z',
  endedAt: '2026-07-16T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 10,
  eventCount: 1,
  sourceFile: `session-${warningCount}.jsonl`,
  warnings: Array.from({ length: warningCount }, () => ({ message: 'warning' })),
});

describe('PerformanceView', () => {
  it('keeps application error rate at zero when scan warnings exist', () => {
    const summary = buildUsageSummary([makeSession(3), makeSession(1)]);
    const markup = renderToStaticMarkup(<PerformanceView summary={summary} />);

    expect(markup).toContain('0.00% (0/2)');
    expect(markup).not.toContain('stroke-dasharray="-');
  });
});
```

- [ ] **步骤 2：运行指标和 Performance 测试并确认失败**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageMetrics.test.ts tests/performanceView.test.tsx
```

预期：Performance 仍显示基于 warning 的百分比，新增测试失败。

- [ ] **步骤 3：删除错误指标并固定应用错误率**

从 `usageMetrics.ts` 删除 warning 计数与错误率函数及其测试。`PerformanceView.tsx` 使用具名常量：

```ts
const APPLICATION_ERROR_COUNT = 0;
const APPLICATION_ERROR_RATE = 0;
```

展示和 Donut 调用改为：

```tsx
<p>
  {APPLICATION_ERROR_RATE.toFixed(2)}% ({APPLICATION_ERROR_COUNT}/{summary.sessions.length})
</p>
<Donut value={PERCENT_SCALE - APPLICATION_ERROR_RATE} />
```

- [ ] **步骤 4：运行指标和 Performance 测试并确认通过**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageMetrics.test.ts tests/performanceView.test.tsx
```

预期：全部测试通过，Error Rate 与 warning 数量无关。

- [ ] **步骤 5：提交指标语义修复**

```powershell
git add src/shared/usageMetrics.ts src/renderer/components/PerformanceView.tsx tests/usageMetrics.test.ts tests/performanceView.test.tsx
git commit -m "fix: separate errors from scan warnings"
```

---

### 任务 3：重构扫描器为无参数副作用的有限并发流程

**文件：**
- 修改：`src/main/usageScanner.ts`
- 新建：`tests/usageScanner.test.ts`

**接口：**
- 保持：`scanCodexUsage(options?: ScanOptions): Promise<UsageScanResult>`
- 新增内部结果：`FileDiscoveryResult`、`ThreadNameResult`、`SessionFileResult`
- 并发上限：`MAX_CONCURRENT_FILE_READS = 8`

- [ ] **步骤 1：编写临时目录扫描测试**

测试使用 `mkdtemp`、`writeFile` 和 `rm` 创建两个合法文件及一个无法解析的文件，断言：

```ts
it('keeps stable session order and isolates unreadable session data', async () => {
  await writeFile(join(testDirectory, 'b.jsonl'), validSession('b', '2026-07-16T00:00:00.000Z'));
  await writeFile(join(testDirectory, 'a.jsonl'), validSession('a', '2026-07-16T00:00:00.000Z'));
  await writeFile(join(testDirectory, 'broken.jsonl'), 'null');

  const result = await scanCodexUsage({ sessionsDir: testDirectory });

  expect(result.summary.sessions.map(({ sessionId }) => sessionId)).toEqual(['a', 'b', 'broken']);
  expect(result.warnings.some(({ sourceFile }) => sourceFile?.endsWith('broken.jsonl'))).toBe(true);
});

it('returns a directory warning when the sessions path is missing', async () => {
  const missingDirectory = join(testDirectory, 'missing');
  const result = await scanCodexUsage({ sessionsDir: missingDirectory });

  expect(result.summary.sessions).toEqual([]);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0].sourceFile).toBe(missingDirectory);
});
```

`validSession` 返回包含 `session_meta` 与一条合法 Token 事件的 JSONL 字符串。测试在 `afterEach` 中递归删除临时目录。

- [ ] **步骤 2：运行扫描器测试建立基线**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageScanner.test.ts
```

预期：在任务 1 完成后两项行为测试通过；当前实现尚不能满足无参数副作用和有限并发结构要求，该基线用于保护重构。

- [ ] **步骤 3：实现结构化发现结果**

使用以下内部接口：

```ts
interface FileDiscoveryResult {
  files: string[];
  warnings: UsageWarning[];
}

interface ThreadNameResult {
  names: Map<string, string>;
  warnings: UsageWarning[];
}

interface SessionFileResult {
  session?: UsageSession;
  warnings: UsageWarning[];
}
```

`findJsonlFiles(dir)` 不再接收 `warnings`，目录项使用 `Promise.all(entries.map(...))` 产生子结果，再通过 `flatMap` 合并文件与 warning。读取失败直接返回 `{ files: [], warnings: [directoryWarning] }`。

`loadThreadNames(sessionIndexPath)` 返回 `ThreadNameResult`，使用 `isRecord` 校验索引记录，不修改外部数组。

- [ ] **步骤 4：实现保序有限并发映射**

在扫描器内增加：

```ts
const MAX_CONCURRENT_FILE_READS = 8;

interface IndexedResult<Value> {
  value: Value;
}

const mapWithConcurrency = async <Input, Output>(
  items: Input[],
  concurrency: number,
  mapper: (item: Input) => Promise<Output>
): Promise<Output[]> => {
  const results = new Map<number, IndexedResult<Output>>();
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    const currentIndex = nextIndex;
    nextIndex += 1;

    if (currentIndex >= items.length) {
      return;
    }

    results.set(currentIndex, { value: await mapper(items[currentIndex]) });
    await runNext();
  };

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  return items.map((_, index) => {
    const result = results.get(index);
    if (!result) {
      throw new Error(`Missing concurrent result at index ${index}.`);
    }
    return result.value;
  });
};
```

每个 mapper 捕获自己的文件读取错误并返回 `SessionFileResult`，所以单文件失败不会使 `Promise.all` 拒绝。

- [ ] **步骤 5：集中合并扫描结果并运行测试**

`scanCodexUsage` 并行获取目录发现结果和线程名称结果，随后有限并发读取文件。按以下顺序合并 warning：目录、线程索引、文件读取和会话解析。运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageScanner.test.ts tests/sessionParser.test.ts tests/usageMath.test.ts
```

预期：扫描器、解析器和汇总测试全部通过。

- [ ] **步骤 6：提交扫描流程重构**

```powershell
git add src/main/usageScanner.ts tests/usageScanner.test.ts
git commit -m "refactor: bound session scan concurrency"
```

---

### 任务 4：提取 renderer 格式化工具

**文件：**
- 新建：`src/renderer/utils/formatters.ts`
- 新建：`tests/formatters.test.ts`
- 修改：`src/renderer/components/MetricCard.tsx`
- 修改：`src/renderer/components/Overview.tsx`
- 修改：`src/renderer/components/ProjectsView.tsx`
- 修改：`src/renderer/components/SessionsView.tsx`
- 修改：`src/renderer/components/Toolbar.tsx`

**接口：**
- `formatCompactNumber(value: number): string`
- `formatNumber(value: number): string`
- `formatShortDateTime(value: string): string`
- 无效日期返回 `Unknown date`。

- [ ] **步骤 1：编写格式化工具测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  formatCompactNumber,
  formatNumber,
  formatShortDateTime,
} from '../src/renderer/utils/formatters';

describe('renderer formatters', () => {
  it('formats regular and compact token values', () => {
    expect(formatNumber(1_234)).toBe('1,234');
    expect(formatCompactNumber(1_200)).toBe('1.2K');
  });

  it('returns a stable fallback for invalid dates', () => {
    expect(formatShortDateTime('not-a-date')).toBe('Unknown date');
  });
});
```

- [ ] **步骤 2：运行格式化测试并确认失败**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/formatters.test.ts
```

预期：模块尚不存在，测试失败。

- [ ] **步骤 3：实现共享格式化工具**

```ts
const COMPACT_NUMBER_THRESHOLD = 1_000;
const DATE_FALLBACK = 'Unknown date';
const NUMBER_LOCALE = 'en';

export const formatCompactNumber = (value: number): string =>
  new Intl.NumberFormat(NUMBER_LOCALE, {
    notation: 'compact',
    maximumFractionDigits: value >= COMPACT_NUMBER_THRESHOLD ? 1 : 0,
  }).format(value);

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat(NUMBER_LOCALE).format(value);

export const formatShortDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return DATE_FALLBACK;
  }

  return new Intl.DateTimeFormat(NUMBER_LOCALE, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
```

删除 `MetricCard.tsx` 中的格式化函数，以及 Projects、Sessions、Toolbar 中重复的日期函数。所有调用点改为从 `../utils/formatters` 或 `../../utils/formatters` 导入。

- [ ] **步骤 4：运行格式化及组件相关测试**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/formatters.test.ts tests/overviewTrend.test.tsx tests/toolbar.test.tsx
```

预期：格式化、趋势图和 Toolbar 测试全部通过。

- [ ] **步骤 5：提交格式化工具重构**

```powershell
git add src/renderer/utils/formatters.ts src/renderer/components/MetricCard.tsx src/renderer/components/Overview.tsx src/renderer/components/ProjectsView.tsx src/renderer/components/SessionsView.tsx src/renderer/components/Toolbar.tsx tests/formatters.test.ts tests/overviewTrend.test.tsx
git commit -m "refactor: centralize renderer formatters"
```

---

### 任务 5：集中 IPC 与图表布局常量

**文件：**
- 新建：`src/shared/ipcChannels.ts`
- 新建：`src/renderer/constants/ui.ts`
- 修改：`src/main/ipc.ts`
- 修改：`src/preload/preload.ts`
- 修改：`src/renderer/App.tsx`
- 修改：`src/renderer/components/EmptyState.tsx`
- 修改：`src/renderer/components/MetricCard.tsx`
- 修改：`src/renderer/components/Overview.tsx`
- 修改：`src/renderer/components/PerformanceView.tsx`
- 修改：`src/renderer/components/SettingsView.tsx`
- 修改：`src/renderer/components/Sidebar.tsx`
- 修改：`src/renderer/components/SessionsView.tsx`
- 修改：`src/renderer/components/Toolbar.tsx`

**接口：**
- `USAGE_SCAN_CHANNEL = 'usage:scan'`
- UI 常量按图标尺寸、描边宽度和图表布局分组导出。

- [ ] **步骤 1：增加共享 IPC 通道并替换重复字符串**

```ts
export const USAGE_SCAN_CHANNEL = 'usage:scan';
```

`ipc.ts` 和 `preload.ts` 都从 `../shared/ipcChannels` 导入该常量，分别用于 `ipcMain.handle` 与 `ipcRenderer.invoke`。

- [ ] **步骤 2：定义通用 UI 常量**

在 `src/renderer/constants/ui.ts` 定义：

```ts
export const ICON_SIZE_SMALL = 14;
export const ICON_SIZE_MEDIUM = 18;
export const ICON_SIZE_LARGE = 22;
export const ICON_SIZE_EMPTY_STATE = 24;
export const ICON_STROKE_WIDTH = 1.8;
export const NAV_ICON_STROKE_WIDTH = 1.9;
```

组件使用这些常量替换 JSX 中有设计含义的数字。

- [ ] **步骤 3：集中 Overview 图表布局参数**

把 viewBox、网格和坐标组织为具名常量：

```ts
const CHART_VIEWBOX = `0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`;
const CHART_GRID_LINE_COUNT = 5;
const CHART_GRID_TOP = 42;
const CHART_GRID_GAP = 34;
const DATE_LABEL_START_INDEX = 5;
const MAX_X_AXIS_LABEL_COUNT = 8;
const CHART_GRID_LINES = Array.from({ length: CHART_GRID_LINE_COUNT }, (_, index) => index);
```

SVG 的 `viewBox`、`x1`、`x2`、`y1`、`y2` 和日期截取都引用具名常量，不改变现有坐标结果。

- [ ] **步骤 4：集中 Performance 图表布局参数**

为 MiniLine 和 Donut 定义 viewBox、起止坐标、基线、垂直范围、网格数量、中心点和半径常量。所有 JSX 数值属性与坐标计算改为引用这些常量；`PERCENT_SCALE` 保持单一来源。

- [ ] **步骤 5：运行现有交互与组件测试**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/toolbar.test.tsx tests/menuPolicy.test.ts
```

预期：布局计算元数据、Error Rate、Toolbar 和菜单策略测试全部通过。

- [ ] **步骤 6：提交常量集中化改动**

```powershell
git add src/shared/ipcChannels.ts src/renderer/constants/ui.ts src/main/ipc.ts src/preload/preload.ts src/renderer/App.tsx src/renderer/components/EmptyState.tsx src/renderer/components/MetricCard.tsx src/renderer/components/Overview.tsx src/renderer/components/PerformanceView.tsx src/renderer/components/SettingsView.tsx src/renderer/components/Sidebar.tsx src/renderer/components/SessionsView.tsx src/renderer/components/Toolbar.tsx
git commit -m "refactor: centralize application constants"
```

---

### 任务 6：使用 ESLint 原生规则落实函数和参数规范

**文件：**
- 修改：`eslint.config.js`
- 修改：`src/**/*.ts`
- 修改：`src/**/*.tsx`
- 修改：`tests/**/*.ts`
- 修改：`tests/**/*.tsx`

**接口：**
- 不改变任何公开业务接口。
- 普通函数统一为具名 `const` 函数表达式。
- 默认导出函数采用“声明常量，再默认导出”的形式。

- [ ] **步骤 1：增加低噪声 ESLint 原生规则**

在 TypeScript 规则块增加：

```js
'curly': ['error', 'all'],
'eqeqeq': ['error', 'always'],
'func-style': ['error', 'expression'],
'no-param-reassign': ['error', { props: true }],
'object-shorthand': ['error', 'always'],
'prefer-const': 'error',
'prefer-template': 'error',
```

新增只作用于 `src/**/*.{ts,tsx}` 的规则块：

```js
{
  files: ['src/**/*.{ts,tsx}'],
  rules: {
    'no-magic-numbers': [
      'error',
      {
        enforceConst: true,
        ignore: [-1, 0, 1, 2],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
      },
    ],
  },
},
```

测试目录不启用 `no-magic-numbers`，避免测试样本数字被误判为业务常量。

- [ ] **步骤 2：运行 lint 并确认规则捕获现有偏差**

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

预期：`func-style` 报告普通函数声明，`no-magic-numbers` 报告尚未命名的生产数值。

- [ ] **步骤 3：转换生产代码函数声明**

按以下模式转换所有 `src` 函数：

```ts
export const getCodexHomeDir = (): string => join(homedir(), '.codex');

const registerUsageIpc = (): void => {
  ipcMain.handle(USAGE_SCAN_CHANNEL, () => scanCodexUsage());
};

export default registerUsageIpc;
```

需要转换的模块包括 `codexPaths.ts`、`ipc.ts`、`main.ts`、`menuPolicy.ts`、`sessionParser.ts`、`usageScanner.ts`、`sessionId.ts`、`usageMath.ts`、`usageMetrics.ts`、`MetricCard.tsx`、`Overview.tsx`、`PerformanceView.tsx`、`ProjectsView.tsx`、`SessionsView.tsx` 和 `Toolbar.tsx`。

- [ ] **步骤 4：转换测试辅助函数声明**

按以下形式转换测试辅助函数，不改变测试数据：

```ts
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
  projectName: projectPath.split('\\').pop() ?? projectPath,
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

涉及 `sessionParser.test.ts`、`usageMetrics.test.ts`、`usageMath.test.ts`、`overviewTrend.test.tsx`、`toolbar.test.tsx`、`performanceView.test.tsx` 和 `usageScanner.test.ts`。

- [ ] **步骤 5：命名剩余生产魔法值并运行 lint**

根据 lint 输出，将仍有业务含义的数值提升为 `UPPER_CASE_SNAKE_CASE` 模块常量。不得把所有数字加入 ESLint `ignore`；忽略列表保持 `-1`、`0`、`1`、`2`。

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

预期：ESLint 与 Prettier 均通过且无 warning。

- [ ] **步骤 6：运行完整测试和类型检查**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

预期：全部测试通过，两个 TypeScript 项目均无错误。

- [ ] **步骤 7：提交规范落实改动**

```powershell
git add eslint.config.js src tests
git commit -m "refactor: enforce native code style rules"
```

---

### 任务 7：全量验证与范围审计

**文件：**
- 检查：`package.json`
- 检查：`package-lock.json`
- 检查：全部已修改源码与测试

**接口：**
- 不新增接口；本任务验证完成标准。

- [ ] **步骤 1：确认没有 Airbnb 依赖**

```powershell
rg -n "eslint-config-airbnb|eslint-plugin-import|eslint-plugin-jsx-a11y|eslint-plugin-react" package.json package-lock.json
```

预期：无匹配输出。

- [ ] **步骤 2：确认禁止模式已清除**

```powershell
rg -n "\bany\b|\bvar\b|^(export default )?(export )?(async )?function\s" src tests --glob '*.{ts,tsx}'
```

预期：无匹配输出。

- [ ] **步骤 3：执行完整质量门禁**

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run build
```

预期：所有命令退出码均为 `0`；测试文件数和测试数不少于实施前的 7 个文件、18 项测试。

- [ ] **步骤 4：检查提交范围和工作区状态**

```powershell
git diff --check
git status --short
git log -8 --oneline
```

预期：没有空白错误；`package-lock.json` 的既有未提交状态保持可见但未进入本次提交；提交历史包含本计划中的分层提交。
