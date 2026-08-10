# Renderer 第二阶段数据反馈与微交互动画实施计划

## 目标

完成数据状态与 KPI 更新、列表筛选/排序/新增编排，以及卡片、按钮、Tooltip、扫描状态和徽章微交互。

设计依据：`docs/superpowers/specs/2026-08-11-animation-feedback-phase-two-design.md`

## 变更边界

- 仅修改 Renderer 组件、纯工具函数、样式和相关测试。
- 不引入新依赖，不修改用户可见文案。
- 不修改 Electron 主进程、preload、IPC 或构建配置。
- 不主动提交 Git 变更。

## Task 1：建立数据更新基础能力

**文件：**

- Create: `src/renderer/components/AnimatedValue.tsx`
- Create: `src/renderer/utils/motion.ts`
- Create: `tests/animatedValue.test.tsx`
- Create: `tests/motion.test.ts`
- Modify: `tests/appNavigation.test.tsx`
- Modify: `src/renderer/App.tsx`

### Step 1：先写失败测试

覆盖：

- 列表延迟对负索引归零，正常索引递增，超过上限后保持最大延迟。
- `AnimatedValue` 首次渲染保留最终文案，值变化后替换 DOM 节点。
- 普通、预算、成本优化页面分别使用自身数据模型状态生成 transition key。

运行：

```powershell
npm test -- tests/motion.test.ts tests/animatedValue.test.tsx tests/appNavigation.test.tsx
```

预期：新模块与导出尚不存在，测试失败。

### Step 2：实现最小能力

- 实现具名步长和最大索引常量，以及纯延迟/style 函数。
- 实现 keyed `AnimatedValue`。
- 实现并接入 `getViewTransitionKey`。

### Step 3：运行测试并重构

运行同一测试集，确保纯函数不修改输入，组件不保存重复 state。

## Task 2：接入 KPI 与列表编排

**文件：**

- Modify: `src/renderer/components/MetricCard.tsx`
- Modify: `src/renderer/components/PerformanceSummary.tsx`
- Modify: `src/renderer/components/SessionsView.tsx`
- Modify: `src/renderer/components/ProjectsView.tsx`
- Modify: `src/renderer/components/BudgetList.tsx`
- Modify: `src/renderer/components/SessionDiagnosisList.tsx`
- Modify: 相关组件测试

### Step 1：先写失败测试

覆盖：

- Overview 与 Performance KPI 输出 `animated-value`。
- Sessions 项目筛选 key 和行 motion delay。
- Projects 搜索/排序 key 和项目行 motion delay。
- Budget 策略集合 key 和预算行 motion delay。
- Session Diagnostics 过滤 key 和诊断行 motion delay。

运行最小相关测试，确认新断言失败。

### Step 2：实现接入

- KPI 使用 `AnimatedValue`，保持原 test id 和格式化值。
- 列表使用纯延迟 style；filter/sort/data signature 只作为渲染 key，不进入业务状态。
- 长列表延迟保持上限。

### Step 3：运行最小测试并重构

运行：

```powershell
npm test -- tests/animatedValue.test.tsx tests/overviewTrend.test.tsx tests/performanceView.test.tsx tests/appContent.test.tsx tests/projectViewModel.test.tsx tests/budgetsView.test.tsx tests/sessionDiagnosisList.test.tsx
```

## Task 3：建立并实现微交互样式契约

**文件：**

- Modify: `tests/uiStylePolicy.test.ts`
- Modify: `tests/sidebar.test.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Modify: `src/renderer/styles/base.css`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/shell.css`
- Modify: `src/renderer/styles/views.css`

### Step 1：先写失败测试

覆盖：

- 样式包含 `data-value-enter`、`motion-list-item-enter`、Tooltip、扫描脉冲和徽章弹入关键帧。
- 卡片 hover 与按钮 active 只使用 transform/opacity/现有阴影 transition。
- Sidebar 徽章 key 包含当前数量。
- reduced-motion 覆盖所有新增动画和 transition。

### Step 2：实现样式与徽章重挂载

- 增加 KPI 与列表关键帧。
- 增加卡片、按钮、Tooltip、扫描状态和徽章微交互。
- 扩展 reduced-motion 规则。

### Step 3：运行样式契约与类型检查

```powershell
npm test -- tests/uiStylePolicy.test.ts tests/sidebar.test.tsx
npm run typecheck
```

## Task 4：全量验证

依次运行：

```powershell
npm test
npm run typecheck
npm run lint
```

若失败，定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。三项全部通过后才声明完成。

## 验收检查

- 页面数据状态与 KPI 更新有动画反馈。
- Sessions、Projects、Budgets、Diagnostics 列表有上限的 stagger 入场。
- 卡片、按钮、Tooltip、扫描点和徽章微交互完整。
- reduced-motion 下无新增移动或循环动画。
- 全量测试、类型检查和 lint 通过。
