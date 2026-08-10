# 性能页概览与渐进式详情实施计划

## 1. 实施目标

按照已确认的《性能页概览与渐进式详情设计》，将当前全部展开的性能页重构为“常驻四项 KPI 概览 + 单一标签详情面板”，并保持现有指标口径、详情组件和全局周期筛选行为不变。

## 2. 任务拆分

### 任务一：建立性能概览回归测试

涉及文件：

- `tests/performanceView.test.tsx`
- `src/renderer/components/PerformanceSummary.tsx`（后续绿灯阶段新增）

红—绿—重构：

1. 先为英文与中文渲染增加失败断言，要求常驻显示缓存命中率、有效单位成本、高峰时段和回合错误率四个概览指标。
2. 增加边界断言，区分不可计算的 `—`、真实零错误、计价不完整和无法按小时分配活动。
3. 新增 `PerformanceSummary` 与通用概览卡结构，只消费现有四个视图模型并使用 locale formatter。
4. 提取重复的概览标签、主值、辅助数据和状态结构，确保组件不保存可推导状态。
5. 运行 `tests/performanceView.test.tsx`。

### 任务二：建立详情标签切换回归测试

涉及文件：

- `tests/performanceView.test.tsx`
- `src/renderer/components/PerformanceView.tsx`

红—绿—重构：

1. 先将需要交互的测试改为 Testing Library 渲染，断言默认只存在缓存详情。
2. 添加鼠标点击测试，分别选择费用、活跃时段和可靠性，断言任意时刻只渲染一个详情组件。
3. 添加键盘切换集成测试，确认现有 `AccessibleTabs` 的方向键行为在性能页正常工作。
4. 在 `PerformanceView` 中增加 `PerformanceDetailKey` 和唯一的 `activeDetail` 状态。
5. 接入 `AccessibleTabs`、稳定的 tab/panel id 与条件详情渲染。
6. 将活跃时段包装为当前标签下的全宽详情面板。
7. 使用 `useMemo` 缓存四个现有聚合结果，避免标签切换重复聚合。
8. 运行 `tests/performanceView.test.tsx` 与 `tests/accessibleTabs.test.tsx`。

### 任务三：补充国际化文案

涉及文件：

- `src/shared/i18n/locales/en.ts`
- `src/shared/i18n/locales/zhCN.ts`
- `tests/i18n.test.ts`
- `tests/performanceView.test.tsx`

红—绿—重构：

1. 先通过性能页测试声明新增文案需求。
2. 同步增加四个详情标签、概览无障碍名称、有效单位成本标题和概览辅助/状态文案。
3. 优先复用现有缓存、费用、活跃时段和错误率文案，避免产生同义重复资源。
4. 运行性能页与 i18n 最小测试集。

### 任务四：实现概览与全宽详情样式

涉及文件：

- `src/renderer/styles/views.css`
- `tests/uiStylePolicy.test.ts`
- `tests/performanceView.test.tsx`

红—绿—重构：

1. 先通过结构断言确定概览网格、概览卡、标签详情和活跃时段全宽容器的类名。
2. 增加四列自适应 KPI 网格、统一卡片层级、等宽数字和文本状态样式。
3. 增加性能详情标签容器与全宽面板布局，移除当前性能页两列网格造成的空列依赖。
4. 在中等与窄窗口下分别切换为两列和单列 KPI；确保详情标签可换行或横向容纳。
5. 有失败回合时才使用危险状态类，真实零错误保持中性/品牌视觉，并保留可见文字。
6. 尊重现有 token、焦点样式和 reduced-motion 规则，不顺带整理性能页之外的 CSS。
7. 运行性能页与样式策略最小测试集。

### 任务五：回归验证与收尾

1. 运行详情组件最小回归集：缓存、费用、活跃时段、错误率和性能页测试。
2. 检查 Git diff，确认未修改无关文件，未覆盖工作区原有的未跟踪设计文档。
3. 运行 `npm test`。
4. 运行 `npm run typecheck`。
5. 运行 `npm run lint`。
6. 仅在三项全量检查全部通过后声明实施完成。

## 3. 预计新增或修改文件

- `docs/superpowers/plans/2026-08-10-performance-view-progressive-disclosure.md`
- `src/renderer/components/PerformanceSummary.tsx`
- `src/renderer/components/PerformanceView.tsx`
- `src/renderer/styles/views.css`
- `src/shared/i18n/locales/en.ts`
- `src/shared/i18n/locales/zhCN.ts`
- `tests/performanceView.test.tsx`
- 必要时更新 `tests/i18n.test.ts` 或 `tests/uiStylePolicy.test.ts`

## 4. 实施约束

- 不修改四类指标的纯函数聚合口径。
- 不猜测未知模型价格，不把本地费用估算描述为实际账单。
- 不读取或修改 Codex 会话目录。
- Renderer 不新增文件系统访问。
- 新增文案必须同步维护英文与简体中文。
- 交互必须支持鼠标与标准标签键盘操作，状态不能只通过颜色表达。
- 不包含工作区中与本任务无关的 `2026-08-10-latest-model-cost-optimization-design.md`。

## 5. 完成定义

- 四项 KPI 在性能页首屏常驻，并正确处理正常值、缺失值和零错误。
- 默认只渲染缓存详情，四个详情可通过标签切换。
- 未选中详情不留在 DOM 中，活跃时段占满详情宽度。
- 中英文、locale formatter、ARIA tab/panel 关系和响应式布局符合设计。
- 最小回归测试与全量测试、类型检查、lint 全部通过。
