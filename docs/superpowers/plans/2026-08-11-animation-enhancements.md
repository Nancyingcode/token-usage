# Renderer 第一阶段动画增强实施计划

## 目标

为主页面切换、侧边栏与 Tab 活动状态、预算与成本优化抽屉、确认框和 Toast 增加统一、可减弱且不改变业务语义的动画反馈。

设计依据：`docs/superpowers/specs/2026-08-11-animation-enhancements-design.md`

## 变更边界

- 修改 Renderer 组件、Hook、样式令牌和相关测试。
- 不引入动画依赖，不修改国际化文案。
- 不修改 Electron 主进程、preload、IPC 或构建配置。
- 不主动提交 Git 变更。

## Task 1：建立退场状态 Hook 回归测试

**文件：**

- Create: `tests/useExitTransition.test.tsx`
- Create: `src/renderer/hooks/useExitTransition.ts`

### Step 1：先写失败测试

覆盖：

- 初始输出 `idle` 状态。
- 普通模式请求退出后输出 `exiting`，尚未调用完成回调。
- 外层自身动画结束后只调用一次完成回调。
- 子元素冒泡的动画结束与重复退出请求不提前或重复完成。
- `prefers-reduced-motion: reduce` 下请求退出立即完成。

运行：

```powershell
npm test -- tests/useExitTransition.test.tsx
```

预期：因 Hook 尚不存在而失败。

### Step 2：实现最小 Hook

- 使用 `idle | exiting` 状态模型。
- 使用 ref 保存最新完成回调与本次待执行回调。
- 通过 `window.matchMedia` 判断减少动态效果。
- 暴露稳定的 `requestExit` 与 `handleAnimationEnd`。

### Step 3：运行单测并重构

运行同一测试文件，确保通过；整理类型、重复请求保护和事件目标判断。

## Task 2：接入抽屉、确认框和 Toast

**文件：**

- Modify: `tests/budgetDrawer.test.tsx`
- Modify: `tests/costOptimizationSettingsDrawer.test.tsx`
- Modify: `tests/useOverlayFocus.test.tsx`
- Modify: `src/renderer/components/BudgetDrawer.tsx`
- Modify: `src/renderer/components/ConfirmDialog.tsx`
- Modify: `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- Modify: `src/renderer/components/ToastNotice.tsx`

### Step 1：先写失败测试

覆盖：

- 抽屉关闭按钮先设置 `data-state="exiting"`，动画结束后调用 `onClose`。
- 成本优化设置抽屉遵循同一关闭顺序。
- 确认框取消和确认均等待退场结束，并只调用对应回调。
- Toast 自动和手动关闭先进入退出状态，动画结束后 dismiss。

运行：

```powershell
npm test -- tests/budgetDrawer.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/useOverlayFocus.test.tsx
```

预期：新断言失败。

### Step 2：接入 Hook

- 所有用户关闭入口改用 `requestExit`。
- 保存成功继续先执行 `onSaved`，再请求退出。
- 外层可动画元素输出 `data-state` 并监听自身 `animationend`。
- 退场期间保留现有 ARIA、键盘和焦点管理。

### Step 3：运行单测并重构

运行相同最小测试集，并补跑 `tests/useOverlayFocus.test.tsx`，确保 Escape 与焦点恢复逻辑没有回退。

## Task 3：建立页面与活动指示器样式契约

**文件：**

- Modify: `tests/accessibleTabs.test.tsx`
- Modify: `tests/sidebar.test.tsx`
- Modify: `tests/uiStylePolicy.test.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/tokens.css`
- Modify: `src/renderer/styles/shell.css`
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/styles/views.css`

### Step 1：先写失败测试

覆盖：

- 活动导航项继续暴露明确的 active class，活动 Tab 继续暴露 `aria-selected` 与 active class。
- 样式令牌包含进入、退出缓动与动效位移。
- 样式包含页面进入、抽屉退出、确认框进退场、Toast 退出、导航与 Tab 指示器。
- 减弱动画规则覆盖所有新增动画和 transition。
- Overview 直接布局选择器适配页面转场容器。

运行：

```powershell
npm test -- tests/accessibleTabs.test.tsx tests/sidebar.test.tsx tests/uiStylePolicy.test.ts
```

预期：样式契约新断言失败。

### Step 2：实现页面与控件动画

- 在 `App` 中增加 keyed `view-transition` 内容容器。
- 增加统一 motion tokens 和关键帧。
- 使用伪元素实现导航与 Tab 活动指示器。
- 补齐抽屉、确认框、Toast 进退场样式。
- 扩展 `prefers-reduced-motion` 规则。

### Step 3：运行最小测试并重构

运行：

```powershell
npm test -- tests/useExitTransition.test.tsx tests/budgetDrawer.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/useOverlayFocus.test.tsx tests/accessibleTabs.test.tsx tests/sidebar.test.tsx tests/uiStylePolicy.test.ts
npm run typecheck
```

检查选择器是否只动画 `opacity`、`transform` 与现有颜色属性，避免布局回退和 blanket transition。

## Task 4：全量验证

依次运行：

```powershell
npm test
npm run typecheck
npm run lint
```

若失败，定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。三项全部通过后才声明完成。

## 验收检查

- 主页面切换有统一进入动画，Overview 首屏布局保持。
- 两类抽屉、确认框与 Toast 有完整退场动画。
- 关闭、取消、确认、Escape、保存成功和定时 dismiss 回调只执行一次。
- 导航与 Tab 活动状态动画明确，键盘和 ARIA 行为不变。
- 减弱动画模式立即完成关闭且没有位移动画。
- 全量测试、类型检查和 lint 通过。
