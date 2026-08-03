# 按模型目标控制预算实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为预算策略增加“所有模型、未知模型、具体模型”三类模型目标，并提供可直接输入新模型 ID 的无障碍组合框。

**Architecture:** 在共享层用判别联合建模模型目标，以纯函数完成规范化、别名解析、业务键和切片匹配；Electron 主进程负责最终规范化、校验及 schema 1→2 迁移。Renderer 通过独立组合框组件和纯表单状态接入候选模型，预算列表只负责本地化展示。

**Tech Stack:** TypeScript、React 18、Electron、Vitest、Testing Library、i18next、CSS。

## Global Constraints

- 设计依据：`docs/superpowers/specs/2026-08-03-model-target-budget-control-design.md`。
- 使用红—绿—重构循环；每个任务先写失败测试，再写最小实现。
- Codex 会话目录始终只读；不得修改、删除或上传其中的数据。
- Renderer 不直接访问文件系统；预算配置继续通过类型化 IPC 和 preload API 保存。
- 未知或未定价模型不得猜测价格；必须保留 Token，并明确标记费用不完整。
- 费用始终属于本地估算，不得描述为 OpenAI 实际账单。
- 核心匹配、规范化、迁移和候选项构建使用无副作用纯函数，不修改输入对象。
- 禁止使用 `any` 和 `var`；新增业务常量必须使用具名常量。
- 新增用户可见文案必须同时维护英文和简体中文，且不得在 React 组件中硬编码。
- 组合框必须支持文字输入、上下方向键、Enter、Escape、Tab，并以 ARIA 暴露状态与错误。
- 每个任务只提交本任务文件，提交信息遵循 Conventional Commits。
- 完成前必须运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。

## 文件职责映射

- 新建 `src/shared/budgetModelTarget.ts`：模型目标规范化、规范模型解析、业务键和切片匹配。
- 修改 `src/shared/budgetTypes.ts`：声明 `BudgetModelTarget` 并加入预算输入和策略。
- 修改 `src/shared/budgetPeriods.ts`：把模型目标键加入预算唯一业务键。
- 修改 `src/shared/budgetValidation.ts`：校验模型目标并迁移 schema 1 配置到 schema 2。
- 修改 `src/main/budgetStore.ts`：默认 schema 升级为 2，保存和加载使用迁移后的配置。
- 修改 `src/shared/budgetEvaluation.ts`：在时间和项目筛选后应用模型目标筛选。
- 修改 `src/main/budgetRuntime.ts`：保存前把已知别名规范化为规范模型 ID，再执行重复检查。
- 修改 `src/renderer/utils/budgetForm.ts`：在表单 reducer 中保存模型目标。
- 新建 `src/renderer/utils/budgetModelOptions.ts`：从价格和未定价摘要构建稳定、去重候选项。
- 新建 `src/renderer/components/BudgetModelCombobox.tsx`：实现受控、可输入、键盘可用的组合框。
- 修改 `src/renderer/components/BudgetDrawer.tsx`：接入组合框及字段错误。
- 修改 `src/renderer/components/BudgetsView.tsx`：从快照派生候选项并传入抽屉。
- 修改 `src/renderer/components/BudgetList.tsx`：增加模型列并本地化三类目标。
- 修改 `src/shared/i18n/locales/en.ts`、`src/shared/i18n/locales/zhCN.ts`：新增模型目标及重复预算文案。
- 修改 `src/renderer/styles/views.css`：组合框弹层、焦点和七列预算表布局。
- 修改预算、存储、运行时、成本优化测试中的策略 fixture：显式补充 `{ kind: 'all' }`。
- 新建 `tests/budgetsViewInteraction.test.tsx`：在 jsdom 中验证快照候选可从页面进入预算抽屉。

---

### Task 1: 建立模型目标领域类型并完成 schema 迁移

**Files:**
- Create: `src/shared/budgetModelTarget.ts`
- Modify: `src/shared/budgetTypes.ts`
- Modify: `src/shared/budgetPeriods.ts`
- Modify: `src/shared/budgetValidation.ts`
- Modify: `src/main/budgetStore.ts`
- Modify: `tests/budgetPeriods.test.ts`
- Modify: `tests/budgetValidation.test.ts`
- Modify: `tests/budgetStore.test.ts`
- Modify: `tests/budgetEvaluation.test.ts`
- Modify: `tests/budgetRuntime.test.ts`
- Modify: `tests/budgetForm.test.tsx`
- Modify: `tests/budgetsView.test.tsx`
- Modify: `tests/budgetViewModel.test.tsx`
- Modify: `tests/costOptimizationForecast.test.ts`
- Modify: `tests/costOptimizationEvaluation.test.ts`

**Interfaces:**
- Consumes: `ModelPricingEntry`、`UsageSlice`、现有 `normalizeModelId(modelId: string): string`。
- Produces: `BudgetModelTarget`、`getBudgetModelTargetKey(target)`、`resolveBudgetModelTarget(target, pricing)`、`matchesBudgetModelTarget(modelId, target, pricing)`；后续任务只能通过这些接口解释模型目标。

- [ ] **Step 1: 写入领域类型、业务键和迁移失败测试**

在 `tests/budgetPeriods.test.ts` 增加不同目标业务键测试：

```ts
it('includes normalized model targets in budget identity', () => {
  const base = { scope: 'global' as const, period: 'week' as const };

  expect(
    getBudgetBusinessKey({
      ...base,
      modelTarget: { kind: 'model', modelId: ' GPT-Test ' },
    })
  ).toBe(
    getBudgetBusinessKey({
      ...base,
      modelTarget: { kind: 'model', modelId: 'gpt-test' },
    })
  );
  expect(
    new Set([
      getBudgetBusinessKey({ ...base, modelTarget: { kind: 'all' } }),
      getBudgetBusinessKey({ ...base, modelTarget: { kind: 'unknown' } }),
      getBudgetBusinessKey({
        ...base,
        modelTarget: { kind: 'model', modelId: 'gpt-test' },
      }),
    ]).size
  ).toBe(3);
});
```

在 `tests/budgetValidation.test.ts` 增加空具体 ID 测试：

```ts
it('requires a non-empty ID only for concrete model targets', () => {
  expect(
    getBudgetPolicyIssues({
      scope: 'global',
      period: 'day',
      modelTarget: { kind: 'model', modelId: '  ' },
      tokenLimit: 100,
    })
  ).toContainEqual({ field: 'modelId', code: 'model-id-required' });

  expect(
    getBudgetPolicyIssues({
      scope: 'global',
      period: 'day',
      modelTarget: { kind: 'unknown' },
      tokenLimit: 100,
    })
  ).toEqual([]);
});
```

在 `tests/budgetStore.test.ts` 把当前配置往返断言改为 schema 2，并新增 schema 1 迁移：

```ts
it('migrates schema 1 budgets to all-model targets without losing configuration', async () => {
  const legacyConfig = {
    schemaVersion: 1,
    policies: [
      {
        id: 'legacy-global-day',
        scope: 'global',
        period: 'day',
        tokenLimit: 10_000,
        createdAt: FIXED_TIMESTAMP,
        updatedAt: FIXED_TIMESTAMP,
      },
    ],
    thresholds: { warningPercent: 80, criticalPercent: 100 },
    pricingOverrides: [],
    notificationReceipts: [],
  };
  await writeFile(configPath, JSON.stringify(legacyConfig), 'utf8');

  const result = await createBudgetStore(configPath, fixedNow).load();

  expect(result.warnings).toEqual([]);
  expect(result.config.schemaVersion).toBe(2);
  expect(result.config.policies[0]).toEqual(
    expect.objectContaining({ modelTarget: { kind: 'all' } })
  );
});
```

把 future schema 用例的输入从 2 改为 3。所有现有 `BudgetPolicy`、`BudgetPolicyInput` fixture 都显式增加：

```ts
modelTarget: { kind: 'all' },
```

- [ ] **Step 2: 运行测试并确认因类型、业务键和迁移缺失而失败**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetPeriods.test.ts tests/budgetValidation.test.ts tests/budgetStore.test.ts
```

Expected: FAIL，至少包含 `modelTarget` 类型不存在、业务键未区分目标或 schema 1 无法迁移。

- [ ] **Step 3: 声明模型目标并实现纯函数**

在 `src/shared/budgetTypes.ts` 增加：

```ts
export type BudgetModelTarget =
  | { kind: 'all' }
  | { kind: 'unknown' }
  | { kind: 'model'; modelId: string };

export interface BudgetPolicyInput {
  id?: string;
  scope: BudgetScope;
  projectPath?: string;
  period: BudgetPeriod;
  modelTarget: BudgetModelTarget;
  tokenLimit?: number;
  costLimitUsd?: number;
}
```

创建 `src/shared/budgetModelTarget.ts`，导出以下签名：

```ts
import type { BudgetModelTarget, ModelPricingEntry } from './budgetTypes';
import { normalizeModelId } from './pricing';

const ALL_TARGET_KEY = 'all';
const UNKNOWN_TARGET_KEY = 'unknown';
const MODEL_TARGET_PREFIX = 'model:';

const findPricing = (
  modelId: string,
  pricing: ModelPricingEntry[]
): ModelPricingEntry | undefined => {
  const key = normalizeModelId(modelId);
  return pricing.find((entry) =>
    [entry.modelId, ...entry.aliases].some((candidate) => normalizeModelId(candidate) === key)
  );
};

export const getBudgetModelTargetKey = (target: BudgetModelTarget): string => {
  if (target.kind === 'all') return ALL_TARGET_KEY;
  if (target.kind === 'unknown') return UNKNOWN_TARGET_KEY;
  return `${MODEL_TARGET_PREFIX}${normalizeModelId(target.modelId)}`;
};

export const resolveBudgetModelTarget = (
  target: BudgetModelTarget,
  pricing: ModelPricingEntry[]
): BudgetModelTarget => {
  if (target.kind !== 'model') return { ...target };
  const modelId = target.modelId.trim();
  const entry = findPricing(modelId, pricing);
  return { kind: 'model', modelId: entry?.modelId ?? modelId };
};

export const matchesBudgetModelTarget = (
  modelId: string | undefined,
  target: BudgetModelTarget,
  pricing: ModelPricingEntry[]
): boolean => {
  const candidateKey = normalizeModelId(modelId ?? '');
  if (target.kind === 'all') return true;
  if (target.kind === 'unknown') return candidateKey.length === 0;

  const entry = findPricing(target.modelId, pricing);
  const acceptedIds = entry ? [entry.modelId, ...entry.aliases] : [target.modelId];
  return acceptedIds.some((accepted) => normalizeModelId(accepted) === candidateKey);
};
```

允许 ESLint/Prettier 对单行 `if` 自动展开，不改变上述语义。

- [ ] **Step 4: 把模型目标加入业务键和校验**

在 `src/shared/budgetPeriods.ts` 的 `getBudgetBusinessKey` 中加入模型目标键：

```ts
return [input.scope, scopeKey, input.period, getBudgetModelTargetKey(input.modelTarget)].join(':');
```

在 `getBudgetPolicyIssues` 中增加：

```ts
if (input.modelTarget.kind === 'model' && !input.modelTarget.modelId.trim()) {
  issues.push({ field: 'modelId', code: 'model-id-required' });
}
```

持久化结构校验必须只接受三种合法分支；`model` 分支只接受字符串 `modelId`。构造 `policyInput` 时复制目标对象，不能保留可变外部引用。

- [ ] **Step 5: 实现 schema 1→2 迁移**

在 `src/shared/budgetValidation.ts` 设置：

```ts
const LEGACY_BUDGET_CONFIG_SCHEMA_VERSION = 1;
export const BUDGET_CONFIG_SCHEMA_VERSION = 2;
```

解码流程接受版本 1 或 2。版本 1 的每条合法旧策略补充 `{ kind: 'all' }`；版本 2 必须显式校验 `modelTarget`。返回对象的 `schemaVersion` 始终为 2。保留 thresholds、pricingOverrides、notificationReceipts 的现有验证和唯一性检查。

`src/main/budgetStore.ts` 继续以 `BUDGET_CONFIG_SCHEMA_VERSION` 构造默认配置；未来版本判定自然变为 `> 2`。

- [ ] **Step 6: 运行最小测试和类型检查**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetPeriods.test.ts tests/budgetValidation.test.ts tests/budgetStore.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS；所有策略 fixture 已显式包含模型目标，schema 1 无损迁移为 schema 2。

- [ ] **Step 7: 提交领域模型与迁移**

```powershell
git add src/shared/budgetModelTarget.ts src/shared/budgetTypes.ts src/shared/budgetPeriods.ts src/shared/budgetValidation.ts src/main/budgetStore.ts tests/budgetPeriods.test.ts tests/budgetValidation.test.ts tests/budgetStore.test.ts tests/budgetEvaluation.test.ts tests/budgetRuntime.test.ts tests/budgetForm.test.tsx tests/budgetsView.test.tsx tests/budgetViewModel.test.tsx tests/costOptimizationForecast.test.ts tests/costOptimizationEvaluation.test.ts
git commit -m "feat: add budget model targets"
```

---

### Task 2: 按模型目标评估 Token 与费用预算

**Files:**
- Modify: `src/shared/budgetEvaluation.ts`
- Modify: `tests/budgetEvaluation.test.ts`

**Interfaces:**
- Consumes: `matchesBudgetModelTarget(modelId, target, pricing): boolean` 和 Task 1 的 `BudgetPolicy.modelTarget`。
- Produces: `evaluateBudgets(input)` 对 all、unknown、model 三类目标的稳定评估结果；后续运行时无需重复过滤逻辑。

- [ ] **Step 1: 写入三类目标与别名的失败测试**

在 `tests/budgetEvaluation.test.ts` 增加一个包含四种切片的会话：规范 ID `gpt-test`、别名 `gpt-alias`、未定价具体 ID `future-model`、缺失 ID。扩展价格 fixture 使 `gpt-test.aliases` 包含 `gpt-alias`，并断言：

```ts
it('filters all, canonical, alias, unpriced, and missing IDs by model target', () => {
  const sessions = [
    makeSession('C:\\repo', [
      sliceAt(2026, 6, 20, 100, 'gpt-test'),
      sliceAt(2026, 6, 20, 200, 'gpt-alias'),
      sliceAt(2026, 6, 20, 300, 'future-model'),
      sliceAt(2026, 6, 20, 400),
    ]),
  ];
  const pricing = [{ ...makePricing('gpt-test'), aliases: ['gpt-alias'] }];
  const policies = [
    makePolicy({ id: 'all', modelTarget: { kind: 'all' }, tokenLimit: 2_000 }),
    makePolicy({
      id: 'known',
      modelTarget: { kind: 'model', modelId: 'GPT-TEST' },
      tokenLimit: 2_000,
    }),
    makePolicy({
      id: 'future',
      modelTarget: { kind: 'model', modelId: ' future-model ' },
      tokenLimit: 2_000,
    }),
    makePolicy({ id: 'unknown', modelTarget: { kind: 'unknown' }, tokenLimit: 2_000 }),
  ];

  const snapshot = evaluateBudgets({
    sessions,
    policies,
    thresholds: { warningPercent: 80, criticalPercent: 100 },
    pricing,
    now: new Date(2026, 6, 20, 12, 0),
    dataState: 'fresh',
  });

  expect(snapshot.statuses.map((status) => status.token?.used)).toEqual([1_000, 300, 300, 400]);
  expect(snapshot.statuses[1].unpricedTokens).toBe(0);
  expect(snapshot.statuses[2].unpricedTokens).toBe(300);
  expect(snapshot.statuses[3].unpricedTokens).toBe(400);
});
```

再增加 unknown 无用量边界：

```ts
it('keeps an unused unknown-model cost budget complete at zero', () => {
  const snapshot = evaluateBudgets({
    ...makeEvaluationInputWithTokens(100, { warningPercent: 80, criticalPercent: 100 }),
    policies: [
      makePolicy({
        modelTarget: { kind: 'unknown' },
        tokenLimit: undefined,
        costLimitUsd: 10,
      }),
    ],
  });

  expect(snapshot.statuses[0].cost).toEqual(
    expect.objectContaining({ used: 0, incomplete: false })
  );
});
```

- [ ] **Step 2: 运行测试并确认模型目标尚未参与过滤**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetEvaluation.test.ts
```

Expected: FAIL，四条策略当前都会得到相同汇总值或别名目标无法匹配。

- [ ] **Step 3: 在策略切片过滤中加入模型匹配**

给 `isSliceInPolicy` 增加 `pricing: ModelPricingEntry[]` 参数，并组合第三个条件：

```ts
const matchesModel = matchesBudgetModelTarget(slice.modelId, policy.modelTarget, pricing);
return matchesTime && matchesProject && matchesModel;
```

沿 `getPolicySlices` 和 `buildPolicyStatus` 传递当前合并价格表。继续让 `calculateEstimatedCost` 负责未定价 Token 与 incomplete 状态，禁止在评估器中伪造价格。

- [ ] **Step 4: 运行预算评估回归测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetEvaluation.test.ts tests/pricing.test.ts
```

Expected: PASS；all=1000、known=300、future=300、unknown=400，unknown 无用量费用为完整的 0。

- [ ] **Step 5: 提交评估过滤**

```powershell
git add src/shared/budgetEvaluation.ts tests/budgetEvaluation.test.ts
git commit -m "feat: evaluate budgets by model target"
```

---

### Task 3: 在主进程规范化别名并阻止重复模型预算

**Files:**
- Modify: `src/main/budgetRuntime.ts`
- Modify: `tests/budgetRuntime.test.ts`

**Interfaces:**
- Consumes: `resolveBudgetModelTarget(target, pricing): BudgetModelTarget`、`getBudgetBusinessKey(input): string`。
- Produces: `BudgetRuntime.savePolicy(input)` 保存规范模型 ID，并以规范化后的完整业务键判重。

- [ ] **Step 1: 写入别名规范化和模型目标唯一性失败测试**

把 `TEST_PRICING.aliases` 设置为 `['gpt-alias']`，然后增加：

```ts
it('stores canonical model IDs and rejects canonical-alias duplicates', async () => {
  const runtime = createBudgetRuntime(makeRuntimeDependencies());
  await runtime.initialize();

  await runtime.savePolicy({
    scope: 'global',
    period: 'day',
    modelTarget: { kind: 'model', modelId: ' GPT-ALIAS ' },
    tokenLimit: 100,
  });

  expect(runtime.getSnapshot().statuses[0].policy.modelTarget).toEqual({
    kind: 'model',
    modelId: 'gpt-test',
  });

  await expect(
    runtime.savePolicy({
      scope: 'global',
      period: 'day',
      modelTarget: { kind: 'model', modelId: 'gpt-test' },
      costLimitUsd: 10,
    })
  ).rejects.toMatchObject({
    issues: [{ field: 'businessKey', code: 'budget-duplicate' }],
  });
});
```

增加同范围不同目标共存测试：

```ts
it('allows all, unknown, and concrete budgets in the same scope and period', async () => {
  const runtime = createBudgetRuntime(makeRuntimeDependencies());
  await runtime.initialize();

  for (const modelTarget of [
    { kind: 'all' as const },
    { kind: 'unknown' as const },
    { kind: 'model' as const, modelId: 'future-model' },
  ]) {
    await runtime.savePolicy({
      scope: 'global',
      period: 'day',
      modelTarget,
      tokenLimit: 100,
    });
  }

  expect(runtime.getSnapshot().statuses).toHaveLength(3);
});
```

- [ ] **Step 2: 运行测试并确认别名仍按原输入保存**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetRuntime.test.ts
```

Expected: FAIL，保存结果仍为 `GPT-ALIAS` 或规范 ID 与别名未被判重。

- [ ] **Step 3: 在保存边界统一规范化输入**

在 `createBudgetRuntime` 内增加复用当前合并价格的局部函数：

```ts
const getCurrentPricing = (): ModelPricingEntry[] =>
  mergeModelPricing(dependencies.defaultPricing, config.pricingOverrides);
```

`buildSnapshot` 复用该函数。`savePolicy` 在字段校验通过后构造：

```ts
const normalizedInput: BudgetPolicyInput = {
  ...input,
  modelTarget: resolveBudgetModelTarget(input.modelTarget, getCurrentPricing()),
};
```

之后查找 existing policy、生成业务键、重复检查和构造 `BudgetPolicy` 全部使用 `normalizedInput`。持久化时复制目标对象：

```ts
modelTarget: { ...normalizedInput.modelTarget },
```

未定价具体 ID 只 trim，不改变大小写展示；业务键仍忽略大小写。

- [ ] **Step 4: 运行运行时与存储测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetRuntime.test.ts tests/budgetStore.test.ts tests/budgetPeriods.test.ts
```

Expected: PASS；别名保存为规范 ID，三种不同目标可共存，重复目标被拒绝。

- [ ] **Step 5: 提交主进程规范化**

```powershell
git add src/main/budgetRuntime.ts tests/budgetRuntime.test.ts
git commit -m "feat: normalize budget model targets"
```

---

### Task 4: 扩展预算表单状态并构建模型候选项

**Files:**
- Create: `src/renderer/utils/budgetModelOptions.ts`
- Modify: `src/renderer/utils/budgetForm.ts`
- Modify: `tests/budgetForm.test.tsx`

**Interfaces:**
- Consumes: `BudgetModelTarget`、`ModelPricingEntry[]`、`UnpricedModelSummary[]`、`normalizeModelId`。
- Produces: `BudgetModelOption`、`buildBudgetModelOptions(pricing, unpricedModels)`、表单 action `model-target-changed`。

- [ ] **Step 1: 写入表单默认值、回显、自由输入和候选去重失败测试**

在 `tests/budgetForm.test.tsx` 增加：

```ts
it('defaults new budgets to all models and preserves edited targets', () => {
  expect(createBudgetFormState().modelTarget).toEqual({ kind: 'all' });
  expect(
    createBudgetFormState({
      id: 'policy-1',
      scope: 'global',
      period: 'month',
      modelTarget: { kind: 'unknown' },
      tokenLimit: 100,
      createdAt: '2026-08-03T00:00:00.000Z',
      updatedAt: '2026-08-03T00:00:00.000Z',
    }).modelTarget
  ).toEqual({ kind: 'unknown' });
});

it('writes a concrete model target into policy input', () => {
  const state = budgetFormReducer(createBudgetFormState(), {
    type: 'model-target-changed',
    modelTarget: { kind: 'model', modelId: ' future-model ' },
  });

  expect(toBudgetPolicyInput({ ...state, tokenEnabled: true, tokenLimit: '100' }).modelTarget).toEqual(
    { kind: 'model', modelId: 'future-model' }
  );
});
```

为 `buildBudgetModelOptions` 增加：

```ts
it('builds fixed, priced, and concrete unpriced options with normalized deduplication', () => {
  expect(
    buildBudgetModelOptions(
      [makePricing('gpt-b'), makePricing('GPT-A')],
      [
        { modelId: 'gpt-a', totalTokens: 10 },
        { modelId: 'future-model', totalTokens: 20 },
        { modelId: undefined, totalTokens: 30 },
      ]
    ).map(({ target }) => target)
  ).toEqual([
    { kind: 'all' },
    { kind: 'unknown' },
    { kind: 'model', modelId: 'GPT-A' },
    { kind: 'model', modelId: 'gpt-b' },
    { kind: 'model', modelId: 'future-model' },
  ]);
});
```

- [ ] **Step 2: 运行测试并确认表单状态和候选构建器缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetForm.test.tsx
```

Expected: FAIL，缺少 `modelTarget` state、action 或 `buildBudgetModelOptions` 模块。

- [ ] **Step 3: 扩展 reducer 与输入转换**

在 `BudgetFormState` 增加：

```ts
modelTarget: BudgetModelTarget;
```

在 action 联合增加：

```ts
| { type: 'model-target-changed'; modelTarget: BudgetModelTarget }
```

新表单默认 `{ kind: 'all' }`，编辑时复制 `policy.modelTarget`。reducer 收到变更时复制目标并清空 issues。`toBudgetPolicyInput` 输出目标；具体模型 ID 在此处 trim：

```ts
modelTarget:
  state.modelTarget.kind === 'model'
    ? { kind: 'model', modelId: state.modelTarget.modelId.trim() }
    : { ...state.modelTarget },
```

- [ ] **Step 4: 实现稳定候选构建器**

创建：

```ts
export interface BudgetModelOption {
  key: string;
  target: BudgetModelTarget;
}

export const buildBudgetModelOptions = (
  pricing: ModelPricingEntry[],
  unpricedModels: UnpricedModelSummary[]
): BudgetModelOption[];
```

固定项先放 `all`、`unknown`。具体候选先收集价格条目的规范 ID，再收集 `unpricedModels` 中 trim 后非空的 ID；使用 `normalizeModelId` 去重，优先保留价格条目的展示 ID。已定价组和未定价组分别按规范化 ID `localeCompare` 排序，并保持已定价组在未定价组之前。每个 option 的 `key` 使用 `getBudgetModelTargetKey`。

- [ ] **Step 5: 运行表单测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetForm.test.tsx
```

Expected: PASS；默认 all、编辑回显、trim 和候选去重均稳定。

- [ ] **Step 6: 提交表单领域状态**

```powershell
git add src/renderer/utils/budgetForm.ts src/renderer/utils/budgetModelOptions.ts tests/budgetForm.test.tsx
git commit -m "feat: model budget form options"
```

---

### Task 5: 实现可输入的无障碍模型组合框

**Files:**
- Create: `src/renderer/components/BudgetModelCombobox.tsx`
- Create: `tests/budgetModelCombobox.test.tsx`
- Modify: `src/renderer/styles/views.css`

**Interfaces:**
- Consumes: `BudgetModelTarget`、`BudgetModelOption[]`。
- Produces: `BudgetModelCombobox`，通过 `onChange(target)` 输出固定项或自由输入的具体模型目标。

- [ ] **Step 1: 写入 jsdom 键盘和自由输入失败测试**

创建 `tests/budgetModelCombobox.test.tsx`，文件首行使用 `// @vitest-environment jsdom`。用 Testing Library 和测试 i18n provider 渲染：

```tsx
const renderCombobox = (onChange = vi.fn()) => {
  render(
    <BudgetModelCombobox
      value={{ kind: 'all' }}
      options={[
        { key: 'all', target: { kind: 'all' } },
        { key: 'unknown', target: { kind: 'unknown' } },
        { key: 'model:gpt-test', target: { kind: 'model', modelId: 'gpt-test' } },
      ]}
      label="Model ID"
      allModelsLabel="All models"
      unknownModelLabel="Unknown model"
      onChange={onChange}
    />
  );
  return { input: screen.getByRole('combobox', { name: 'Model ID' }), onChange };
};
```

至少覆盖：

```ts
it('allows arbitrary model IDs', () => {
  const { input, onChange } = renderCombobox();
  fireEvent.change(input, { target: { value: 'future-model' } });
  expect(onChange).toHaveBeenLastCalledWith({ kind: 'model', modelId: 'future-model' });
});

it('navigates options with arrows, selects with Enter, and closes with Escape', () => {
  const { input, onChange } = renderCombobox();
  fireEvent.focus(input);
  expect(input.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith({ kind: 'unknown' });
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input.getAttribute('aria-expanded')).toBe('false');
});

it('exposes active option and field errors through ARIA', () => {
  render(
    <BudgetModelCombobox
      value={{ kind: 'model', modelId: '' }}
      options={[]}
      label="Model ID"
      allModelsLabel="All models"
      unknownModelLabel="Unknown model"
      error="Model ID is required."
      onChange={vi.fn()}
    />
  );
  expect(screen.getByRole('combobox').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Model ID is required.').getAttribute('id')).not.toBeNull();
});
```

- [ ] **Step 2: 运行测试并确认组件不存在**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetModelCombobox.test.tsx
```

Expected: FAIL，无法导入 `BudgetModelCombobox`。

- [ ] **Step 3: 实现受控组合框状态机**

组件 Props 固定为：

```ts
interface BudgetModelComboboxProps {
  value: BudgetModelTarget;
  options: BudgetModelOption[];
  label: string;
  allModelsLabel: string;
  unknownModelLabel: string;
  error?: string;
  onChange: (target: BudgetModelTarget) => void;
}
```

使用 `useId` 生成 input、listbox、error 和 option ID；使用 `useState` 保存 `open`、`activeIndex` 和显示文本。显示文本规则：all 使用 `allModelsLabel`，unknown 使用 `unknownModelLabel`，model 使用 `modelId`。

input 获得焦点时执行 `setOpen(true)`；失焦到组件外时关闭列表并清除活动项。

输入变化时调用：

```ts
onChange({ kind: 'model', modelId: event.target.value });
setOpen(true);
setActiveIndex(-1);
```

键盘规则：

- `ArrowDown`：打开列表并移动到下一项；初始 `-1` 移到 0。
- `ArrowUp`：打开列表并移动到上一项；初始 `-1` 移到最后一项。
- `Enter`：有活动项时阻止默认提交，选择该项并关闭。
- `Escape`：关闭列表并清除活动项。
- `Tab`：不阻止默认行为，只关闭列表。

选项点击使用 `onMouseDown={(event) => event.preventDefault()}` 防止 input 先失焦，再在 click 中选择。选择后同步显示文本、调用 `onChange({ ...option.target })` 并聚焦 input。listbox 始终保留在 DOM 中，并在关闭时设置 `hidden`；这样服务端静态标记测试仍能确认完整候选内容，浏览器和辅助技术在关闭状态下不会把候选暴露为可操作项。

- [ ] **Step 4: 添加组合框样式**

在 `views.css` 的 drawer 表单规则附近增加 `.budget-model-combobox`、`.budget-model-combobox-list`、`.budget-model-combobox-option`。列表绝对定位在输入下方，使用现有 surface、border、shadow、radius token；活动项同时使用背景、加粗文字和左侧标记，不能只改变颜色。列表设置合理 `max-height` 和 `overflow-y: auto`，焦点环使用现有 focus token。

- [ ] **Step 5: 运行组件测试和 lint**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetModelCombobox.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Expected: PASS；无新增依赖、无硬编码业务文案、键盘与 ARIA 断言通过。

- [ ] **Step 6: 提交组合框**

```powershell
git add src/renderer/components/BudgetModelCombobox.tsx src/renderer/styles/views.css tests/budgetModelCombobox.test.tsx
git commit -m "feat: add budget model combobox"
```

---

### Task 6: 把模型组合框接入预算抽屉和快照候选

**Files:**
- Modify: `src/renderer/components/BudgetDrawer.tsx`
- Modify: `src/renderer/components/BudgetsView.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `tests/budgetDrawer.test.tsx`
- Modify: `tests/budgetsView.test.tsx`
- Create: `tests/budgetsViewInteraction.test.tsx`
- Modify: `tests/i18n.test.ts`

**Interfaces:**
- Consumes: `BudgetModelCombobox`、`buildBudgetModelOptions`、`BudgetModelOption[]`、现有预算 action。
- Produces: 新增和编辑预算均能选择固定目标或输入新 ID；主进程错误在模型字段附近显示。

- [ ] **Step 1: 写入抽屉候选、默认项和双语展示失败测试**

给 `BudgetDrawerProps` 测试传入：

```ts
modelOptions={[
  { key: 'all', target: { kind: 'all' } },
  { key: 'unknown', target: { kind: 'unknown' } },
  { key: 'model:gpt-test', target: { kind: 'model', modelId: 'gpt-test' } },
]}
```

在英文静态标记断言：

```ts
expect(markup).toContain('role="combobox"');
expect(markup).toContain('Model ID');
expect(markup).toContain('All models');
expect(markup).toContain('Unknown model');
expect(markup).toContain('gpt-test');
```

在中文用例断言“模型 ID”“所有模型”“未知模型”。

创建首行包含 `// @vitest-environment jsdom` 的 `tests/budgetsViewInteraction.test.tsx`。使用 Testing Library 和 `I18nextProvider` 渲染 `BudgetsView`；快照放入一个已定价模型、一个具体未定价模型和一个缺失 ID 摘要。点击 `Add budget`，聚焦模型组合框后断言 listbox 中包含 `gpt-test`、`future-model` 和唯一一个 `Unknown model` option：

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Add budget' }));
const combobox = screen.getByRole('combobox', { name: 'Model ID' });
fireEvent.focus(combobox);

expect(screen.getByRole('option', { name: 'gpt-test' })).not.toBeNull();
expect(screen.getByRole('option', { name: 'future-model' })).not.toBeNull();
expect(screen.getAllByRole('option', { name: 'Unknown model' })).toHaveLength(1);
```

- [ ] **Step 2: 运行抽屉与 i18n 测试并确认 props 和文案缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetDrawer.test.tsx tests/budgetsView.test.tsx tests/budgetsViewInteraction.test.tsx tests/i18n.test.ts
```

Expected: FAIL，抽屉尚未渲染模型组合框，语言资源缺少目标文案。

- [ ] **Step 3: 增加双语资源**

在两种 locale 的 `budgets.drawer` 增加结构相同的 key：

```ts
modelId: 'Model ID',
allModels: 'All models',
unknownModel: 'Unknown model',
```

中文分别使用“模型 ID”“所有模型”“未知模型”。把 `validation.budget-duplicate` 改为明确包含模型维度的含义：英文 `A budget already exists for this scope, period, and model.`，中文 `此范围、周期和模型已存在预算。`。

- [ ] **Step 4: 在抽屉中接入受控目标和字段错误**

`BudgetDrawerProps` 增加：

```ts
modelOptions: BudgetModelOption[];
```

在周期字段后渲染：

```tsx
<BudgetModelCombobox
  value={state.modelTarget}
  options={modelOptions}
  label={t('drawer.modelId')}
  allModelsLabel={t('drawer.allModels')}
  unknownModelLabel={t('drawer.unknownModel')}
  error={modelIssue}
  onChange={(modelTarget) => dispatch({ type: 'model-target-changed', modelTarget })}
/>
```

`modelIssue` 使用 `getIssueMessage(state.issues, ['modelId'], t)`。threshold 模式继续接收同一 props，但不渲染模型控件。

- [ ] **Step 5: 从预算快照构建候选项**

在 `BudgetsView` 中增加：

```ts
const modelOptions = useMemo(
  () => buildBudgetModelOptions(snapshot.pricing, snapshot.unpricedModels),
  [snapshot.pricing, snapshot.unpricedModels]
);
```

把 `modelOptions` 传给所有 `BudgetDrawer` 实例。不要新增文件读取、网络请求或重复 React state；扫描失败时现有 stale snapshot 自然保留候选项。

- [ ] **Step 6: 运行抽屉、表单、i18n 测试和类型检查**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetDrawer.test.tsx tests/budgetsView.test.tsx tests/budgetsViewInteraction.test.tsx tests/budgetForm.test.tsx tests/budgetModelCombobox.test.tsx tests/i18n.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS；新增和编辑预算均输出显式模型目标，双语 key 结构一致。

- [ ] **Step 7: 提交抽屉集成**

```powershell
git add src/renderer/components/BudgetDrawer.tsx src/renderer/components/BudgetsView.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts tests/budgetDrawer.test.tsx tests/budgetsView.test.tsx tests/budgetsViewInteraction.test.tsx tests/i18n.test.ts
git commit -m "feat: select models in budget drawer"
```

---

### Task 7: 展示预算模型列并完成全量验证

**Files:**
- Modify: `src/renderer/components/BudgetList.tsx`
- Modify: `src/renderer/styles/views.css`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `tests/budgetsView.test.tsx`
- Modify: `tests/budgetViewModel.test.tsx`
- Modify: `tests/costOptimizationEvaluation.test.ts`

**Interfaces:**
- Consumes: `BudgetPolicy.modelTarget` 和 `budgets.drawer.allModels/unknownModel` 的既有翻译语义。
- Produces: 预算表七列展示；全仓测试、类型、lint、构建全部通过。

- [ ] **Step 1: 写入预算列表三类目标展示失败测试**

在 `tests/budgetsView.test.tsx` 的三个状态 fixture 分别使用 all、unknown、具体模型，并断言英文标记包含：

```ts
expect(markup).toContain('All models');
expect(markup).toContain('Unknown model');
expect(markup).toContain('future-model');
expect(markup).toContain('>Model<');
```

中文用例断言“模型”“所有模型”“未知模型”。`tests/budgetViewModel.test.tsx` 继续断言筛选与分组不改变 `policy.modelTarget`。`tests/costOptimizationEvaluation.test.ts` 增加断言，确保复制预算快照后模型目标值保留且输入对象未修改。

- [ ] **Step 2: 运行视图测试并确认模型列缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetsView.test.tsx tests/budgetViewModel.test.tsx tests/costOptimizationEvaluation.test.ts
```

Expected: FAIL，预算表头和行尚未显示模型目标。

- [ ] **Step 3: 增加模型列和本地化文案**

在 `budgets.list` 增加英文 `model: 'Model'` 和中文 `model: '模型'`。在 `BudgetRow` 计算：

```ts
const modelLabel =
  status.policy.modelTarget.kind === 'all'
    ? t('drawer.allModels')
    : status.policy.modelTarget.kind === 'unknown'
      ? t('drawer.unknownModel')
      : status.policy.modelTarget.modelId;
```

在范围列与周期列之间插入 `.budget-model-cell`，表头同位置插入 `t('list.model')`。具体模型 ID 使用普通文本并允许换行，不把它解释为链接或价格状态。

- [ ] **Step 4: 调整七列布局和窄屏滚动**

把 `.budget-table-row` 的最小宽度扩大到能容纳七列，并将 grid 调整为：范围、模型、周期、Token、估算费用、状态、操作。为 `.budget-model-cell` 设置 `min-width: 0`、`overflow-wrap: anywhere` 和正文颜色。保持横向滚动容器、状态文本标签和操作按钮键盘能力不变。

- [ ] **Step 5: 运行预算与成本优化回归测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetsView.test.tsx tests/budgetViewModel.test.tsx tests/budgetDrawer.test.tsx tests/budgetForm.test.tsx tests/budgetModelCombobox.test.tsx tests/modelPricingView.test.tsx tests/costOptimizationEvaluation.test.ts tests/costOptimizationForecast.test.ts
```

Expected: PASS；预算列表展示三类目标，成本优化继续接收完整预算策略。

- [ ] **Step 6: 运行完整项目验证**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: 四条命令全部 exit code 0；不得通过删除测试、放宽断言、禁用规则或隐藏错误绕过失败。

- [ ] **Step 7: 检查最终变更范围并提交展示层**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD
```

Expected: 只包含本计划范围内文件，`git diff --check` 无输出。

```powershell
git add src/renderer/components/BudgetList.tsx src/renderer/styles/views.css src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts tests/budgetsView.test.tsx tests/budgetViewModel.test.tsx tests/costOptimizationEvaluation.test.ts
git commit -m "feat: show budget model targets"
```
