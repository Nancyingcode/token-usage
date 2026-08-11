# 预算工作台改造实施计划

> 对应设计：`docs/superpowers/specs/2026-08-11-budget-workspace-redesign.md`

## 1. 实施原则

- 保持预算领域模型、IPC、preload、持久化和通知判定不变。
- 行为代码按红—绿—重构推进：先修改或新增失败测试，再实现最小代码，最后整理结构。
- 优先运行最小相关测试集；全部任务完成后执行完整测试、类型检查、Lint 和构建。
- 用户未要求提交，本计划不创建 Git commit，不暂存或推送代码。

## 2. 任务拆分

### Task 1：建立受控预算标签导航

**文件：**

- 修改：`src/renderer/App.tsx`
- 修改：`src/renderer/components/AppContent.tsx`
- 修改：`src/renderer/components/BudgetsView.tsx`
- 修改：`tests/appNavigation.test.tsx`
- 修改：`tests/appContent.test.tsx`
- 修改：`tests/budgetsView.test.tsx`

**红：**

1. 为初始 `activeBudgetTab = 'overview'` 添加断言。
2. 为 `select-budget-tab` 切换及离开后保留状态添加 reducer 测试。
3. 为 `AppContent` 向预算视图传递受控标签添加渲染测试。
4. 将 `BudgetsView` 测试改为显式传入 `model`、`activeTab` 和切换回调，并断言三个标签。

运行：

```text
npm test -- tests/appNavigation.test.tsx tests/appContent.test.tsx tests/budgetsView.test.tsx
```

预期：新增类型、Props 和三标签断言失败。

**绿：**

1. 导出 Renderer 范围的 `BudgetTab` 类型。
2. 在 `AppNavigationState` 和 reducer 增加预算标签状态与动作。
3. 将预算标签回调从 `App` 经 `AppContent` 传入 `BudgetsView`。
4. 删除 `BudgetsView` 内部的 `activeTab` state，改用受控 Props。
5. 将标签扩展为 `overview`、`policies`、`pricing`，暂时复用现有内容保证类型闭合。

**重构：**

- 将预算与成本优化标签回调保持相同命名和数据流。
- 检查 reducer 动作不会意外修改项目选择或会话诊断状态。

### Task 2：统一预算工作台加载、错误和过期状态

**文件：**

- 修改：`src/renderer/components/AppContent.tsx`
- 修改：`src/renderer/components/BudgetsView.tsx`
- 修改：`tests/appContent.test.tsx`
- 修改：`tests/budgetsView.test.tsx`

**红：**

1. 添加预算加载状态仍显示页头与骨架的测试。
2. 添加预算错误状态仍显示页头与错误详情的测试。
3. 添加就绪过期状态显示状态横幅和标签内容的测试。
4. 断言 `AppContent` 不再生成独立的预算加载或错误页面。

运行：

```text
npm test -- tests/appContent.test.tsx tests/budgetsView.test.tsx
```

预期：`BudgetsView` 尚不接受内容模型，测试失败。

**绿：**

1. 将 `BudgetContentModel` 移到 `BudgetsView` 的公共导出边界。
2. `BudgetsView` 根据 `loading | error | ready` 显式渲染互斥内容。
3. 复用 `LoadingSkeleton`、`StatusBanner` 和成本优化页错误面板结构。
4. 简化 `AppContent` 的预算分支，只渲染 `BudgetsView`。
5. 数据未就绪时禁用页头预算动作。

**重构：**

- 提取清晰的就绪快照变量和具名状态布尔值，避免 JSX 中出现复合业务谓词。
- 保留过期快照的可用内容，不复制 stale 状态。

### Task 3：拆分总览与预算策略标签

**文件：**

- 修改：`src/renderer/components/BudgetsView.tsx`
- 修改：`src/renderer/components/BudgetSummary.tsx`
- 修改：`src/renderer/components/BudgetList.tsx`（仅在调用边界需要时）
- 修改：`src/shared/i18n/locales/en.ts`
- 修改：`src/shared/i18n/locales/zhCN.ts`
- 修改：`tests/budgetsView.test.tsx`
- 修改：`tests/budgetViewModel.test.ts`（仅在派生模型需要时）
- 修改：`tests/i18n.test.ts`

**红：**

1. 总览标签断言四张摘要卡、告警与未计价入口存在，策略表和筛选器不存在。
2. 策略标签断言范围筛选、周期筛选和策略表存在，摘要与告警不存在。
3. 摘要断言“已配置预算”来自 `snapshot.statuses.length`。
4. 中英文渲染断言新标签和新动作文案。

运行：

```text
npm test -- tests/budgetsView.test.tsx tests/budgetViewModel.test.ts tests/i18n.test.ts
```

预期：内容仍集中在旧概览，新增摘要和文案断言失败。

**绿：**

1. 将摘要与告警组织为 `overviewContent`。
2. 将筛选器与 `BudgetList` 组织为 `policiesContent`。
3. `BudgetSummary` 增加已配置预算指标并扩展为四卡。
4. 为三标签、已配置预算、预算设置和加载/错误状态补齐双语资源。
5. 使用显式 `switch` 或渲染函数返回当前标签内容。

**重构：**

- 保留现有 `buildBudgetViewModel` 作为筛选与告警派生的唯一入口。
- 不为可由快照计算的摘要数量新增 React state。

### Task 4：实现确定性的跨标签动作

**文件：**

- 修改：`src/renderer/App.tsx`
- 修改：`src/renderer/components/BudgetsView.tsx`
- 修改：`tests/appNavigation.test.tsx`
- 修改：`tests/budgetsViewInteraction.test.tsx`
- 修改：`tests/budgetsView.test.tsx`

**红：**

1. 系统通知导航断言进入预算策略标签并保留目标策略 ID。
2. 页头“添加预算”断言先选择策略标签，再打开新增抽屉。
3. 未计价模型“添加价格”断言选择价格标签并预填模型。
4. 无效聚焦策略 ID 被消费但不打开编辑抽屉。
5. 保存后保留目标标签并显示 Toast。

运行：

```text
npm test -- tests/appNavigation.test.tsx tests/budgetsViewInteraction.test.tsx tests/budgetsView.test.tsx
```

预期：通知和动作尚未驱动受控标签，测试失败。

**绿：**

1. 通知回调分派进入预算策略的导航动作。
2. 新增预算处理器调用 `onActiveTabChange('policies')` 并打开策略抽屉。
3. 补价处理器调用 `onActiveTabChange('pricing')` 并设置一次性模型目标。
4. 聚焦策略 effect 先选择策略标签，再按快照查找并打开编辑器，最后消费 ID。
5. 设置抽屉入口在所有就绪标签保持可用。

**重构：**

- 使用具名处理器集中跨标签动作，避免在 JSX 中重复状态更新顺序。
- 一次性 `focusedPolicyId` 与 `pricingTarget` 消费后立即清除，不复制到额外状态。

### Task 5：对齐工作台样式与响应式布局

**文件：**

- 修改：`src/renderer/styles/views.css`
- 修改：`tests/budgetsView.test.tsx`

**红：**

1. 通过结构类名断言预算工作台、四指标网格和策略内容容器存在。
2. 保留 `AccessibleTabs`、状态标签和列表动画结构断言。

运行：

```text
npm test -- tests/budgetsView.test.tsx
```

预期：新结构类名不存在。

**绿：**

1. 预算工作台使用与成本优化工作台一致的栅格间距。
2. 四摘要卡在宽屏使用四列，在现有响应式断点降为两列和单列。
3. 策略筛选、表格、页头动作和抽屉沿用现有 token。
4. 删除仅在确认已经失效且无需保留的重复样式；若不满足注释删除授权，则保留并通过更具体的新结构覆盖。

**重构：**

- 合并可安全共享的选择器，避免引入新的硬编码颜色、尺寸或断点。
- 运行 Prettier 检查样式格式。

### Task 6：定向回归与完整验证

**定向测试：**

```text
npm test -- tests/appNavigation.test.tsx tests/appContent.test.tsx tests/budgetsView.test.tsx tests/budgetsViewInteraction.test.tsx tests/budgetDrawer.test.tsx tests/modelPricingView.test.tsx tests/i18n.test.ts
```

**完整门禁：**

```text
npm test
npm run typecheck
npm run lint
npm run build
```

**差异检查：**

```text
git diff --check
git status --short
```

若完整门禁失败，区分本次回归、环境限制和既有失败；未全部通过前不声明完整验证。

## 3. 完成定义

- 三个预算标签及跨标签导航通过自动化测试。
- 预算加载、失败、过期和就绪状态由同一工作台组件负责。
- 总览与策略管理职责分离，双语文案和响应式样式完成。
- 现有预算 CRUD、阈值、价格和通知行为无回归。
- `npm test`、`npm run typecheck`、`npm run lint`、`npm run build` 全部通过。
- 工作区只包含本任务设计、计划、源码和测试变更，不包含无关格式化或用户文件修改。
