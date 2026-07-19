# Token 预算控制实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Codex Token Usage 增加全局/项目、日/周/月自然周期的 Token 与预估费用预算，并提供模型价格维护、应用内预警和系统通知。

**Architecture:** 共享领域层提供时间周期、价格计算、预算评估和运行时校验等纯函数；Electron 主进程通过版本化 JSON 持久化配置，维护增量扫描缓存并调度通知；Preload 暴露类型化 IPC，React 使用独立 Budgets 页面展示和编辑。现有 Overview 滚动周期保持不变，预算评估使用按时间和模型拆分的用量切片。

**Tech Stack:** Electron 31、React 18、TypeScript 5.5、electron-vite 2、Vitest 2、lucide-react、Node.js `fs/promises`。

## Global Constraints

- 直接在当前 `master` 开发，不创建分支或 worktree。
- 保留 ESLint 10，不安装或恢复 `eslint-config-airbnb` 及其相关依赖。
- 不新增运行时依赖；`electron` 继续只存在于 `devDependencies`。
- 禁止使用 `any`、`var` 和硬编码魔法值。
- React 组件使用 `React.FC`，禁止类组件；组件 Props 使用 `interface`。
- JSX 中组合两个或更多业务谓词的判断提取为具名布尔变量或纯函数；互斥界面使用明确的渲染状态模型。
- 不保存可以从 props 或现有 state 推导出的重复 React state。
- 新界面沿用现有英文文案和 Lumo 风格；卡片圆角不超过 8px，按钮优先使用 `lucide-react` 图标并提供 `title`。
- 预算周期使用本机自然日、周一开始的自然周和自然月；Overview 的 Today/Week/Month 继续使用现有滚动周期。
- 费用仅为美元预估，不代表实际账单；未知模型不得猜测价格。
- 首版应用运行时每 60 秒扫描一次，窗口聚焦时刷新；应用退出后不后台常驻。

## 文件结构

### 共享领域层

- `src/shared/budgetTypes.ts`：预算配置、价格、状态、快照及 IPC 输入类型。
- `src/shared/budgetPeriods.ts`：自然周期边界和项目路径规范化。
- `src/shared/budgetValidation.ts`：预算、阈值、价格覆盖的运行时校验。
- `src/shared/pricing.ts`：价格合并、模型匹配和费用计算。
- `src/shared/budgetEvaluation.ts`：按范围和自然周期评估预算、生成预警。
- `src/shared/notificationPolicy.ts`：系统通知去重和回执更新纯函数。
- `src/shared/usageTypes.ts`：新增按时间和模型归属的 `UsageSlice`。
- `src/shared/ipcChannels.ts`：预算及主进程推送频道常量。

### Electron 主进程

- `src/main/defaultModelPricing.ts`：首版内置模型价格及官方来源。
- `src/main/budgetStore.ts`：版本化 JSON 读取、备份、迁移和原子写入。
- `src/main/usageMonitor.ts`：单飞刷新、60 秒调度和聚焦节流。
- `src/main/budgetRuntime.ts`：协调扫描、配置、评估、持久化和快照发布。
- `src/main/notificationService.ts`：Electron 系统通知及点击导航。
- `src/main/sessionParser.ts`：解析模型上下文和用量切片。
- `src/main/usageScanner.ts`：基于路径、大小、修改时间的内存缓存。
- `src/main/ipc.ts`：注册类型化预算 IPC 和快照广播。
- `src/main/main.ts`：组装运行时、窗口焦点刷新和生命周期清理。

### Preload 与渲染层

- `src/preload/preload.ts`、`src/renderer/global.d.ts`：类型化预算 API、更新订阅和导航订阅。
- `src/renderer/hooks/useBudgetSnapshot.ts`：预算快照加载和订阅生命周期。
- `src/renderer/utils/budgetViewModel.ts`：预算摘要、分组和页面渲染状态。
- `src/renderer/utils/budgetForm.ts`：预算抽屉纯 reducer 和提交数据转换。
- `src/renderer/components/BudgetsView.tsx`：预算中心页面及标签切换。
- `src/renderer/components/BudgetSummary.tsx`：即将超限、已超限、未计价摘要。
- `src/renderer/components/BudgetList.tsx`：全局/项目预算列表和进度。
- `src/renderer/components/BudgetAlertBanner.tsx`：应用内预警。
- `src/renderer/components/BudgetDrawer.tsx`：预算和阈值编辑抽屉。
- `src/renderer/components/ModelPricingView.tsx`：模型价格列表与覆盖编辑。
- `src/renderer/components/ConfirmDialog.tsx`：删除预算二次确认。
- `src/renderer/App.tsx`、`AppContent.tsx`、`Sidebar.tsx`、`Toolbar.tsx`、`styles.css`：导航、页面接入和视觉样式。

---

### Task 1: 建立预算类型、自然周期与校验边界

**Files:**
- Create: `src/shared/budgetTypes.ts`
- Create: `src/shared/budgetPeriods.ts`
- Create: `src/shared/budgetValidation.ts`
- Test: `tests/budgetPeriods.test.ts`
- Test: `tests/budgetValidation.test.ts`

**Interfaces:**
- Produces: `BudgetPolicyInput`、`BudgetPolicy`、`BudgetThresholds`、`ModelPricingOverrideInput`、`ModelPricingOverride`、`ModelPricingEntry`、`BudgetSnapshot`。
- Produces: `getNaturalPeriodRange(period, now)`、`normalizeProjectPath(path)`、`getBudgetBusinessKey(input)`。
- Produces: `getBudgetPolicyIssues(input)`、`getThresholdIssues(input)`、`getPricingOverrideIssues(input)`。

- [ ] **Step 1: 编写自然周期和路径规范化失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { getNaturalPeriodRange, normalizeProjectPath } from '../src/shared/budgetPeriods';

describe('budget periods', () => {
  it('starts the natural week on Monday in local time', () => {
    const now = new Date(2026, 6, 22, 15, 30);
    const range = getNaturalPeriodRange('week', now);

    expect(range.start).toEqual(new Date(2026, 6, 20, 0, 0, 0, 0));
    expect(range.end).toEqual(now);
  });

  it('normalizes Windows project paths for identity', () => {
    expect(normalizeProjectPath('C:\\Repo\\Token-Usage\\')).toBe('c:/repo/token-usage');
  });
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `npm test -- tests/budgetPeriods.test.ts`

Expected: FAIL，提示无法解析 `budgetPeriods`。

- [ ] **Step 3: 定义预算领域类型和自然周期函数**

```ts
export type BudgetScope = 'global' | 'project';
export type BudgetPeriod = 'day' | 'week' | 'month';
export type BudgetMetric = 'token' | 'cost';
export type BudgetSeverity = 'normal' | 'warning' | 'critical' | 'over';

export interface BudgetPolicyInput {
  id?: string;
  scope: BudgetScope;
  projectPath?: string;
  period: BudgetPeriod;
  tokenLimit?: number;
  costLimitUsd?: number;
}

export interface BudgetPolicy extends BudgetPolicyInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetThresholds {
  warningPercent: number;
  criticalPercent: number;
}

export interface ModelPricingOverrideInput {
  modelId: string;
  aliases: string[];
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface ModelPricingOverride extends ModelPricingOverrideInput {
  updatedAt: string;
}

export interface ModelPricingEntry extends ModelPricingOverrideInput {
  effectiveAt: string;
  sourceKind: 'built-in' | 'override';
  sourceUrl?: string;
}

export interface BudgetProgress {
  used: number;
  limit: number;
  percent: number;
  severity: BudgetSeverity;
  incomplete?: boolean;
}

export interface BudgetPolicyStatus {
  policy: BudgetPolicy;
  periodStart: string;
  periodEnd: string;
  token?: BudgetProgress;
  cost?: BudgetProgress;
  unpricedTokens: number;
  unpricedModelIds: string[];
}

export interface BudgetAlert {
  id: string;
  policyId: string;
  period: BudgetPeriod;
  periodStart: string;
  metric: BudgetMetric;
  thresholdPercent: number;
  severity: Exclude<BudgetSeverity, 'normal'>;
  message: string;
}

export interface NotificationReceipt {
  key: string;
  policyId: string;
  periodStart: string;
}

export interface PersistedBudgetConfig {
  schemaVersion: number;
  policies: BudgetPolicy[];
  thresholds: BudgetThresholds;
  pricingOverrides: ModelPricingOverride[];
  notificationReceipts: NotificationReceipt[];
}

export interface UnpricedModelSummary {
  modelId?: string;
  totalTokens: number;
}

export interface BudgetSnapshot {
  generatedAt: string;
  dataState: 'fresh' | 'stale';
  staleReason?: string;
  thresholds: BudgetThresholds;
  statuses: BudgetPolicyStatus[];
  alerts: BudgetAlert[];
  summary: {
    warningCount: number;
    overCount: number;
    unpricedModelCount: number;
  };
  pricing: ModelPricingEntry[];
  unpricedModels: UnpricedModelSummary[];
}

export interface CostEstimate {
  pricedCostUsd: number;
  unpricedTokens: number;
  unpricedModelIds: string[];
}

export interface NaturalPeriodRange {
  start: Date;
  end: Date;
}

export const getNaturalPeriodRange = (
  period: BudgetPeriod,
  now: Date = new Date()
): NaturalPeriodRange => {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  }

  if (period === 'month') {
    start.setDate(1);
  }

  return { start, end: new Date(now) };
};

export const normalizeProjectPath = (projectPath: string): string =>
  projectPath.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase('en-US');
```

- [ ] **Step 4: 编写预算及阈值校验失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { getBudgetPolicyIssues, getThresholdIssues } from '../src/shared/budgetValidation';

describe('budget validation', () => {
  it('requires a project path and at least one positive limit', () => {
    expect(
      getBudgetPolicyIssues({ scope: 'project', period: 'day', tokenLimit: 0 })
    ).toEqual([
      { field: 'projectPath', message: 'Project is required.' },
      { field: 'tokenLimit', message: 'Token limit must be greater than 0.' },
      { field: 'limits', message: 'Enable at least one budget limit.' },
    ]);
  });

  it('requires ordered global thresholds at or below 100', () => {
    expect(getThresholdIssues({ warningPercent: 95, criticalPercent: 90 })).toHaveLength(1);
    expect(getThresholdIssues({ warningPercent: 80, criticalPercent: 100 })).toEqual([]);
  });
});
```

- [ ] **Step 5: 实现结构化校验和业务唯一键**

```ts
export interface ValidationIssue {
  field: string;
  message: string;
}

const isPositiveFinite = (value: number | undefined): boolean =>
  value !== undefined && Number.isFinite(value) && value > 0;

export const getBudgetBusinessKey = (input: BudgetPolicyInput): string => {
  const scopeKey = input.scope === 'global' ? 'global' : normalizeProjectPath(input.projectPath ?? '');
  return `${input.scope}:${scopeKey}:${input.period}`;
};

export const getBudgetPolicyIssues = (input: BudgetPolicyInput): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const hasTokenLimit = isPositiveFinite(input.tokenLimit);
  const hasCostLimit = isPositiveFinite(input.costLimitUsd);

  if (input.scope === 'project' && !input.projectPath?.trim()) {
    issues.push({ field: 'projectPath', message: 'Project is required.' });
  }
  if (input.tokenLimit !== undefined && !hasTokenLimit) {
    issues.push({ field: 'tokenLimit', message: 'Token limit must be greater than 0.' });
  }
  if (input.costLimitUsd !== undefined && !hasCostLimit) {
    issues.push({ field: 'costLimitUsd', message: 'Cost limit must be greater than 0.' });
  }
  if (!hasTokenLimit && !hasCostLimit) {
    issues.push({ field: 'limits', message: 'Enable at least one budget limit.' });
  }
  return issues;
};

export const getThresholdIssues = (input: BudgetThresholds): ValidationIssue[] =>
  input.warningPercent > 0 &&
  input.warningPercent < input.criticalPercent &&
  input.criticalPercent <= 100
    ? []
    : [{ field: 'thresholds', message: 'Thresholds must be ordered between 0 and 100.' }];
```

- [ ] **Step 6: 运行领域测试和类型检查**

Run: `npm test -- tests/budgetPeriods.test.ts tests/budgetValidation.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交任务**

```bash
git add src/shared/budgetTypes.ts src/shared/budgetPeriods.ts src/shared/budgetValidation.ts tests/budgetPeriods.test.ts tests/budgetValidation.test.ts
git commit -m "feat: add budget domain foundations"
```

### Task 2: 按时间和模型解析 Token 用量切片

**Files:**
- Modify: `src/shared/usageTypes.ts`
- Modify: `src/main/sessionParser.ts`
- Modify: `tests/sessionParser.test.ts`
- Modify: `tests/appContent.test.tsx`
- Modify: `tests/appContentModel.test.tsx`
- Modify: `tests/performanceView.test.tsx`
- Modify: `tests/usageMath.test.ts`

**Interfaces:**
- Produces: `UsageSlice { occurredAt, modelId?, TokenUsage }`。
- Produces: every parsed `UsageSession` has `usageSlices: UsageSlice[]`。
- Preserves: session totals continue to prefer summed `last_token_usage`, with largest `total_token_usage` as fallback.

- [ ] **Step 1: 为模型切换和累计兜底添加失败测试**

```ts
it('attributes incremental token slices to the active model', () => {
  const content = [
    JSON.stringify({ timestamp: '2026-07-20T00:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.2-codex' } }),
    tokenLine('2026-07-20T00:01:00.000Z', usage(10, 2, 3, 1, 13)),
    JSON.stringify({ timestamp: '2026-07-20T00:02:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.3-codex' } }),
    tokenLine('2026-07-20T00:03:00.000Z', usage(20, 5, 4, 2, 24)),
  ].join('\n');

  const session = parseSessionJsonl('models.jsonl', content);

  expect(session.usageSlices.map(({ modelId, totalTokens }) => ({ modelId, totalTokens }))).toEqual([
    { modelId: 'gpt-5.2-codex', totalTokens: 13 },
    { modelId: 'gpt-5.3-codex', totalTokens: 24 },
  ]);
});

it('leaves an ambiguous total-only slice unpriced', () => {
  const session = parseSessionJsonl('unknown-model.jsonl', tokenTotalLine(usage(10, 0, 2, 1, 12)));
  expect(session.usageSlices).toEqual([
    expect.objectContaining({ modelId: undefined, totalTokens: 12 }),
  ]);
});

const tokenLine = (timestamp: string, lastUsage: ReturnType<typeof usage>): string =>
  JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: { type: 'token_count', info: { last_token_usage: lastUsage } },
  });

const tokenTotalLine = (totalUsage: ReturnType<typeof usage>): string =>
  JSON.stringify({
    timestamp: '2026-07-20T00:00:00.000Z',
    type: 'event_msg',
    payload: { type: 'token_count', info: { total_token_usage: totalUsage } },
  });
```

- [ ] **Step 2: 运行解析器测试并确认新字段断言失败**

Run: `npm test -- tests/sessionParser.test.ts`

Expected: FAIL，`usageSlices` 不存在。

- [ ] **Step 3: 扩展用量类型并在解析器跟踪活动模型**

```ts
export interface UsageSlice extends TokenUsage {
  occurredAt: string;
  modelId?: string;
}

export interface UsageSession extends TokenUsage {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  threadName?: string;
  usageSlices: UsageSlice[];
  eventCount: number;
  sourceFile: string;
  warnings: UsageWarning[];
}
```

在 `parseSessionJsonl` 中使用以下状态与归属规则：

```ts
let activeModelId: string | undefined;
const incrementalSlices: UsageSlice[] = [];
let largestTotalSlice: UsageSlice | undefined;

if (
  (record.type === 'turn_context' || record.type === 'session_meta') &&
  typeof record.payload?.model === 'string'
) {
  activeModelId = record.payload.model;
}

if (lastUsage) {
  const occurredAt = record.timestamp || endedAt || new Date(0).toISOString();
  incrementalSlices.push({ ...lastUsage, occurredAt, modelId: activeModelId });
}

if (totalUsage && (!largestTotalSlice || totalUsage.totalTokens >= largestTotalSlice.totalTokens)) {
  largestTotalSlice = {
    ...totalUsage,
    occurredAt: record.timestamp || endedAt || new Date(0).toISOString(),
    modelId: activeModelId,
  };
}

const usageSlices = hasIncrementalUsage
  ? incrementalSlices
  : largestTotalSlice
    ? [largestTotalSlice]
    : [];
```

- [ ] **Step 4: 给现有测试夹具补充 `usageSlices`**

所有手写 `UsageSession` 夹具增加明确字段；无需模型归属的测试使用：

```ts
usageSlices: [],
```

- [ ] **Step 5: 运行解析、统计和渲染相关回归测试**

Run: `npm test -- tests/sessionParser.test.ts tests/usageMath.test.ts tests/appContent.test.tsx tests/appContentModel.test.tsx tests/performanceView.test.tsx`

Expected: PASS，且现有会话总量断言不变。

- [ ] **Step 6: 提交任务**

```bash
git add src/shared/usageTypes.ts src/main/sessionParser.ts tests/sessionParser.test.ts tests/appContent.test.tsx tests/appContentModel.test.tsx tests/performanceView.test.tsx tests/usageMath.test.ts
git commit -m "feat: attribute usage slices to models"
```

### Task 3: 实现内置模型价格与费用计算

**Files:**
- Create: `src/main/defaultModelPricing.ts`
- Create: `src/shared/pricing.ts`
- Modify: `src/shared/budgetTypes.ts`
- Test: `tests/pricing.test.ts`

**Interfaces:**
- Produces: `DEFAULT_MODEL_PRICING: ModelPricingEntry[]`。
- Produces: `mergeModelPricing(defaults, overrides)`。
- Produces: `calculateEstimatedCost(slices, pricing): CostEstimate`、`getSessionUsageSlices(session)`、`buildDailyCostEstimates(sessions, pricing)`。

- [ ] **Step 1: 编写缓存输入、模型别名和未知模型失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { calculateEstimatedCost, mergeModelPricing } from '../src/shared/pricing';

describe('pricing', () => {
  it('prices cached input separately and does not add reasoning twice', () => {
    const estimate = calculateEstimatedCost(
      [{ occurredAt: '2026-07-20T00:00:00.000Z', modelId: 'gpt-test', inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, reasoningOutputTokens: 5, totalTokens: 120 }],
      [{ modelId: 'gpt-test', aliases: [], inputUsdPerMillion: 2, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 10, effectiveAt: '2026-07-20', sourceKind: 'built-in' }]
    );

    expect(estimate.pricedCostUsd).toBeCloseTo(0.00034, 8);
    expect(estimate.unpricedTokens).toBe(0);
  });

  it('keeps unknown model tokens unpriced', () => {
    const estimate = calculateEstimatedCost(
      [{ occurredAt: '2026-07-20T00:00:00.000Z', modelId: 'future-model', inputTokens: 10, cachedInputTokens: 0, outputTokens: 2, reasoningOutputTokens: 0, totalTokens: 12 }],
      []
    );

    expect(estimate).toEqual({ pricedCostUsd: 0, unpricedTokens: 12, unpricedModelIds: ['future-model'] });
  });
});
```

- [ ] **Step 2: 运行价格测试并确认失败**

Run: `npm test -- tests/pricing.test.ts`

Expected: FAIL，提示价格模块不存在。

- [ ] **Step 3: 固定首版官方价格表**

`DEFAULT_MODEL_PRICING` 使用 2026-07-20 查验的每百万 Token 美元价格：

```ts
export const DEFAULT_MODEL_PRICING: ModelPricingEntry[] = [
  pricing('gpt-5.3-codex', 1.75, 0.175, 14, 'https://developers.openai.com/api/docs/models/gpt-5.3-codex'),
  pricing('gpt-5.2-codex', 1.75, 0.175, 14, 'https://developers.openai.com/api/docs/models/gpt-5.2-codex'),
  pricing('gpt-5.1-codex', 1.25, 0.125, 10, 'https://developers.openai.com/api/docs/models/gpt-5.1-codex'),
  pricing('gpt-5.1-codex-max', 1.25, 0.125, 10, 'https://developers.openai.com/api/docs/models/gpt-5.1-codex-max'),
  pricing('gpt-5.1-codex-mini', 0.25, 0.025, 2, 'https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini'),
  pricing('gpt-5-codex', 1.25, 0.125, 10, 'https://developers.openai.com/api/docs/models/gpt-5-codex'),
  pricing('codex-mini-latest', 1.5, 0.375, 6, 'https://developers.openai.com/api/docs/models/codex-mini-latest'),
];
```

`pricing` 是文件内纯构造函数，统一写入 `effectiveAt: '2026-07-20'`、空别名和 `sourceKind: 'built-in'`。

- [ ] **Step 4: 实现价格覆盖合并和费用公式**

```ts
const TOKENS_PER_MILLION = 1_000_000;

export const calculateEstimatedCost = (
  slices: UsageSlice[],
  pricingEntries: ModelPricingEntry[]
): CostEstimate => {
  const pricingById = buildPricingIndex(pricingEntries);

  return slices.reduce<CostEstimate>(
    (estimate, slice) => {
      const modelKey = slice.modelId?.toLocaleLowerCase('en-US');
      const modelPricing = modelKey ? pricingById.get(modelKey) : undefined;

      if (!modelPricing) {
        return {
          pricedCostUsd: estimate.pricedCostUsd,
          unpricedTokens: estimate.unpricedTokens + slice.totalTokens,
          unpricedModelIds: addUniqueModelId(estimate.unpricedModelIds, slice.modelId),
        };
      }

      const regularInputTokens = Math.max(slice.inputTokens - slice.cachedInputTokens, 0);
      const pricedCostUsd =
        (regularInputTokens * modelPricing.inputUsdPerMillion +
          slice.cachedInputTokens * modelPricing.cachedInputUsdPerMillion +
          slice.outputTokens * modelPricing.outputUsdPerMillion) /
        TOKENS_PER_MILLION;

      return { ...estimate, pricedCostUsd: estimate.pricedCostUsd + pricedCostUsd };
    },
    { pricedCostUsd: 0, unpricedTokens: 0, unpricedModelIds: [] }
  );
};
```

`getSessionUsageSlices` 在解析器数据完整时直接返回 `session.usageSlices`；兼容旧夹具或旧调用时，用会话总量和 `endedAt` 构造一个无模型兜底切片。`buildDailyCostEstimates` 按切片的本地日期分组后复用 `calculateEstimatedCost`，供现有 Cost Trends 使用。

- [ ] **Step 5: 运行价格测试和类型检查**

Run: `npm test -- tests/pricing.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交任务**

```bash
git add src/main/defaultModelPricing.ts src/shared/pricing.ts src/shared/budgetTypes.ts tests/pricing.test.ts
git commit -m "feat: add model based cost pricing"
```

### Task 4: 评估预算状态并生成可去重预警

**Files:**
- Create: `src/shared/budgetEvaluation.ts`
- Create: `src/shared/notificationPolicy.ts`
- Modify: `src/shared/budgetTypes.ts`
- Test: `tests/budgetEvaluation.test.ts`
- Test: `tests/notificationPolicy.test.ts`

**Interfaces:**
- Consumes: `UsageSession[]`、`BudgetPolicy[]`、`BudgetThresholds`、`ModelPricingEntry[]`。
- Produces: `evaluateBudgets(input): BudgetSnapshot`。
- Produces: `selectPendingNotifications(alerts, receipts)`、`recordNotifications(receipts, alerts, activePolicyIds)`。

- [ ] **Step 1: 编写范围、自然周期和不完整费用失败测试**

```ts
it('evaluates project day budgets from slices inside the natural day', () => {
  const snapshot = evaluateBudgets({
    sessions: [makeSession('C:\\repo', [sliceAt(2026, 6, 20, 900, 'gpt-test'), sliceAt(2026, 6, 19, 700, 'gpt-test')])],
    policies: [makePolicy({ scope: 'project', projectPath: 'c:/REPO', period: 'day', tokenLimit: 1_000 })],
    thresholds: { warningPercent: 80, criticalPercent: 100 },
    pricing: [makePricing('gpt-test')],
    now: new Date(2026, 6, 20, 12, 0),
    dataState: 'fresh',
  });

  expect(snapshot.statuses[0].token).toEqual(expect.objectContaining({ used: 900, percent: 90, severity: 'warning' }));
});

it('marks cost progress incomplete when any token cannot be priced', () => {
  const snapshot = evaluateBudgets(makeEvaluationInputWithUnknownModel());
  expect(snapshot.statuses[0].cost).toEqual(expect.objectContaining({ incomplete: true }));
  expect(snapshot.unpricedModels).toHaveLength(1);
});

const sliceAt = (
  year: number,
  month: number,
  day: number,
  totalTokens: number,
  modelId?: string
): UsageSlice => ({
  occurredAt: new Date(year, month, day, 10, 0).toISOString(),
  modelId,
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
});

const makePolicy = (overrides: Partial<BudgetPolicy>): BudgetPolicy => ({
  id: 'policy-1',
  scope: 'global',
  period: 'day',
  tokenLimit: 1_000,
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  ...overrides,
});

const makePricing = (modelId: string): ModelPricingEntry => ({
  modelId,
  aliases: [],
  inputUsdPerMillion: 1,
  cachedInputUsdPerMillion: 0.1,
  outputUsdPerMillion: 5,
  effectiveAt: '2026-07-20',
  sourceKind: 'built-in',
});

const makeSession = (projectPath: string, usageSlices: UsageSlice[]): UsageSession => {
  const totals = usageSlices.reduce<TokenUsage>(
    (total, slice) => addTokenUsage(total, slice),
    emptyTokenUsage()
  );
  return {
    sessionId: 'session-1',
    startedAt: usageSlices[0]?.occurredAt ?? '2026-07-20T00:00:00.000Z',
    endedAt: usageSlices.at(-1)?.occurredAt ?? '2026-07-20T00:00:00.000Z',
    projectPath,
    projectName: getProjectName(projectPath),
    usageSlices,
    ...totals,
    eventCount: usageSlices.length,
    sourceFile: 'session-1.jsonl',
    warnings: [],
  };
};

const makeEvaluationInputWithUnknownModel = (): EvaluateBudgetsInput => ({
  sessions: [makeSession('C:\\repo', [sliceAt(2026, 6, 20, 900)])],
  policies: [makePolicy({ costLimitUsd: 1, tokenLimit: undefined })],
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  pricing: [],
  now: new Date(2026, 6, 20, 12, 0),
  dataState: 'fresh',
});
```

- [ ] **Step 2: 运行预算评估测试并确认失败**

Run: `npm test -- tests/budgetEvaluation.test.ts tests/notificationPolicy.test.ts`

Expected: FAIL，预算评估模块不存在。

- [ ] **Step 3: 实现预算筛选、进度和严重级别**

```ts
const getSeverity = (percent: number, thresholds: BudgetThresholds): BudgetSeverity => {
  if (percent >= 100) return 'over';
  if (percent >= thresholds.criticalPercent) return 'critical';
  if (percent >= thresholds.warningPercent) return 'warning';
  return 'normal';
};

const isSliceInPolicy = (
  session: UsageSession,
  slice: UsageSlice,
  policy: BudgetPolicy,
  startTime: number,
  endTime: number
): boolean => {
  const occurredAt = new Date(slice.occurredAt).getTime();
  const matchesTime = !Number.isNaN(occurredAt) && occurredAt >= startTime && occurredAt <= endTime;
  const matchesProject =
    policy.scope === 'global' ||
    normalizeProjectPath(session.projectPath) === normalizeProjectPath(policy.projectPath ?? '');
  return matchesTime && matchesProject;
};
```

`evaluateBudgets` 对每条策略只遍历匹配切片，分别构造可选 `token` 与 `cost` 进度；费用存在未计价 Token 时设置 `incomplete: true`，但已知费用达到阈值仍生成预警。

- [ ] **Step 4: 实现固定规模通知回执**

```ts
export const getNotificationReceiptKey = (alert: BudgetAlert): string =>
  `${alert.policyId}:${alert.period}:${alert.metric}:${alert.thresholdPercent}`;

export const selectPendingNotifications = (
  alerts: BudgetAlert[],
  receipts: NotificationReceipt[]
): BudgetAlert[] => {
  const lastPeriodByKey = new Map(receipts.map((receipt) => [receipt.key, receipt.periodStart]));
  return alerts.filter(
    (alert) => lastPeriodByKey.get(getNotificationReceiptKey(alert)) !== alert.periodStart
  );
};

export const recordNotifications = (
  receipts: NotificationReceipt[],
  alerts: BudgetAlert[],
  activePolicyIds: string[]
): NotificationReceipt[] => {
  const next = new Map(receipts.map((receipt) => [receipt.key, receipt]));
  alerts.forEach((alert) => {
    const key = getNotificationReceiptKey(alert);
    next.set(key, { key, policyId: alert.policyId, periodStart: alert.periodStart });
  });
  const activePolicyIdSet = new Set(activePolicyIds);
  return [...next.values()].filter((receipt) => activePolicyIdSet.has(receipt.policyId));
};
```

- [ ] **Step 5: 运行预算与通知测试**

Run: `npm test -- tests/budgetEvaluation.test.ts tests/notificationPolicy.test.ts`

Expected: PASS，覆盖 80%、100%、超限、项目匹配、自然周期和新周期重新通知。

- [ ] **Step 6: 提交任务**

```bash
git add src/shared/budgetTypes.ts src/shared/budgetEvaluation.ts src/shared/notificationPolicy.ts tests/budgetEvaluation.test.ts tests/notificationPolicy.test.ts
git commit -m "feat: evaluate budget thresholds"
```

### Task 5: 实现版本化 JSON 预算存储

**Files:**
- Create: `src/main/budgetStore.ts`
- Modify: `src/shared/budgetValidation.ts`
- Test: `tests/budgetStore.test.ts`

**Interfaces:**
- Produces: `createBudgetStore(configPath, now)`。
- Produces: `load(): Promise<BudgetConfigLoadResult>`、`save(config): Promise<void>`。
- Guarantees: schema version 1、原子临时文件替换、损坏备份、未来版本拒绝覆盖。

- [ ] **Step 1: 编写默认配置、损坏恢复和未来版本失败测试**

```ts
it('returns defaults when the config file does not exist', async () => {
  const store = createBudgetStore(configPath, () => new Date('2026-07-20T00:00:00.000Z'));
  await expect(store.load()).resolves.toEqual({ config: DEFAULT_BUDGET_CONFIG, warnings: [] });
});

it('backs up malformed JSON before returning defaults', async () => {
  await fs.writeFile(configPath, '{broken', 'utf8');
  const result = await createBudgetStore(configPath, fixedNow).load();
  const files = await fs.readdir(testDirectory);

  expect(result.config).toEqual(DEFAULT_BUDGET_CONFIG);
  expect(result.warnings[0]).toContain('Budget configuration was reset');
  expect(files).toContain('budget-config.json.corrupt-2026-07-20T00-00-00-000Z');
});

it('refuses a future schema without overwriting it', async () => {
  const future = '{"schemaVersion":2}';
  await fs.writeFile(configPath, future, 'utf8');
  await expect(createBudgetStore(configPath, fixedNow).load()).rejects.toThrow('newer schema');
  await expect(fs.readFile(configPath, 'utf8')).resolves.toBe(future);
});
```

- [ ] **Step 2: 运行存储测试并确认失败**

Run: `npm test -- tests/budgetStore.test.ts`

Expected: FAIL，存储模块不存在。

- [ ] **Step 3: 实现配置解码和默认值**

```ts
export const BUDGET_CONFIG_SCHEMA_VERSION = 1;
export const DEFAULT_BUDGET_CONFIG: PersistedBudgetConfig = {
  schemaVersion: BUDGET_CONFIG_SCHEMA_VERSION,
  policies: [],
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  pricingOverrides: [],
  notificationReceipts: [],
};

const decodeBudgetConfig = (raw: unknown): PersistedBudgetConfig => {
  if (!isRecord(raw) || typeof raw.schemaVersion !== 'number') {
    throw new TypeError('Budget configuration has an invalid schema.');
  }
  if (raw.schemaVersion > BUDGET_CONFIG_SCHEMA_VERSION) {
    throw new RangeError('Budget configuration uses a newer schema.');
  }
  return validatePersistedBudgetConfig(raw);
};
```

- [ ] **Step 4: 实现临时文件写入和损坏备份**

```ts
const save = async (config: PersistedBudgetConfig): Promise<void> => {
  const tempPath = `${configPath}.tmp`;
  await fs.mkdir(dirname(configPath), { recursive: true });
  await fs.writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, configPath);
};

const backupCorruptConfig = async (): Promise<string> => {
  const timestamp = now().toISOString().replace(/[.:]/g, '-');
  const backupPath = `${configPath}.corrupt-${timestamp}`;
  await fs.rename(configPath, backupPath);
  return backupPath;
};
```

- [ ] **Step 5: 运行存储测试和类型检查**

Run: `npm test -- tests/budgetStore.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交任务**

```bash
git add src/main/budgetStore.ts src/shared/budgetValidation.ts tests/budgetStore.test.ts
git commit -m "feat: persist budget configuration"
```

### Task 6: 为会话扫描增加文件指纹缓存

**Files:**
- Modify: `src/main/usageScanner.ts`
- Modify: `tests/usageScanner.test.ts`

**Interfaces:**
- Produces: `createUsageScanner(dependencies?)` with `scan(options)`。
- Preserves: `scanCodexUsage(options)` 作为默认单例兼容入口。
- Cache key: absolute path + file size + modification time milliseconds.

`ScanOptions` 扩展为：

```ts
export interface ScanOptions {
  sessionsDir?: string;
  sessionIndexPath?: string;
}
```

- [ ] **Step 1: 编写未变化复用、修改重读和删除清理失败测试**

```ts
it('reuses unchanged parsed sessions and removes deleted files', async () => {
  let sessionReadCount = 0;
  const scanner = createUsageScanner({
    readFile: async (path, encoding) => {
      if (String(path).endsWith('.jsonl')) sessionReadCount += 1;
      return fs.readFile(path, encoding);
    },
  });

  await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
  await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
  expect(sessionReadCount).toBe(1);

  await fs.appendFile(sessionFile, '\n');
  await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
  expect(sessionReadCount).toBe(2);

  await fs.unlink(sessionFile);
  const result = await scanner.scan({ sessionsDir: testDirectory, sessionIndexPath: missingIndexPath });
  expect(result.summary.sessions).toEqual([]);
});
```

- [ ] **Step 2: 运行扫描测试并确认重复读取断言失败**

Run: `npm test -- tests/usageScanner.test.ts`

Expected: FAIL，第二次扫描仍读取会话文件。

- [ ] **Step 3: 实现闭包缓存和可注入文件依赖**

```ts
interface CachedSessionFile {
  fingerprint: string;
  session: UsageSession;
}

export const createUsageScanner = (
  dependencies: Partial<UsageScannerDependencies> = {}
): UsageScanner => {
  const readFile = dependencies.readFile ?? fs.readFile;
  const stat = dependencies.stat ?? fs.stat;
  const cache = new Map<string, CachedSessionFile>();

  const scan = async (options: ScanOptions = {}): Promise<UsageScanResult> => {
    const sessionsDir = options.sessionsDir ?? getDefaultCodexSessionsDir();
    const sessionIndexPath = options.sessionIndexPath ?? getDefaultSessionIndexPath();
    const [discovery, threadNameResult] = await Promise.all([
      findJsonlFiles(sessionsDir),
      loadThreadNames(sessionIndexPath),
    ]);
    const discoveredPaths = new Set(discovery.files);
    [...cache.keys()].filter((path) => !discoveredPaths.has(path)).forEach((path) => cache.delete(path));

    const fileResults = await mapWithConcurrency(
      discovery.files,
      MAX_CONCURRENT_FILE_READS,
      async (file): Promise<SessionFileResult> => {
        try {
          const fileStat = await stat(file);
          const fingerprint = `${fileStat.size}:${fileStat.mtimeMs}`;
          const cached = cache.get(file);
          const parsedSession = cached?.fingerprint === fingerprint
            ? cached.session
            : parseSessionJsonl(file, await readFile(file, 'utf8'));
          cache.set(file, { fingerprint, session: parsedSession });
          const session = {
            ...parsedSession,
            threadName: threadNameResult.names.get(getSessionId(file)),
          };
          return { session, warnings: session.warnings };
        } catch (error) {
          return {
            warnings: [{ sourceFile: file, message: `Unable to read session file: ${errorMessage(error)}` }],
          };
        }
      }
    );
    const sessions = fileResults.flatMap(({ session }) => (session ? [session] : []));

    return {
      sessionsDir,
      scannedAt: new Date().toISOString(),
      summary: buildUsageSummary(sessions),
      warnings: [
        ...discovery.warnings,
        ...threadNameResult.warnings,
        ...fileResults.flatMap((result) => result.warnings),
      ],
    };
  };

  return { scan };
};
```

加载会话名称索引后，对缓存会话复制最新 `threadName`，不要因为名称变化重读 JSONL。

- [ ] **Step 4: 运行扫描器和解析器回归测试**

Run: `npm test -- tests/usageScanner.test.ts tests/sessionParser.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交任务**

```bash
git add src/main/usageScanner.ts tests/usageScanner.test.ts
git commit -m "perf: cache parsed Codex sessions"
```

### Task 7: 实现单飞定时刷新与聚焦节流

**Files:**
- Create: `src/main/usageMonitor.ts`
- Test: `tests/usageMonitor.test.ts`

**Interfaces:**
- Produces: `createUsageMonitor({ scan, onUpdate, onError, now, setIntervalFn, clearIntervalFn })`。
- Produces: `start()`、`stop()`、`refresh()`、`refreshOnFocus()`。
- Constants: `USAGE_SCAN_INTERVAL_MS = 60_000`、`FOCUS_REFRESH_MIN_INTERVAL_MS = 10_000`。

- [ ] **Step 1: 编写单飞和聚焦节流失败测试**

```ts
it('shares an in-flight scan and throttles focus refreshes', async () => {
  const pending = deferred<UsageScanResult>();
  const scan = vi.fn(() => pending.promise);
  let nowMs = 1_000;
  const monitor = createUsageMonitor({
    scan,
    onUpdate: vi.fn(),
    onError: vi.fn(),
    now: () => nowMs,
    setIntervalFn: vi.fn(() => 1),
    clearIntervalFn: vi.fn(),
  });

  const first = monitor.refresh();
  const second = monitor.refresh();
  expect(scan).toHaveBeenCalledTimes(1);
  pending.resolve(EMPTY_SCAN_RESULT);
  await Promise.all([first, second]);

  nowMs += 1_000;
  await monitor.refreshOnFocus();
  expect(scan).toHaveBeenCalledTimes(1);
});

const EMPTY_SCAN_RESULT: UsageScanResult = {
  sessionsDir: 'C:\\codex\\sessions',
  scannedAt: '2026-07-20T00:00:00.000Z',
  summary: buildUsageSummary([]),
  warnings: [],
};

const deferred = <Value>(): {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
} => {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
};
```

- [ ] **Step 2: 运行监控测试并确认失败**

Run: `npm test -- tests/usageMonitor.test.ts`

Expected: FAIL，监控模块不存在。

- [ ] **Step 3: 实现单飞 Promise、定时器和焦点刷新**

```ts
export const USAGE_SCAN_INTERVAL_MS = 60_000;
export const FOCUS_REFRESH_MIN_INTERVAL_MS = 10_000;

export const createUsageMonitor = (dependencies: UsageMonitorDependencies): UsageMonitor => {
  let activeRefresh: Promise<UsageScanResult> | undefined;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  let lastCompletedAt = Number.NEGATIVE_INFINITY;

  const refresh = (): Promise<UsageScanResult> => {
    if (activeRefresh) return activeRefresh;
    activeRefresh = dependencies
      .scan()
      .then((result) => {
        lastCompletedAt = dependencies.now();
        dependencies.onUpdate(result);
        return result;
      })
      .catch((error: unknown) => {
        dependencies.onError(error);
        throw error;
      })
      .finally(() => {
        activeRefresh = undefined;
      });
    return activeRefresh;
  };

  const refreshOnFocus = (): Promise<UsageScanResult | undefined> =>
    dependencies.now() - lastCompletedAt >= FOCUS_REFRESH_MIN_INTERVAL_MS
      ? refresh()
      : Promise.resolve(undefined);

  const start = (): void => {
    void refresh();
    intervalId = dependencies.setIntervalFn(() => void refresh(), USAGE_SCAN_INTERVAL_MS);
  };

  const stop = (): void => {
    if (intervalId !== undefined) dependencies.clearIntervalFn(intervalId);
  };

  return { refresh, refreshOnFocus, start, stop };
};
```

- [ ] **Step 4: 运行监控测试**

Run: `npm test -- tests/usageMonitor.test.ts`

Expected: PASS，包含定时器启动和停止断言。

- [ ] **Step 5: 提交任务**

```bash
git add src/main/usageMonitor.ts tests/usageMonitor.test.ts
git commit -m "feat: schedule usage refreshes"
```

### Task 8: 组装预算运行时、系统通知和 IPC

**Files:**
- Create: `src/main/budgetRuntime.ts`
- Create: `src/main/notificationService.ts`
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/global.d.ts`
- Test: `tests/budgetRuntime.test.ts`

**Interfaces:**
- Consumes: store、scanner、pricing、evaluator、notification service。
- Produces: `BudgetRuntime` CRUD、`refresh()`、`subscribe()`、`navigate` 事件。
- Produces renderer API: `scan`、`onUsageUpdated`、`budgets.getSnapshot/savePolicy/deletePolicy/updateThresholds/savePricingOverride/resetPricingOverride/onUpdated/onNavigate`。

- [ ] **Step 1: 编写保存即评估、通知去重和扫描失败保留旧快照测试**

```ts
it('persists a policy, reevaluates, and notifies only once per threshold', async () => {
  const notify = vi.fn();
  const runtime = createBudgetRuntime(makeRuntimeDependencies({ notify }));
  await runtime.initialize();
  await runtime.savePolicy({ scope: 'global', period: 'day', tokenLimit: 100 });
  await runtime.refresh();
  await runtime.refresh();

  expect(notify).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot().statuses[0].token?.severity).toBe('over');
});

it('keeps the last successful snapshot stale after a scan error', async () => {
  const runtime = createBudgetRuntime(makeRuntimeDependencies());
  await runtime.initialize();
  await runtime.refresh();
  scanner.scan.mockRejectedValueOnce(new Error('disk unavailable'));
  await expect(runtime.refresh()).rejects.toThrow('disk unavailable');
  expect(runtime.getSnapshot().dataState).toBe('stale');
});
```

- [ ] **Step 2: 运行运行时测试并确认失败**

Run: `npm test -- tests/budgetRuntime.test.ts`

Expected: FAIL，运行时模块不存在。

- [ ] **Step 3: 实现运行时 CRUD 与快照发布**

```ts
export interface BudgetRuntime {
  initialize: () => Promise<void>;
  refresh: () => Promise<UsageScanResult>;
  getSnapshot: () => BudgetSnapshot;
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  subscribe: (listener: RuntimeListener) => () => void;
  start: () => void;
  stop: () => void;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
}
```

每个修改方法执行相同事务顺序：运行时校验输入、生成不可变新配置、写入 JSON、重新评估现有用量、处理新通知、发布快照。重复业务键返回带 `field: 'businessKey'` 的结构化错误。保存价格覆盖时由主进程补充 `updatedAt: now().toISOString()`，渲染进程不能自行指定持久化时间。

- [ ] **Step 4: 实现 Electron 系统通知适配器**

```ts
export const createNotificationService = (
  onNavigate: (policyId: string) => void
): NotificationService => ({
  notify: (alert) => {
    if (!Notification.isSupported()) return false;
    const notification = new Notification({ title: 'Token budget alert', body: alert.message });
    notification.on('click', () => onNavigate(alert.policyId));
    notification.show();
    return true;
  },
});
```

通知点击时 `main.ts` 恢复并聚焦窗口，再通过运行时导航事件广播预算 ID。

- [ ] **Step 5: 定义 IPC 常量和 Preload API**

```ts
export const BUDGET_GET_SNAPSHOT_CHANNEL = 'budget:get-snapshot';
export const BUDGET_SAVE_POLICY_CHANNEL = 'budget:save-policy';
export const BUDGET_DELETE_POLICY_CHANNEL = 'budget:delete-policy';
export const BUDGET_UPDATE_THRESHOLDS_CHANNEL = 'budget:update-thresholds';
export const BUDGET_SAVE_PRICING_CHANNEL = 'budget:save-pricing';
export const BUDGET_RESET_PRICING_CHANNEL = 'budget:reset-pricing';
export const BUDGET_UPDATED_CHANNEL = 'budget:updated';
export const BUDGET_NAVIGATE_CHANNEL = 'budget:navigate';
export const USAGE_UPDATED_CHANNEL = 'usage:updated';
export const OPEN_EXTERNAL_CHANNEL = 'app:open-external';
```

Preload 订阅必须封装监听器并返回取消函数：

```ts
const subscribe = <Payload>(channel: string, listener: (payload: Payload) => void): (() => void) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: Payload): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
```

渲染层声明的桥接接口使用同一组共享输入和返回类型：

```ts
interface BudgetApi {
  getSnapshot: () => Promise<BudgetSnapshot>;
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  onUpdated: (listener: (snapshot: BudgetSnapshot) => void) => () => void;
  onNavigate: (listener: (policyId: string) => void) => () => void;
}

interface CodexUsageApi {
  scan: () => Promise<UsageScanResult>;
  onUsageUpdated: (listener: (result: UsageScanResult) => void) => () => void;
  openExternal: (url: string) => Promise<void>;
  budgets: BudgetApi;
}
```

`OPEN_EXTERNAL_CHANNEL` 的主进程处理器使用 `new URL(url)` 校验协议为 `https:` 且主机为 `developers.openai.com`，通过后调用 `shell.openExternal(url)`；其他 URL 返回结构化错误。

- [ ] **Step 6: 在主进程生命周期中启动和停止运行时**

`app.whenReady` 中使用 `join(app.getPath('userData'), 'budget-config.json')` 创建 store 和 runtime；先注册 IPC，再创建窗口并 `runtime.start()`。窗口 `focus` 调用 `runtime.refreshOnFocus()`，应用退出前调用 `runtime.stop()`。

- [ ] **Step 7: 运行运行时、IPC 相关测试和类型检查**

Run: `npm test -- tests/budgetRuntime.test.ts tests/notificationPolicy.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS，主进程与 Web 类型工程均通过。

- [ ] **Step 8: 提交任务**

```bash
git add src/main/budgetRuntime.ts src/main/notificationService.ts src/shared/ipcChannels.ts src/main/ipc.ts src/main/main.ts src/preload/preload.ts src/renderer/global.d.ts tests/budgetRuntime.test.ts
git commit -m "feat: connect budget runtime to Electron"
```

### Task 9: 接入 Budgets 导航和渲染快照状态

**Files:**
- Create: `src/renderer/hooks/useBudgetSnapshot.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/components/Toolbar.tsx`
- Modify: `tests/sidebar.test.tsx`
- Modify: `tests/toolbar.test.tsx`
- Modify: `tests/appContent.test.tsx`

**Interfaces:**
- Produces: `ViewKey` includes `'budgets'`。
- Produces: `useBudgetSnapshot()` returns snapshot、loading、error and typed actions。
- Guarantees: Budgets 在无会话、扫描失败或滚动周期为空时仍可打开配置。

- [ ] **Step 1: 编写导航徽标、工具栏和空数据预算页失败测试**

```tsx
it('shows the budget alert badge only on Budgets', () => {
  const markup = renderToStaticMarkup(
    <Sidebar activeView="overview" warningCount={0} budgetAlertCount={2} onChange={vi.fn()} />
  );
  expect(markup).toContain('Budgets');
  expect(markup).toContain('<em class="nav-badge">2</em>');
});

it('hides rolling period controls on Budgets', () => {
  const markup = renderToStaticMarkup(
    <Toolbar activeView="budgets" loading={false} onRefresh={vi.fn()} period="month" onPeriodChange={vi.fn()} />
  );
  expect(markup).not.toContain('Date range');
});
```

- [ ] **Step 2: 运行渲染测试并确认失败**

Run: `npm test -- tests/sidebar.test.tsx tests/toolbar.test.tsx tests/appContent.test.tsx`

Expected: FAIL，`budgets` 不是有效 ViewKey。

- [ ] **Step 3: 增加侧栏入口和命名条件函数**

```tsx
export type ViewKey = 'overview' | 'budgets' | 'sessions' | 'tools' | 'performance' | 'wrapped';

const shouldShowBudgetBadge = (view: ViewKey, count: number): boolean =>
  view === 'budgets' && count > 0;

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'budgets', label: 'Budgets', icon: WalletCards },
  { key: 'sessions', label: 'Sessions', icon: MessageSquareText },
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'performance', label: 'Performance', icon: Gauge },
  { key: 'wrapped', label: 'Wrapped', icon: Boxes },
] satisfies Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }>;
```

- [ ] **Step 4: 实现预算快照 Hook 和主进程推送订阅**

```ts
export const useBudgetSnapshot = (): UseBudgetSnapshotResult => {
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.codexUsage.budgets.getSnapshot().then((next) => {
      if (active) setSnapshot(next);
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    const unsubscribe = window.codexUsage.budgets.onUpdated(setSnapshot);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { snapshot, error, loading: !snapshot && !error, actions: createBudgetActions(setSnapshot) };
};
```

- [ ] **Step 5: 让 AppContent 优先解析预算页状态**

当 `activeView === 'budgets'` 时，不进入现有用量 `AppContentModel` 的 error/loading/empty 分支，而是使用 `BudgetContentModel`：`loading | error | ready`。系统通知导航事件设置 `activeView` 为 `budgets` 并保存一次性的 `focusedPolicyId`。

- [ ] **Step 6: 运行导航和内容测试**

Run: `npm test -- tests/sidebar.test.tsx tests/toolbar.test.tsx tests/appContent.test.tsx tests/appContentModel.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交任务**

```bash
git add src/renderer/hooks/useBudgetSnapshot.ts src/renderer/App.tsx src/renderer/components/AppContent.tsx src/renderer/components/Sidebar.tsx src/renderer/components/Toolbar.tsx tests/sidebar.test.tsx tests/toolbar.test.tsx tests/appContent.test.tsx
git commit -m "feat: add budgets application route"
```

### Task 10: 构建预算概览、状态列表和应用内预警

**Files:**
- Create: `src/renderer/utils/budgetViewModel.ts`
- Create: `src/renderer/components/BudgetsView.tsx`
- Create: `src/renderer/components/BudgetSummary.tsx`
- Create: `src/renderer/components/BudgetList.tsx`
- Create: `src/renderer/components/BudgetAlertBanner.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/renderer/utils/formatters.ts`
- Modify: `src/renderer/styles.css`
- Test: `tests/budgetViewModel.test.ts`
- Test: `tests/budgetsView.test.tsx`
- Modify: `tests/formatters.test.tsx`

**Interfaces:**
- Produces: `buildBudgetViewModel(snapshot, filters)`。
- Produces: `formatUsd(value)`、`formatPercent(value)`。
- Produces: read-only Budget overview with summary, filters, grouped rows and alerts.

- [ ] **Step 1: 编写摘要、分组和不完整费用失败测试**

```ts
it('groups global and project rows and counts actionable states', () => {
  const model = buildBudgetViewModel(SNAPSHOT, { scope: 'all', period: 'all' });
  expect(model.summary).toEqual({ warningCount: 1, overCount: 1, unpricedModelCount: 1 });
  expect(model.groups.map((group) => group.key)).toEqual(['global', 'project']);
});
```

```tsx
it('renders actual percentages above 100 and incomplete cost state', () => {
  const markup = renderToStaticMarkup(<BudgetsView snapshot={SNAPSHOT} actions={ACTIONS} />);
  expect(markup).toContain('112%');
  expect(markup).toContain('Pricing incomplete');
  expect(markup).toContain('Unpriced models');
});
```

- [ ] **Step 2: 运行预算概览测试并确认失败**

Run: `npm test -- tests/budgetViewModel.test.ts tests/budgetsView.test.tsx`

Expected: FAIL，组件和 view model 不存在。

- [ ] **Step 3: 实现纯视图模型和格式化函数**

```ts
export const buildBudgetViewModel = (
  snapshot: BudgetSnapshot,
  filters: BudgetFilters
): BudgetViewModel => {
  const filtered = snapshot.statuses.filter((status) => {
    const matchesScope = filters.scope === 'all' || status.policy.scope === filters.scope;
    const matchesPeriod = filters.period === 'all' || status.policy.period === filters.period;
    return matchesScope && matchesPeriod;
  });

  return {
    summary: snapshot.summary,
    alerts: snapshot.alerts,
    dataState: snapshot.dataState,
    groups: groupBudgetStatuses(filtered),
  };
};

export const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);

export const formatPercent = (value: number): string => `${Math.round(value)}%`;
```

- [ ] **Step 4: 构建页面、摘要、列表和预警组件**

`BudgetsView` 在本任务先提供完整的 Budget overview：页面标题、摘要、范围筛选、周期筛选和预算列表。页面级 `Budget overview` / `Model pricing` 标签在 Task 12 与价格页面一起加入，避免中间提交出现不可用标签。`BudgetList` 每行展示 Scope、Period、Token、Estimated cost、Status、Actions；进度条宽度使用 `Math.min(percent, 100)`，文字使用真实 percent。

应用内预警允许关闭。`dismissedAlertIds` 是由用户点击直接改变且具有独立生命周期的 `Set<string>` state；渲染时从 `snapshot.alerts` 过滤，快照更新后清理已经不存在的 ID。关闭应用内横幅不清除系统通知回执，也不改变侧栏的当前风险数量。

互斥费用状态使用：

```ts
type CostCellModel =
  | { kind: 'unset' }
  | { kind: 'complete'; progress: BudgetProgress }
  | { kind: 'incomplete'; progress: BudgetProgress; unpricedTokens: number };
```

- [ ] **Step 5: 添加 Lumo 风格和响应式约束**

在 `styles.css` 增加 `.budgets-page`、`.budget-summary-grid`、`.budget-table`、`.budget-progress`、`.budget-alert` 样式。使用现有白底、灰边框和 mint/amber/red 状态色；卡片圆角 `8px`，表格设置稳定 grid tracks，在 760px 以下切换为纵向行布局，文字不得溢出操作按钮。

- [ ] **Step 6: 运行预算页面与格式化测试**

Run: `npm test -- tests/budgetViewModel.test.ts tests/budgetsView.test.tsx tests/formatters.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交任务**

```bash
git add src/renderer/utils/budgetViewModel.ts src/renderer/components/BudgetsView.tsx src/renderer/components/BudgetSummary.tsx src/renderer/components/BudgetList.tsx src/renderer/components/BudgetAlertBanner.tsx src/renderer/components/AppContent.tsx src/renderer/utils/formatters.ts src/renderer/styles.css tests/budgetViewModel.test.ts tests/budgetsView.test.tsx tests/formatters.test.tsx
git commit -m "feat: render budget status center"
```

### Task 11: 实现预算与阈值编辑抽屉

**Files:**
- Create: `src/renderer/utils/budgetForm.ts`
- Create: `src/renderer/components/BudgetDrawer.tsx`
- Create: `src/renderer/components/ConfirmDialog.tsx`
- Modify: `src/renderer/components/BudgetsView.tsx`
- Modify: `src/renderer/components/BudgetList.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/budgetForm.test.ts`
- Test: `tests/budgetDrawer.test.tsx`

**Interfaces:**
- Produces: `createBudgetFormState(policy?)`、`budgetFormReducer(state, action)`、`toBudgetPolicyInput(state)`。
- Consumes: Task 9 `BudgetActions`。
- Produces: policy drawer, threshold drawer, duplicate error display, delete confirmation.

- [ ] **Step 1: 编写独立限额、项目联动和转换失败测试**

```ts
it('creates a project cost-only policy input', () => {
  const state = budgetFormReducer(createBudgetFormState(), { type: 'scope-changed', scope: 'project' });
  const withProject = budgetFormReducer(state, { type: 'project-changed', projectPath: 'C:\\repo' });
  const costEnabled = budgetFormReducer(withProject, { type: 'cost-enabled', enabled: true });
  const complete = budgetFormReducer(costEnabled, { type: 'cost-limit-changed', value: '25.50' });

  expect(toBudgetPolicyInput(complete)).toEqual({
    scope: 'project',
    projectPath: 'C:\\repo',
    period: 'month',
    costLimitUsd: 25.5,
  });
});
```

- [ ] **Step 2: 运行表单测试并确认失败**

Run: `npm test -- tests/budgetForm.test.ts tests/budgetDrawer.test.tsx`

Expected: FAIL，表单 reducer 和抽屉不存在。

- [ ] **Step 3: 实现预算表单 reducer**

```ts
export type BudgetFormAction =
  | { type: 'scope-changed'; scope: BudgetScope }
  | { type: 'project-changed'; projectPath: string }
  | { type: 'period-changed'; period: BudgetPeriod }
  | { type: 'token-enabled'; enabled: boolean }
  | { type: 'token-limit-changed'; value: string }
  | { type: 'cost-enabled'; enabled: boolean }
  | { type: 'cost-limit-changed'; value: string }
  | { type: 'save-failed'; issues: ValidationIssue[] };

export const toBudgetPolicyInput = (state: BudgetFormState): BudgetPolicyInput => ({
  id: state.id,
  scope: state.scope,
  projectPath: state.scope === 'project' ? state.projectPath.trim() : undefined,
  period: state.period,
  tokenLimit: state.tokenEnabled ? Number(state.tokenLimit) : undefined,
  costLimitUsd: state.costEnabled ? Number(state.costLimitUsd) : undefined,
});
```

- [ ] **Step 4: 构建右侧抽屉和阈值模式**

`BudgetDrawer` 使用 `mode: 'policy' | 'thresholds'` 明确互斥内容。Policy 模式使用范围 segmented control、项目 select、周期 segmented control、两个开关和数字输入；Thresholds 模式编辑 warning/critical 百分比。保存期间禁用按钮，主进程返回的结构化错误映射到字段附近。

- [ ] **Step 5: 实现删除二次确认**

`ConfirmDialog` 使用语义化 `role="dialog"` 和 `aria-modal="true"`，提供 Trash2 图标的 `Delete` 命令与 `Cancel`。确认后调用 `actions.deletePolicy(id)`；取消不修改快照。

- [ ] **Step 6: 运行表单、抽屉和页面回归测试**

Run: `npm test -- tests/budgetForm.test.ts tests/budgetDrawer.test.tsx tests/budgetsView.test.tsx`

Expected: PASS，覆盖 cost-only、token-only、重复业务键、阈值校验和删除确认静态状态。

- [ ] **Step 7: 提交任务**

```bash
git add src/renderer/utils/budgetForm.ts src/renderer/components/BudgetDrawer.tsx src/renderer/components/ConfirmDialog.tsx src/renderer/components/BudgetsView.tsx src/renderer/components/BudgetList.tsx src/renderer/styles.css tests/budgetForm.test.ts tests/budgetDrawer.test.tsx
git commit -m "feat: edit budget policies in drawer"
```

### Task 12: 实现模型价格维护与未知模型补价

**Files:**
- Create: `src/renderer/components/ModelPricingView.tsx`
- Create: `src/renderer/utils/pricingForm.ts`
- Modify: `src/renderer/components/BudgetsView.tsx`
- Modify: `src/renderer/components/BudgetAlertBanner.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/modelPricingView.test.tsx`
- Test: `tests/pricingForm.test.ts`

**Interfaces:**
- Produces: model pricing table, override drawer, reset action and unknown model deep link.
- Consumes: `BudgetActions.savePricingOverride`、`resetPricingOverride`。

- [ ] **Step 1: 编写价格覆盖转换和状态显示失败测试**

```ts
it('converts the pricing form into a complete override', () => {
  expect(toPricingOverride({
    modelId: 'future-codex',
    aliases: '',
    inputUsdPerMillion: '2.50',
    cachedInputUsdPerMillion: '0.25',
    outputUsdPerMillion: '15.00',
  })).toEqual({
    modelId: 'future-codex',
    aliases: [],
    inputUsdPerMillion: 2.5,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 15,
  });
});
```

```tsx
it('marks overridden prices and exposes restore default', () => {
  const markup = renderToStaticMarkup(<ModelPricingView pricing={PRICING} unpricedModels={[]} actions={ACTIONS} />);
  expect(markup).toContain('Custom');
  expect(markup).toContain('Restore default');
});
```

- [ ] **Step 2: 运行价格 UI 测试并确认失败**

Run: `npm test -- tests/pricingForm.test.ts tests/modelPricingView.test.tsx`

Expected: FAIL，价格表单和组件不存在。

- [ ] **Step 3: 实现价格表单纯函数和校验映射**

```ts
export const toPricingOverride = (state: PricingFormState): ModelPricingOverrideInput => ({
  modelId: state.modelId.trim(),
  aliases: state.aliases.split(',').map((alias) => alias.trim()).filter(Boolean),
  inputUsdPerMillion: Number(state.inputUsdPerMillion),
  cachedInputUsdPerMillion: Number(state.cachedInputUsdPerMillion),
  outputUsdPerMillion: Number(state.outputUsdPerMillion),
});
```

输入允许 0，禁止负数、空模型 ID 和非有限数字。编辑内置模型时锁定 model ID；未知模型补价时预填检测到的 ID。

- [ ] **Step 4: 构建 Model pricing 标签页**

价格表稳定展示 Model、Input、Cached input、Output、Effective、Source、Actions。内置项显示 `Built-in`，覆盖项显示 `Custom`。来源链接使用外部打开按钮和 `ExternalLink` 图标，并调用 `window.codexUsage.openExternal(sourceUrl)`；用户新增模型没有来源链接时不渲染该按钮。

- [ ] **Step 5: 从未计价预警跳转并预填模型**

`BudgetAlertBanner` 的 `Add price` 操作切换 `BudgetsView` 到 `Model pricing`，打开价格抽屉并预填对应 model ID。一次性跳转目标消费后清除，不能复制为第二份 React state。

- [ ] **Step 6: 运行价格 UI 与预算页面测试**

Run: `npm test -- tests/pricingForm.test.ts tests/modelPricingView.test.tsx tests/budgetsView.test.tsx`

Expected: PASS。

- [ ] **Step 7: 提交任务**

```bash
git add src/renderer/components/ModelPricingView.tsx src/renderer/utils/pricingForm.ts src/renderer/components/BudgetsView.tsx src/renderer/components/BudgetAlertBanner.tsx src/renderer/styles.css tests/modelPricingView.test.tsx tests/pricingForm.test.ts
git commit -m "feat: manage model pricing overrides"
```

### Task 13: 统一 Overview 与 Performance 的模型费用口径

**Files:**
- Modify: `src/shared/usageMetrics.ts`
- Modify: `src/shared/pricing.ts`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/renderer/components/PerformanceView.tsx`
- Modify: `src/renderer/components/SettingsView.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `tests/usageMetrics.test.ts`
- Modify: `tests/overviewTrend.test.tsx`
- Modify: `tests/performanceView.test.tsx`
- Modify: `tests/appContent.test.tsx`

**Interfaces:**
- Consumes: Task 3 effective `ModelPricingEntry[]` and `buildDailyCostEstimates`。
- Removes: flat `ESTIMATED_COST_PER_MILLION_TOKENS` and `estimateTokenCost(totalTokens)`。
- Guarantees: Overview、Cost Trends、Performance 和 Budgets 使用同一模型计价口径。

- [ ] **Step 1: 将现有固定费率测试改成模型费用失败测试**

```tsx
it('renders model-priced total cost and incomplete pricing state', () => {
  const markup = renderToStaticMarkup(
    <Overview summary={SUMMARY_WITH_SLICES} pricing={PRICING} />
  );

  expect(markup).toContain('$0.0003');
  expect(markup).toContain('Pricing incomplete');
});
```

```ts
it('builds daily costs from slice timestamps instead of session start time', () => {
  const costs = buildDailyCostEstimates([SESSION_CROSSING_MIDNIGHT], PRICING);
  expect(costs.map(({ date }) => date)).toEqual(['2026-07-19', '2026-07-20']);
});
```

在测试文件中用完整 `UsageSession` 夹具定义 `SUMMARY_WITH_SLICES` 和 `SESSION_CROSSING_MIDNIGHT`，并使用 Task 3 的一条 `gpt-test` 价格定义 `PRICING`；两个切片分别位于本地午夜两侧。

- [ ] **Step 2: 运行费用视图测试并确认旧固定费率行为失败**

Run: `npm test -- tests/usageMetrics.test.ts tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/appContent.test.tsx`

Expected: FAIL，组件尚未接收模型价格，旧 `estimateTokenCost` 仍被调用。

- [ ] **Step 3: 删除固定费率并接入有效价格表**

`usageMetrics.ts` 只保留缓存命中率。`Overview` 和 `PerformanceView` Props 增加 `pricing: ModelPricingEntry[]`，使用以下共享用量入口：

```ts
export const getSummaryCostEstimate = (
  summary: UsageSummary,
  pricing: ModelPricingEntry[]
): CostEstimate =>
  calculateEstimatedCost(summary.sessions.flatMap(getSessionUsageSlices), pricing);
```

`AppContent` 从预算快照取得合并后的有效价格并传给两个页面；价格快照未加载或加载失败时传空数组，使费用明确显示为不完整，而不是回退固定费率。

- [ ] **Step 4: 修改 Cost Trends 使用每日模型费用**

```ts
export const buildTrendPoints = (
  days: UsageDay[],
  max: number,
  dailyCosts: Map<string, CostEstimate>
): TrendPoint[] =>
  days.map((day, index) => ({
    day,
    cost: dailyCosts.get(day.date)?.pricedCostUsd ?? 0,
    pricingIncomplete: (dailyCosts.get(day.date)?.unpricedTokens ?? 0) > 0,
    x: toChartX(index, days.length),
    y: toChartY(day.totalTokens, max),
  }));
```

Tooltip 和总费用卡显示模型计价结果；存在未计价 Token 时增加 `Pricing incomplete` 状态，但仍展示已知费用。

- [ ] **Step 5: 更新 Settings 费用说明**

将固定 Token 总量派生说明改为：费用按本地会话中的模型及 Budgets 价格表估算；未知模型不会被计价；结果不代表实际账单。

- [ ] **Step 6: 运行费用视图和共享价格测试**

Run: `npm test -- tests/pricing.test.ts tests/usageMetrics.test.ts tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/appContent.test.tsx`

Expected: PASS，旧固定费率断言已移除。

- [ ] **Step 7: 提交任务**

```bash
git add src/shared/usageMetrics.ts src/shared/pricing.ts src/renderer/components/Overview.tsx src/renderer/components/PerformanceView.tsx src/renderer/components/SettingsView.tsx src/renderer/components/AppContent.tsx tests/usageMetrics.test.ts tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/appContent.test.tsx
git commit -m "refactor: unify model based cost estimates"
```

### Task 14: 更新文档并完成全量验证

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-20-budget-control-design.md` only if implementation exposes a verified naming mismatch.
- Test: all existing and newly added tests.

**Interfaces:**
- Documents: budget scopes, periods, thresholds, pricing source, unpriced behavior, refresh rules and local config storage.
- Verifies: tests、lint、typecheck、build and Windows Electron packaging compatibility.

- [ ] **Step 1: 更新 README 功能说明**

新增“预算控制”章节，明确：

```markdown
### 预算控制

- 支持全局和项目级日、周、月自然周期预算
- Token 与预估费用限额可独立设置
- 默认在 80% 和 100% 预警，阈值可全局调整
- 费用按内置模型价格估算，用户可覆盖或补充未知模型价格
- 未知模型的 Token 正常统计，但费用标记为未计价
- 应用运行时每 60 秒及窗口聚焦时刷新，并通过应用内预警和系统通知提醒

预估费用基于本地日志和模型价格表，不代表 OpenAI 实际账单。
```

- [ ] **Step 2: 运行新功能定向测试**

Run: `npm test -- tests/budgetPeriods.test.ts tests/budgetValidation.test.ts tests/pricing.test.ts tests/budgetEvaluation.test.ts tests/notificationPolicy.test.ts tests/budgetStore.test.ts tests/usageMonitor.test.ts tests/budgetRuntime.test.ts tests/budgetViewModel.test.ts tests/budgetForm.test.ts tests/pricingForm.test.ts`

Expected: PASS。

- [ ] **Step 3: 运行完整测试**

Run: `npm test`

Expected: PASS，所有测试文件通过且无未处理 Promise rejection。

- [ ] **Step 4: 运行代码规范检查**

Run: `npm run lint`

Expected: PASS，ESLint 0 warnings，Prettier check 通过。

- [ ] **Step 5: 运行双 TypeScript 工程检查**

Run: `npm run typecheck`

Expected: PASS，Node 和 Web 工程均无类型错误。

- [ ] **Step 6: 构建 Electron 应用**

Run: `npm run build`

Expected: PASS，生成 `out/main`、`out/preload` 和 `out/renderer` 产物。

- [ ] **Step 7: 手动验证关键流程**

Run: `npm run dev`

Expected:

1. Budgets 页面可在无会话数据时打开。
2. 可创建全局日 Token 预算和项目月费用预算。
3. 超过阈值后应用内预警、侧栏徽标和 Windows 系统通知各出现一次。
4. 再次聚焦或等待一次定时扫描不会重复通知。
5. 未知模型显示费用不完整，补充价格后立即重新计算。
6. 重启应用后预算、阈值和价格覆盖仍存在。
7. 删除预算不会修改 `%USERPROFILE%\.codex\sessions`。

- [ ] **Step 8: 检查最终差异和工作区状态**

Run: `git diff --check`

Expected: 无输出。

Run: `git status --short`

Expected: 只包含 README 或本任务最后修正的预期文件。

- [ ] **Step 9: 提交文档与最终修正**

```bash
git add README.md docs/superpowers/specs/2026-07-20-budget-control-design.md
git commit -m "docs: describe budget controls"
```

若设计文档没有产生实现后修正，只暂存并提交 `README.md`。
