# 性能页费用效率详情实施计划

## 目标

将性能页现有的单一已计价费用与错误的 Token 折线，替换为可解释的费用效率详情：展示估算/已计价费用、有效单位成本、会话均费、定价覆盖、费用构成，以及最近最多 30 个有数据日期的真实每日费用和精确日期详情。

## 架构

在共享计价模块中提取单次用量的普通输入、缓存输入和输出费用拆分，现有总费用计算复用该拆分并保持行为不变。在 Renderer 新增费用效率纯函数，将当前筛选后的 `UsageSummary`、价格表和未知模型兜底价格转换为稳定视图模型。独立费用详情组件消费该模型，负责汇总、覆盖条、费用构成、每日趋势、详情浮层和键盘焦点状态；`PerformanceView` 只负责组合性能指标。

该变更不修改主进程、IPC、preload、扫描器、持久化格式或 Codex 会话数据，并保留现有缓存详情和活跃时段详情。

## 任务 1：建立共享费用拆分回归测试

涉及文件：

- 修改 `tests/pricing.test.ts`
- 修改 `src/shared/pricing.ts`

步骤：

1. 为普通输入、缓存输入和输出费用拆分添加失败测试。
2. 验证三项费用之和与现有 `calculateUsageCost` 完全一致。
3. 验证缓存输入不会同时按普通输入价格重复计费，推理输出不会被二次计费。
4. 验证输入对象和价格对象保持不可变。
5. 运行 `npm test -- tests/pricing.test.ts`，确认测试因拆分函数尚未实现而失败。

## 任务 2：实现共享费用拆分

涉及文件：

- 修改 `src/shared/pricing.ts`
- 修改 `tests/pricing.test.ts`

步骤：

1. 定义稳定的费用拆分接口，字段为 `regularInputCostUsd`、`cachedInputCostUsd` 和 `outputCostUsd`。
2. 使用现有每百万 Token 常量和 `Math.max(inputTokens - cachedInputTokens, 0)` 计算三项费用。
3. 让 `calculateUsageCost` 对拆分结果求和，保持所有现有调用者行为不变。
4. 运行计价测试达到绿色，再消除重复公式。

## 任务 3：建立费用效率聚合回归测试

涉及文件：

- 新建 `tests/costEfficiency.test.tsx`
- 新建 `src/renderer/utils/costEfficiency.ts`

步骤：

1. 为完整定价下的总费用、每百万已计价 Token 单位成本、会话均费和三类费用构成添加失败测试。
2. 验证精确定价、兜底定价和未计价 Token 数与百分比。
3. 验证未计价 Token 不进入单位成本分母，未知模型 ID 被保留且不产生虚构费用。
4. 验证全部未计价、零 Token、真实零费用和无会话时的 `null` 语义。
5. 验证按用量切片本地日期聚合每日费用，只保留最近最多 30 个有数据日期并保持日期顺序。
6. 冻结 summary、pricing 和内部数组，验证聚合函数不修改输入。
7. 运行 `npm test -- tests/costEfficiency.test.tsx`，确认测试因功能尚未实现而失败。

## 任务 4：实现费用效率纯函数

涉及文件：

- 新建 `src/renderer/utils/costEfficiency.ts`
- 修改 `tests/costEfficiency.test.tsx`

步骤：

1. 定义覆盖、费用构成、每日详情和整体详情接口，明确不可计算指标使用 `number | null`。
2. 复用 `createPricingContext`、`priceTokenUsage`、共享费用拆分和 `buildDailyCostEstimates` 的计价语义。
3. 使用具名常量计算每百万 Token 单位成本、百分比和最近 30 日截取。
4. 对百分比作合法范围限制，对 Token 数作非负保护，不改变原始记录值。
5. 聚合精确定价、兜底定价、未计价覆盖和去重后的未计价模型 ID。
6. 汇总三类已计价费用，并保证其和与 `pricedCostUsd` 一致。
7. 运行费用效率聚合测试达到绿色，再提取汇总与每日复用逻辑。

## 任务 5：建立费用详情组件与接入回归测试

涉及文件：

- 新建 `tests/costEfficiencyCard.test.tsx`
- 修改 `tests/performanceView.test.tsx`

步骤：

1. 添加英文和简体中文的主值、有效单位成本、会话均费、定价覆盖、本地估算说明断言。
2. 验证精确定价、兜底定价和未计价覆盖图例包含 Token 数及百分比。
3. 验证普通输入、缓存输入和输出费用构成包含金额及占比，且明确只覆盖已计价部分。
4. 验证每日趋势使用每日费用，数据点拥有日期、费用、单位成本和覆盖详情的完整可访问名称。
5. 使用 DOM 事件验证鼠标悬停和键盘聚焦显示相同详情，移出和失焦后关闭。
6. 验证全部未计价、零 Token 和零已计价 Token 日期不会伪装成真实 `$0` 费用点。
7. 更新性能视图测试，验证费用宽卡片已接入，旧 Token `MiniLine` 已移除，并继续保留缓存详情、活跃时段和错误率。
8. 运行相关测试，确认它们因组件和文案尚未实现而失败。

## 任务 6：实现费用详情组件并接入性能页

涉及文件：

- 新建 `src/renderer/components/CostEfficiencyCard.tsx`
- 修改 `src/renderer/components/PerformanceView.tsx`
- 修改 `src/shared/i18n/locales/en.ts`
- 修改 `src/shared/i18n/locales/zhCN.ts`
- 修改 `src/renderer/styles/views.css`

步骤：

1. 让 `PerformanceView` 调用费用效率纯函数并将结果传给独立卡片组件。
2. 删除当前费用卡片对 `summary.byDay.totalTokens` 和 `MiniLine` 的复用；若无其他调用者则删除 `MiniLine` 及其专属常量。
3. 渲染动态的“估算费用/已计价费用”主值、本地估算说明、有效单位成本、会话均费和定价覆盖率。
4. 渲染精确定价、兜底定价和未计价覆盖条及文本图例，并列出未计价模型 ID。
5. 渲染普通输入、缓存输入和输出费用构成及文本图例。
6. 渲染最近最多 30 个有数据日期的费用趋势，只保存当前 hover/focus 日期这一独立交互状态。
7. 为趋势、覆盖条、构成条和逐日点提供完整可访问名称；颜色之外保留文本和状态说明。
8. 增加中英文资源，所有金额、Token、百分比和日期使用现有 locale formatter。
9. 让费用卡片宽屏跨两列、窄屏回落为单列；小屏趋势局部横向滚动，并提供 `:focus-visible` 与 reduced-motion 样式。
10. 运行组件、性能视图、国际化和样式相关测试达到绿色，再重构重复渲染分支和样式。

## 任务 7：最小验证与重构

1. 运行 `npm test -- tests/pricing.test.ts tests/costEfficiency.test.tsx tests/costEfficiencyCard.test.tsx tests/performanceView.test.tsx tests/i18n.test.ts`。
2. 运行 `npm run typecheck`，修正接口和 i18n 类型问题。
3. 运行 `npm run lint`，修正新增代码规范问题。
4. 检查费用分类和总费用的数值不变量、空值语义和输入不可变性。
5. 检查变更只覆盖计划文件，未格式化或改写无关代码。

## 任务 8：完整验证

1. 运行 `npm test`。
2. 运行 `npm run typecheck`。
3. 运行 `npm run lint`。
4. 运行 `git diff --check` 并审查最终变更范围。
5. 不主动提交、push 或创建 Pull Request。
