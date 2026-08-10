# Renderer 第二阶段数据反馈与微交互动画设计

## 1. 背景

第一阶段已经完成主页面进入、抽屉与 Toast 退场、侧边栏和 Tab 活动指示器，并建立统一动效令牌与减弱动画策略。剩余建议集中在三类状态变化：

1. 数据从加载态进入可用态或 KPI 数值更新时，缺少局部变化反馈。
2. 项目筛选、排序、诊断筛选和预算策略新增后，列表内容立即重排或出现。
3. 卡片悬浮、按钮按压、Tooltip 出现、扫描中状态和徽章更新仍以静态变化为主。

第二阶段在不引入动画库、不改变业务数据和交互语义的前提下补齐这些反馈。

## 2. 目标

1. 页面数据状态从 loading/error/empty 切换到 ready 时重新播放短页面进入动画。
2. Overview 与 Performance 的 KPI 值变化时播放短促的淡入位移动画。
3. Sessions、Projects、预算策略和会话诊断列表在筛选、排序或数据集合变化后分批进入。
4. 为指标卡、按钮、Tooltip、扫描状态点和导航徽章增加一致的微交互。
5. 所有新增动画使用现有 motion tokens，只动画 `opacity` 与 `transform`，并完整支持 `prefers-reduced-motion`。

## 3. 非目标

- 不实现数字逐帧计数或滚轮数字效果，避免读数过程中产生错误值。
- 不保留旧列表与新列表同时存在，不实现 FLIP 位移测量或退场重排。
- 不为纯装饰背景增加循环动画。
- 不改变筛选、排序、预算保存、诊断打开、刷新或 Tooltip 的业务逻辑。
- 不修改 Electron 主进程、preload、IPC、扫描和费用计算。

## 4. 数据状态与 KPI 更新

### 4.1 页面数据状态 key

`App` 的 `view-transition` key 从单一 `activeView` 扩展为“页面 + 当前页面所依赖的数据状态”：

- 普通用量页面使用 `AppContentModel.kind`。
- Budgets 使用预算模型的 `kind`。
- Cost Optimization 使用成本优化模型的 `kind`。

这样首次加载、错误恢复和空状态进入 ready 时会重新创建内容容器并播放进入动画；同一 ready 状态的后台刷新不会重挂整个页面。

### 4.2 可动画数值

新增 `AnimatedValue` 小组件，以显示字符串为 key 输出 `<strong>`。数值变化时 React 替换该节点，CSS 播放一次 `data-value-enter`。组件只展示已经格式化的最终值，不计算中间数值、不增加 live region，也不改变现有 locale formatter。

应用范围：

- Overview 的 `MetricCard`。
- Performance 的四个 summary KPI。

Overview 现有整页故事动画继续保留；局部数值动画用于同一页面 ready 数据更新与 Performance 更新。

## 5. 列表编排

### 5.1 延迟模型

新增纯函数生成列表项 CSS 自定义属性 `--motion-delay`：

- 每项延迟步长使用具名常量。
- 索引限制在 0 到固定上限，长列表后续项目共享最大延迟。
- 负索引按 0 处理。

这样可形成可感知顺序，同时避免 100 行列表产生数秒等待。

### 5.2 应用范围

- Sessions：项目筛选变化时重建数据表内容，行按当前顺序进入。
- Projects：搜索词或排序字段变化时重建 `tbody`，项目行按新顺序进入。
- Session Diagnostics：四个过滤条件变化时重建表体，诊断行依次进入。
- Budget List：策略集合或分组变化时重建分组内容，策略行依次进入。

列表项只播放进入动画。旧项立即卸载，避免两个列表在辅助技术和键盘顺序中并存。

## 6. 微交互

### 6.1 卡片

指标卡与 Performance summary card 在 hover 时轻微上移并增强现有阴影。卡片本身仍不是按钮，不增加点击手势或按钮语义；动效仅作为层次反馈。

### 6.2 按钮

可用按钮在 `:active` 时轻微缩放和下移，使用短时 transform transition。禁用按钮不响应。焦点轮廓规则保持不变。

### 6.3 Tooltip

HTML Tooltip 在挂载时淡入并短距离上移，覆盖趋势图、活动日历、项目圆环、缓存/费用趋势、小时分布和错误趋势。Tooltip 定位所需的现有 transform 不能被关键帧覆盖，因此动画只改变 `opacity`，并通过伪元素或兼容现有定位的方式提供视觉出现反馈；若选择直接动画 transform，必须保留各 Tooltip 的定位变量。

为降低选择器和定位冲突风险，本阶段统一使用 opacity 入场，卡片和列表承担主要位移动效。

### 6.4 扫描状态与徽章

- `scan-status--scanning` 的状态点播放低频缩放与透明度脉冲；其他状态静止。
- 导航徽章以“导航项 + 数量”为 key，数量变化时重新挂载并播放一次弹入。

## 7. 可访问性与减弱动画

- 不新增硬编码文案或 ARIA 文案。
- KPI 继续显示最终格式化值，不用动画生成辅助技术可读取的中间数字。
- 列表旧内容不会在动画期间重复存在。
- `prefers-reduced-motion: reduce` 下禁用 KPI、列表、卡片、按钮、Tooltip、扫描脉冲和徽章动画/transition。
- 键盘焦点、按钮按压、Tab 顺序和 Tooltip 的 hover/focus 打开逻辑保持不变。

## 8. 性能约束

- 只新增 `opacity` 与 `transform` 动画。
- 列表延迟有固定上限。
- 不使用 `transition: all`，不常驻 `will-change`。
- 不增加定时器、ResizeObserver 或布局测量。

## 9. 测试策略

1. 为列表延迟纯函数添加边界测试，覆盖负数、正常索引和上限。
2. 为 `AnimatedValue` 添加 rerender 测试，验证值变化替换节点且保留 test id 与文案。
3. 扩展 App 导航测试，验证不同页面选择正确的数据状态 key。
4. 扩展 Sessions、Projects、BudgetList 与 SessionDiagnosisList 测试，验证 motion class、延迟样式和筛选 key。
5. 扩展 UI 样式策略测试，约束 KPI、列表、卡片、按钮、Tooltip、扫描状态、徽章和 reduced-motion 规则。
6. 最终运行 `npm test`、`npm run typecheck`、`npm run lint`。

本次不修改构建配置、Electron 主进程、preload 或打包配置，无需额外运行 `npm run build`。

## 10. 预计变更范围

- `src/renderer/App.tsx`
- `src/renderer/components/AnimatedValue.tsx`
- `src/renderer/components/MetricCard.tsx`
- `src/renderer/components/PerformanceSummary.tsx`
- `src/renderer/components/SessionsView.tsx`
- `src/renderer/components/ProjectsView.tsx`
- `src/renderer/components/BudgetList.tsx`
- `src/renderer/components/SessionDiagnosisList.tsx`
- `src/renderer/components/Sidebar.tsx`
- `src/renderer/utils/motion.ts`
- `src/renderer/styles/base.css`
- `src/renderer/styles/components.css`
- `src/renderer/styles/shell.css`
- `src/renderer/styles/views.css`
- 相关测试文件

## 11. 验收标准

- 页面数据状态变化和 KPI 更新具有清晰但短促的反馈。
- 四类数据列表在筛选、排序或集合变化时按新顺序进入，长列表延迟有上限。
- 卡片、按钮、Tooltip、扫描状态和徽章具有统一微交互。
- 所有动画在 reduced-motion 下被禁用，现有键盘和 ARIA 行为无回退。
- 全量测试、类型检查和 lint 全部通过。
