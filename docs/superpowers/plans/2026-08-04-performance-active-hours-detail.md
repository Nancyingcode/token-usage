# 性能页活跃时段详情实施计划

## 目标

将性能页现有的“最近 12 个会话柱形”替换为基于本地时间和 Token 用量切片的 24 小时分布，在卡片内展示高峰摘要、常驻时间轴以及可通过鼠标和键盘查看的精确小时详情。

## 架构

在 Renderer 新增纯函数模块，把当前筛选后的 `UsageSession[]` 转换为固定 24 个小时桶和稳定的峰值结果。独立的活跃时段组件消费该视图模型，负责摘要、图表、详情浮层和键盘焦点状态；`PerformanceView` 只负责组合现有指标与新组件。统计和界面均不修改扫描数据，也不引入主进程或 IPC 变更。

## 任务 1：建立小时聚合回归测试

涉及文件：

- 新建 `tests/hourlyActivity.test.tsx`
- 新建 `src/renderer/utils/hourlyActivity.ts`

步骤：

1. 为固定 24 个桶和 Token 占比添加失败测试。
2. 为跨小时用量切片、同会话按小时去重和活跃日期去重添加失败测试。
3. 为无切片会话按 `startedAt` 回退、无效时间戳不分配和零用量状态添加失败测试。
4. 为峰值的 Token、会话数、活跃天数、小时顺序并列规则添加失败测试。
5. 验证聚合函数不修改传入的会话和切片对象。
6. 运行 `npm test -- tests/hourlyActivity.test.tsx`，确认测试因功能尚未实现而失败。

## 任务 2：实现小时聚合纯函数

涉及文件：

- 新建 `src/renderer/utils/hourlyActivity.ts`
- 修改 `tests/hourlyActivity.test.tsx`

步骤：

1. 定义小时桶、聚合结果和分配记录的明确类型。
2. 将有效用量切片按本地小时与本地日期加入桶；同会话、同日期分别使用集合去重。
3. 对没有有效切片的会话使用会话总 Token 和 `startedAt` 回退。
4. 以已分配 Token 为分母计算占比，并输出未分配 Token 供界面解释边界状态。
5. 实现稳定峰值选择；全零时返回空峰值。
6. 运行小时聚合测试达到绿色，再消除重复逻辑并保持纯函数不修改输入。

## 任务 3：建立活跃时段视图与交互回归测试

涉及文件：

- 修改 `tests/performanceView.test.tsx`
- 视测试职责新建 `tests/hourlyActivityChart.test.tsx`

步骤：

1. 构造包含跨小时切片的会话数据，要求性能页输出 24 个小时柱，而不是 12 个会话柱。
2. 添加高峰区间、Token、占比、会话数、活跃天数和本地时间说明的中英文渲染断言。
3. 添加常驻 `00:00`、`06:00`、`12:00`、`18:00`、`24:00` 轴标签断言。
4. 使用 DOM 渲染测试验证小时柱 hover/focus 显示相同详情，移出/失焦后关闭。
5. 验证小时柱拥有包含完整数据的本地化可访问名称，且峰值拥有不依赖颜色的文本标记。
6. 验证零 Token 和全部时间无效时分别显示正确的本地化边界状态。
7. 运行相关测试，确认它们因新组件尚未实现而失败。

## 任务 4：实现活跃时段组件并接入性能页

涉及文件：

- 新建 `src/renderer/components/HourlyActivityChart.tsx`
- 修改 `src/renderer/components/PerformanceView.tsx`
- 视引用情况保留或删除 `src/renderer/components/TokenBar.tsx`

步骤：

1. 让 `PerformanceView` 调用小时聚合纯函数，并将结果传给独立图表组件。
2. 在图表组件中渲染高峰摘要、24 根小时柱、常驻轴标签和本地时间说明。
3. 只保存当前 hover/focus 小时这一独立交互状态；所有统计结果由 props 推导。
4. 用鼠标进入/移出及键盘聚焦/失焦统一控制详情浮层。
5. 为每个小时柱添加完整本地化可访问名称，并以轮廓和“高峰”文本标记峰值。
6. 移除旧的 `PEAK_SESSION_COUNT`、高亮间隔和按最近会话绘制柱形的逻辑。
7. 运行小时聚合、图表和性能页测试达到绿色，再重构重复格式化与渲染分支。

## 任务 5：补齐国际化与响应式样式

涉及文件：

- 修改 `src/shared/i18n/locales/en.ts`
- 修改 `src/shared/i18n/locales/zhCN.ts`
- 修改 `src/renderer/styles/views.css`
- 视需要修改 `tests/uiStylePolicy.test.ts`

步骤：

1. 增加高峰区间、Token、占比、会话数、活跃天数、本地时间、小时详情和边界状态的中英文资源。
2. 设置 24 小时图的高度、网格线、柱间距、轴标签、峰值轮廓和浮层样式。
3. 宽屏平均分配 24 根柱；窄屏使用最小图表宽度和卡片内部水平滚动，禁止页面级水平溢出。
4. 限制浮层位置与宽度，使首尾小时在窄窗口中仍可读取。
5. 增加清晰的 `:focus-visible` 状态和非颜色峰值标记，并遵守 `prefers-reduced-motion`。
6. 运行受影响的最小测试、TypeScript 检查和目标文件 lint，修复后重构样式重复。

## 任务 6：完整验证

1. 运行 `npm test`。
2. 运行 `npm run typecheck`。
3. 运行 `npm run lint`。
4. 检查 `git diff --check` 和最终变更范围，确认没有修改主进程、preload、IPC、扫描器或无关文件。
5. 不主动提交、push 或创建 Pull Request。
