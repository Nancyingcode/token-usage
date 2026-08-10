# 成本优化仅使用最新模型系列实施计划

## 目标

让成本优化动态识别价格表中的最高 `gpt-<major>.<minor>` 系列，并且只在该系列内部生成模型替代场景与节省建议；历史实际成本、覆盖率、异常、预测和诊断继续使用完整价格表。

设计依据：`docs/superpowers/specs/2026-08-10-latest-model-cost-optimization-design.md`

## 变更边界

- 新增共享层最新模型系列解析纯函数。
- 修改成本优化评估，使替代计算只接收最新系列价格及有效候选。
- 修改主进程运行时，使默认候选、保存校验和失效 warning 均以最新系列为准。
- 修改设置抽屉候选来源及中英文说明。
- 不修改预算、总览、性能页或价格管理页的费用计算。
- 不修改配置 schema、IPC 类型、preload 或构建配置。
- 不主动提交 Git 变更。

## Task 1：建立最新模型系列解析器

**文件：**

- Create: `src/shared/latestModelSeries.ts`
- Create: `tests/latestModelSeries.test.ts`
- Modify: `tests/pricing.test.ts`

### Step 1：先写失败测试

覆盖：

- 规范 ID 按 `major`、`minor` 数值比较，`5.10` 高于 `5.9`。
- 同一最高系列的多个后缀全部保留，并维持价格表顺序。
- 忽略 `gpt-5`、`gpt-test`、非前缀匹配和别名中的版本。
- 空价格表或无合法版本时返回空数组。
- 当前内置价格只返回 `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`。
- 不修改输入价格数组和条目。

运行：

```powershell
npm test -- tests/latestModelSeries.test.ts tests/pricing.test.ts
```

预期：新模块缺失，测试失败。

### Step 2：实现最小纯函数

- 使用锚定正则只解析规范模型 ID。
- 把版本保存为两个整数，避免字符串和浮点排序。
- 先确定最高版本，再过滤价格表副本。
- 导出最新系列价格条目和规范模型 ID 派生函数。

### Step 3：运行单测并重构

再次运行相同测试集；整理具名正则和版本比较辅助函数，确保无输入修改。

## Task 2：限制替代场景但保留历史实际成本

**文件：**

- Modify: `tests/costOptimizationEvaluation.test.ts`
- Modify: `src/shared/costOptimizationEvaluation.ts`
- Modify as needed: `tests/helpers/costOptimizationFixtures.ts`

### Step 1：先写失败测试

构造同时包含 `gpt-5.5`、`gpt-5.6-sol`、`gpt-5.6-terra` 和 `gpt-5.6-luna` 的价格与用量，覆盖：

- `currentCostUsd`、`coverage` 和 `modelRows` 仍包含 `gpt-5.5` 实际成本。
- `gpt-5.6-sol → gpt-5.6-luna` 可以生成场景。
- `gpt-5.5 → gpt-5.6-luna` 不生成场景。
- 设置中 `gpt-5.5` 目标不生成场景。
- 模型替代建议不会重新引入旧系列。
- 缓存提升建议不包含旧系列模型。
- 旧系列或混合系列异常继续展示，但不进入优先建议。

运行：

```powershell
npm test -- tests/costOptimizationEvaluation.test.ts
```

预期：现有评估仍产生跨代场景，新断言失败。

### Step 2：实现最小评估限制

- 从完整 `input.pricing` 派生最新系列价格。
- 对设置候选按最新系列规范 ID 和别名解析后求交集。
- 只把最新系列价格与有效候选传给替代场景计算，使旧系列来源也因没有来源价格而被排除。
- 实际成本、覆盖率、异常、预测、诊断和快照价格继续使用完整价格表。
- 生成建议前筛选最新系列贡献；异常只有在全部贡献均属于最新系列时才能生成异常回落建议。

### Step 3：运行单测并重构

运行成本评估及建议相关测试，必要时把“候选是否属于最新系列”提取为共享纯函数，不复制归一化规则。

## Task 3：收紧默认配置、运行时保存和失效提示

**文件：**

- Modify: `tests/costOptimizationRuntime.test.ts`
- Modify: `tests/costOptimizationConfigStore.test.ts`
- Modify: `src/main/costOptimizationRuntime.ts`

### Step 1：先写失败测试

覆盖：

- 初始化配置存储时，运行时只传入最新系列规范 ID。
- 新配置默认候选只有最新系列。
- 保存旧系列候选产生结构化 `candidate-model-unpriced` 错误。
- 价格从 `5.6` 升到 `5.7` 后，原 `5.6` 候选保留在设置中但产生 warning。
- 用户移除失效候选后可以保存。
- 用户覆盖最新系列价格不会令该模型退出可用候选。

运行：

```powershell
npm test -- tests/costOptimizationRuntime.test.ts tests/costOptimizationConfigStore.test.ts
```

预期：运行时仍传全部已计价规范 ID，相关断言失败。

### Step 2：实现运行时派生

- 初始化、价格更新、设置保存统一调用最新系列纯函数。
- warning 比较采用规范化 ID，沿用现有保留旧配置行为。
- 配置存储继续只接收“可用候选 ID”，不感知模型版本规则，也不提升 schema。

### Step 3：运行单测并重构

再次运行运行时和配置存储测试，消除运行时中重复的候选集合构建。

## Task 4：限制设置抽屉候选并更新双语说明

**文件：**

- Modify: `tests/costOptimizationSettingsDrawer.test.tsx`
- Modify: `tests/costOptimizationView.test.tsx` or nearest existing view test
- Modify: `src/renderer/components/CostOptimizationView.tsx`
- Modify: `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`

### Step 1：先写失败测试

覆盖：

- 完整快照价格包含 `5.5` 与 `5.6` 时，抽屉只收到三个 `5.6` 规范 ID。
- 已保存的 `5.5` 候选仍显示且标注“不属于最新模型系列”。
- legend 或说明明确表达“最新模型系列”。
- 英文与简体中文资源同步存在。

运行：

```powershell
npm test -- tests/costOptimizationSettingsDrawer.test.tsx tests/costOptimizationView.test.tsx
```

若没有对应 view 测试文件，则把候选派生断言放入当前最小可用的 CostOptimizationView 测试，不新增长链路集成依赖。

### Step 2：实现 Renderer 与 i18n

- `CostOptimizationView` 使用共享纯函数从快照价格派生最新系列 IDs。
- 抽屉 Props 改名为表达“可用候选”，避免误称完整已计价模型。
- 保留已选失效候选的追加显示和键盘可操作 checkbox。
- 同步更新中英文候选说明。

### Step 3：运行单测并重构

运行设置表单、抽屉、工作台视图和 i18n 相关最小测试集，确认无用户文案硬编码。

## Task 5：完整验证

### Step 1：运行受影响测试集

```powershell
npm test -- tests/latestModelSeries.test.ts tests/pricing.test.ts tests/costOptimizationCost.test.ts tests/costOptimizationEvaluation.test.ts tests/costOptimizationSuggestions.test.ts tests/costOptimizationConfigStore.test.ts tests/costOptimizationRuntime.test.ts tests/costOptimizationSettingsDrawer.test.tsx
```

修复真实回归，不删除测试、不放宽有效断言。

### Step 2：运行项目要求的完整检查

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

全部通过后才能声明完成。若失败，记录根因和未完成项。

### Step 3：检查变更范围

- 运行 `git diff --check`。
- 确认没有修改 Codex 会话数据、预算计算或无关文件。
- 确认设计文档、实施计划、测试、双语资源和代码保持一致。
