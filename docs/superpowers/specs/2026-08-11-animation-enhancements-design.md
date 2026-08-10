# Renderer 第一阶段动画增强设计

## 1. 背景

项目已经具备概览指标卡入场、趋势线绘制、活动日历入场、抽屉入场、Toast 入场、骨架屏闪烁和部分图表数值过渡，但动效主要集中在概览页和单次入场。用户在侧边栏切换页面时内容立即替换；抽屉、确认框和 Toast 关闭时立即卸载；导航项和页内 Tab 主要依赖背景色或边框色切换，因此状态变化缺少连续的视觉反馈。

本次按已确认建议实施第一阶段动画增强，优先覆盖高频且能帮助理解状态变化的交互，不为静态内容增加持续运动。

## 2. 目标

1. 侧边栏切换主页面时，让新页面内容以短距离位移和淡入方式出现。
2. 为预算抽屉、成本优化设置抽屉、删除确认框和 Toast 补齐退场动画。
3. 为侧边栏活动项和可访问 Tab 增加清晰、连续的活动指示器动画。
4. 把时长、缓动和位移距离纳入现有视觉令牌，避免分散的动画魔法值。
5. 保持键盘操作、焦点陷阱、焦点恢复和 `prefers-reduced-motion` 行为正确。

## 3. 非目标

- 不引入第三方动画库。
- 不实现跨页面旧内容与新内容同时存在的双向转场。
- 不实现数字滚动、列表 FLIP 排序、复杂弹簧物理或持续背景动画。
- 不改变页面导航、预算保存、删除确认或 Toast 的业务语义。
- 不修改 Electron 主进程、preload、IPC、会话扫描或费用计算。

## 4. 动效语言

### 4.1 令牌

在 `tokens.css` 中保留现有三档时长，并补充：

- 标准进入缓动：用于页面、Toast 和控件指示器，快速启动并平滑落位。
- 标准退出缓动：用于弹层和 Toast 退场，避免退出拖沓。
- 小、中两档动效位移：控件使用小位移，页面与抽屉使用中位移。

所有新动画必须引用令牌。关键帧不硬编码独立时长或重复缓动曲线。

### 4.2 性能边界

页面、弹层、Toast、导航图标和指示器只动画 `opacity` 与 `transform`。颜色和背景沿用现有短时 transition。避免为布局属性设置全局 transition，也不使用 `transition: all`。

## 5. 页面切换

在 `App` 的 Toolbar 与页面内容之间增加以 `activeView` 为 key 的轻量内容容器。切换主页面时，新内容淡入并从下方短距离移动到原位。

容器使用 `display: contents` 保持 Overview 当前依赖主面板直接布局的 flex/grid 关系；动画施加到容器的直接可视子项。Overview 的直接子选择器同步适配这一层 DOM 关系，确保首屏无滚动布局不回退。

页面转场仅负责新页面进入，不保留旧页面等待退出。这样不会让两个复杂数据视图同时挂载，也不会扩大焦点、滚动位置和异步 Hook 的生命周期复杂度。

## 6. 弹层与 Toast 退场

新增公共 `useExitTransition` Hook，状态只有 `idle` 与 `exiting`：

1. 调用 `requestExit` 时，如果系统偏好减少动态效果，立即执行完成回调。
2. 普通模式下将状态切换为 `exiting`，由组件输出 `data-state="exiting"`。
3. 外层元素自己的退场动画结束时执行一次完成回调，父组件随后卸载弹层。
4. 重复关闭请求在退场期间被忽略，避免重复删除、重复取消或重复 dismiss。

抽屉的关闭按钮、取消按钮、Escape 与保存成功统一调用延迟关闭入口。确认框的取消与确认分别在退场结束后执行原回调。Toast 的自动关闭和手动关闭也先播放退场动画。

动画结束处理只接受 `event.target === event.currentTarget`，避免子元素动画冒泡导致提前完成。

## 7. 导航与 Tab 状态反馈

### 7.1 侧边栏

活动项左侧使用伪元素指示条，由低透明度、缩短状态过渡到完整高度。现有 inset 阴影指示条被移除，避免两套指示器重叠。hover 和 active 时图标进行极小水平位移，文本与徽章保持稳定。

### 7.2 可访问 Tab

每个 Tab 使用伪元素绘制底部指示条，非活动状态缩放为零，活动状态展开。继续保留 `role="tab"`、`aria-selected`、roving tabindex 和键盘方向键行为；动画不改变选择逻辑。

## 8. 减弱动画与可访问性

现有 `prefers-reduced-motion: reduce` 规则扩展到页面转场、弹层退场、Toast 退场、导航指示器、导航图标和 Tab 指示器：

- 页面与弹层不播放关键帧。
- 控件指示器立即显示最终状态，不做 transition。
- Hook 检测减弱动画后直接执行关闭回调，避免等待不会触发的 `animationend`。

弹层退场期间继续保留 DOM、ARIA 角色和焦点陷阱；真正卸载时仍由现有 `useOverlayFocus` 恢复触发器焦点。

## 9. 测试策略

遵循红—绿—重构：

1. 新增 Hook 测试，覆盖初始状态、普通退场、动画结束、重复请求和减少动态效果直接完成。
2. 扩展预算抽屉、确认框、成本优化抽屉和 Toast 测试，验证关闭请求先标记退场，动画结束后才调用原回调。
3. 扩展 Sidebar、AccessibleTabs 与 UI 样式策略测试，约束活动状态语义、动效令牌、页面转场和减少动态效果规则。
4. 运行受影响的最小测试集，再运行 `npm test`、`npm run typecheck`、`npm run lint`。

本次不修改构建配置、Electron 主进程、preload 或打包配置，无需额外执行 `npm run build`。

## 10. 预计变更范围

- `src/renderer/App.tsx`
- `src/renderer/hooks/useExitTransition.ts`
- `src/renderer/components/BudgetDrawer.tsx`
- `src/renderer/components/ConfirmDialog.tsx`
- `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- `src/renderer/components/ToastNotice.tsx`
- `src/renderer/styles/tokens.css`
- `src/renderer/styles/shell.css`
- `src/renderer/styles/components.css`
- `src/renderer/styles/views.css`
- 相关 Renderer 测试文件

## 11. 验收标准

- 切换任意主页面时，新页面有统一、短促的进入动画，Overview 首屏布局保持不变。
- 两类抽屉、确认框和 Toast 关闭时都有退场动画，回调只执行一次。
- Escape、关闭按钮、取消、确认、保存成功与自动 dismiss 均走正确关闭路径。
- 侧边栏和 Tab 的活动指示器有连续动画，ARIA 与键盘行为不变。
- 减弱动画模式下无位移动画，也不会因等待 `animationend` 而无法关闭。
- 全量测试、类型检查和 lint 全部通过。
