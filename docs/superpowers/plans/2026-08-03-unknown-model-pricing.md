# 未知模型计价实施计划

> **目标：** 为完全缺失 Model ID 的 Token 增加默认关闭、用户显式配置的兜底价格，并在预算和成本分析中保留“假设计价”语义。

**架构：** 在共享领域层新增独立的未知模型价格类型和统一切片计价判别，避免把展示文案或哨兵字符串混入普通模型价格索引。预算配置 schema 升级到版本 3，主进程负责保存、删除和重新评估。预算与成本优化复用相同计价语义，Renderer 通过现有类型化 IPC 展示和编辑兜底规则。

**技术栈：** TypeScript、Electron、React 18、i18next、Vitest、Testing Library、CSS。

---

## 任务 1：建立配置类型、校验与 schema 迁移边界

**文件：**

- 修改：`src/shared/budgetTypes.ts`
- 修改：`src/shared/budgetValidation.ts`
- 修改：`src/main/budgetStore.ts`
- 修改：`tests/budgetValidation.test.ts`
- 修改：`tests/budgetStore.test.ts`

### 红灯

先添加测试，覆盖：

- schema 2 配置无损迁移到 schema 3，且默认不启用未知模型兜底价格；
- schema 3 有效兜底价格往返解码；
- 负数、非有限值、缺失字段和无效更新时间被拒绝；
- 默认配置和克隆配置不会共享可变对象。

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/budgetValidation.test.ts tests/budgetStore.test.ts
```

### 绿灯

- 新增 `UnknownModelPricingInput` 与 `UnknownModelPricing`。
- `PersistedBudgetConfig` 增加可选 `unknownModelPricing`。
- schema 升级到 3，并显式支持版本 1、2 到版本 3 的迁移。
- 新增共享校验函数和校验码。
- 默认配置保持兜底关闭。

### 重构

复用现有价格数值校验，避免普通价格和未知模型价格出现不同的非负有限数规则。

## 任务 2：统一切片计价并扩展预算汇总

**文件：**

- 修改：`src/shared/pricing.ts`
- 修改：`src/shared/budgetTypes.ts`
- 修改：`src/shared/budgetEvaluation.ts`
- 修改：`tests/pricing.test.ts`
- 修改：`tests/budgetEvaluation.test.ts`

### 红灯

先添加测试，覆盖：

- 未配置兜底时缺失 ID 继续未计价；
- 配置兜底后缺失和空白 ID 正确计算输入、缓存输入及输出费用；
- 带具体但未定价 ID 的切片不使用兜底；
- `assumedCostUsd` 是 `pricedCostUsd` 子集，`assumedTokens` 与 `unpricedTokens` 可对账；
- 预算 `used` 包含假设费用，假设 Token 单独暴露；
- 仍有真实未计价 Token 时费用进度保持不完整；
- 已使用兜底的缺失 ID 不再进入未计价模型列表。

运行：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/pricing.test.ts tests/budgetEvaluation.test.ts
```

### 绿灯

- 新增共享计价上下文和切片判别结果。
- `calculateEstimatedCost` 接收可选兜底价格并返回假设费用与 Token。
- `EvaluateBudgetsInput`、`BudgetPolicyStatus` 和 `BudgetSnapshot` 传递兜底价格与假设状态。
- 保持默认参数兼容，未配置时所有现有调用结果不变。

### 重构

让普通模型索引、别名匹配和未知模型判别只实现一次，并保证纯函数不修改输入。

## 任务 3：接入成本优化覆盖、预测和身份依赖保护

**文件：**

- 修改：`src/shared/costOptimizationTypes.ts`
- 修改：`src/shared/costOptimizationCost.ts`
- 修改：`src/shared/costOptimizationEvaluation.ts`
- 修改：`src/shared/costOptimizationAnomalies.ts`
- 修改：`src/shared/costOptimizationSuggestions.ts`
- 修改：`src/shared/sessionDiagnosisEvaluation.ts`
- 修改：相关 `tests/costOptimization*.test.ts` 与 `tests/sessionDiagnosis*.test.ts`

### 红灯

先添加最小相关测试，覆盖：

- `PricingCoverage` 区分精确、假设和未计价 Token；
- 未知模型费用行使用兜底价格并保留假设标识；
- 总费用、每日历史和预测纳入假设费用；
- 未知模型不成为模型替换来源；
- 未知模型不产生模型费用主导诊断；
- 依赖假设费用的推荐置信度不超过中等。

运行最小相关测试集，以实际依赖文件为准。

### 绿灯

- 所有成本优化入口接收可选兜底价格。
- 规则覆盖率包含假设 Token，同时增加精确覆盖率与假设占比。
- 复用任务 2 的共享计价判别，不保留第二套未知模型定价公式。
- 在身份依赖算法入口显式排除缺失 ID 分组。

### 重构

收敛重复的价格索引、费用公式和未知模型键；内部键与用户可见文案分离。

## 任务 4：接入主进程运行时、应用协调、IPC 与 Preload

**文件：**

- 修改：`src/main/budgetRuntime.ts`
- 修改：`src/main/applicationRuntime.ts`
- 修改：`src/main/costOptimizationRuntime.ts`
- 修改：`src/main/ipc.ts`
- 修改：`src/shared/ipcChannels.ts`
- 修改：`src/preload/preload.ts`
- 修改：`src/renderer/hooks/useBudgetSnapshot.ts`
- 修改：`tests/budgetRuntime.test.ts`
- 修改：`tests/applicationRuntime.test.ts`
- 修改：`tests/costOptimizationRuntime.test.ts`
- 修改：`tests/costOptimizationIpc.test.ts`
- 修改：`tests/budgetIpc.test.ts` 或现有预算 IPC 测试文件

### 红灯

先添加测试，覆盖：

- 保存时由主进程生成 `updatedAt`；
- 删除规则恢复未计价语义；
- 保存失败不发布新快照；
- 保存和删除均触发预算及成本优化重新评估；
- 新 IPC handler、preload 方法和订阅快照类型正确传递。

### 绿灯

- `BudgetRuntime` 新增保存和删除未知模型价格操作。
- 应用协调层在预算价格配置变化后同步更新成本优化运行时。
- 新增类型化 IPC channel 和 preload API。
- Renderer hook 暴露对应 action。

### 重构

复用现有配置保存和重新评估流程，避免为未知模型价格复制运行时事务逻辑。

## 任务 5：实现模型价格设置与假设状态展示

**文件：**

- 修改：`src/renderer/components/ModelPricingView.tsx`
- 修改：`src/renderer/components/BudgetSummary.tsx`
- 修改：`src/renderer/components/BudgetList.tsx`
- 修改：`src/renderer/components/CostOptimizationOverview.tsx`
- 按需要修改其他费用详情组件
- 修改：`src/shared/i18n/locales/en.ts`
- 修改：`src/shared/i18n/locales/zhCN.ts`
- 修改：`src/renderer/styles/views.css`
- 修改：`tests/modelPricingView.test.tsx`
- 修改：`tests/budgetsView.test.tsx`
- 修改：`tests/costOptimizationView.test.tsx`
- 修改：`tests/i18n.test.ts`

### 红灯

先添加测试，覆盖：

- 未启用和已启用的独立兜底价格卡片；
- 新增、编辑、全零确认和停用确认；
- 缺失 ID 行进入兜底设置，具体未定价 ID 继续进入普通模型价格编辑器；
- 假设计价、未计价以及二者并存时的展示优先级；
- 英文和简体中文文案、ARIA 名称和键盘可达性。

### 绿灯

- 在普通模型价格表外新增独立兜底价格卡片和抽屉。
- 保留当前未提交的 `PricingModelCombobox` 集成，不将兜底规则加入组合框。
- 预算和成本优化页面展示假设 Token、假设占比或一致状态提示。
- 通知与用户可见文案同时维护双语资源。

### 重构

抽取可复用的价格输入字段或状态标签，但不顺带格式化无关页面。

## 任务 6：文档、格式与完整验证

**文件：**

- 修改：`README.md`
- 修改：受影响源文件与测试文件

### 验证顺序

1. 运行任务 1—5 的最小相关测试集。
2. 只对本任务涉及文件运行 Prettier 写入。
3. 运行完整验证：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
```

4. 检查变更：

```powershell
git diff --check
git status --short
```

### 完成条件

- 所有验证通过且无 warning。
- Codex 会话目录未被写入、删除或上传。
- 未覆盖或回滚工作区中现有模型价格组合框改动。
- 不创建提交、不 push、不创建 Pull Request。

