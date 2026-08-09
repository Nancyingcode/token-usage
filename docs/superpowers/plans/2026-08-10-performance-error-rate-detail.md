# 性能页错误率详情实施计划

## 目标

将性能页硬编码的 `0.00%` 占位卡片替换为基于本地 Codex JSONL 回合终态的错误率详情，展示成功、失败、中断、终态覆盖、每日趋势、错误类型与最近错误，同时保持扫描警告、工具失败和回合错误的语义边界。

## 技术路线

在现有 `sessionParser` 单次遍历中解析并去重回合终态，把规范化结果作为 `UsageSession.turnOutcomes` 随扫描结果传入 Renderer。新增纯函数构建错误率视图模型，再由独立 `ErrorRateCard` 负责双语、格式化、可访问趋势、类型分布与最近错误。全局周期继续先按会话开始时间筛选，性能聚合只消费筛选后的会话。

## 任务 1：扩展回合终态类型与解析器

**文件：**

- 修改：`src/shared/usageTypes.ts`
- 修改：`src/main/sessionParser.ts`
- 修改：`src/main/costOptimizationCacheStore.ts`
- 修改：所有构造 `UsageSession` 的测试夹具
- 修改：`tests/sessionParser.test.ts`
- 修改：`tests/costOptimizationCacheStore.test.ts`

**红：**

1. 新增解析器测试，分别构造 `task_started`、`task_complete`、`turn_started`、`turn_complete`、`error` 与 `turn_aborted` 事件；
2. 断言成功、终止错误和中断被归一化，重复错误不会产生多个终态；
3. 断言 `active_turn_not_steerable` 与 `thread_rollback_failed` 不产生失败终态，未知终止错误降级保留；
4. 运行 `npm test -- tests/sessionParser.test.ts`，确认新断言先失败。

**绿：**

1. 定义 `UsageTurnStatus`、`UsageTurnError` 和 `UsageTurnOutcome`；
2. 在解析器一次遍历内维护活跃回合、暂存错误和终态映射；
3. 使用完成事件为权威终态，兼容旧错误事件，按回合去重；
4. 使用外层时间戳作为时间字段降级，不猜测缺失终态；
5. 将成本优化缓存重建会话的 `turnOutcomes` 设为空数组；
6. 为全部测试会话夹具补充显式 `turnOutcomes: []`；
7. 运行解析器和成本缓存最小测试集达到绿色，再整理重复校验函数。

## 任务 2：实现错误率纯视图模型

**文件：**

- 新建：`src/renderer/utils/errorRateDetail.ts`
- 新建：`tests/errorRateDetail.test.ts`

**红：**

1. 测试失败率使用 `failed / (completed + failed)`；
2. 测试中断不进入分母、无可判定回合返回 `null`、真实零失败返回 `0`；
3. 测试会话覆盖、每日本地日期聚合、最近 30 日、稳定排序与输入不可变；
4. 测试已知错误分类、未知错误降级和最近 5 条错误；
5. 运行 `npm test -- tests/errorRateDetail.test.ts`，确认模块不存在或断言失败。

**绿：**

1. 实现稳定错误分类映射；
2. 聚合汇总、覆盖、每日趋势、类别与最近错误；
3. 对无效时间使用稳定降级，不修改输入对象；
4. 运行纯函数测试达到绿色，再提取百分比和排序辅助函数。

## 任务 3：实现错误率详情卡片

**文件：**

- 新建：`src/renderer/components/ErrorRateCard.tsx`
- 新建：`tests/errorRateCard.test.tsx`
- 修改：`src/shared/i18n/locales/en.ts`
- 修改：`src/shared/i18n/locales/zhCN.ts`
- 修改：`src/renderer/styles/views.css`

**红：**

1. 测试汇总区输出错误率、成功、失败、中断和终态覆盖；
2. 测试无终态显示 `—`，真实零错误显示 `0%`；
3. 测试趋势点包含完整 `aria-label` 且可聚焦；
4. 测试错误类型、最近错误、无错误状态和中英文文案；
5. 运行 `npm test -- tests/errorRateCard.test.tsx`，确认新测试先失败。

**绿：**

1. 实现跨两列宽卡片与响应式布局；
2. 实现固定 `0%–100%` 每日柱图、键盘/鼠标共用详情状态；
3. 实现带常驻文本的错误类别列表和语义化最近错误列表；
4. 增加中英文资源与 locale 数字、百分比、日期格式；
5. 增加焦点、小屏滚动和 reduced-motion 样式；
6. 运行组件与 i18n 测试达到绿色，再清理重复渲染分支。

## 任务 4：接入性能页并删除占位实现

**文件：**

- 修改：`src/renderer/components/PerformanceView.tsx`
- 修改：`tests/performanceView.test.tsx`

**红：**

1. 将原有“扫描警告仍固定为零”测试改为“扫描警告不影响回合错误率”；
2. 增加包含成功、失败和中断回合的性能页集成测试；
3. 断言旧的 `0.00% (0/N)` 与 `Donut` 占位结构不再出现；
4. 运行性能页测试，确认新断言先失败。

**绿：**

1. `PerformanceView` 调用 `buildErrorRateDetail` 并渲染 `ErrorRateCard`；
2. 删除 `APPLICATION_ERROR_*`、错误率专用 `Donut` 和不再使用的常量/导入；
3. 保留缓存、费用和活跃时段卡片顺序与行为；
4. 运行错误率相关最小测试集达到绿色。

## 任务 5：完整验证与范围审计

1. 运行：

   ```powershell
   & 'C:\Program Files\nodejs\npm.cmd' test
   & 'C:\Program Files\nodejs\npm.cmd' run typecheck
   & 'C:\Program Files\nodejs\npm.cmd' run lint
   & 'C:\Program Files\nodejs\npm.cmd' run build
   ```

2. 运行 `git diff --check`；
3. 检查变更只包含设计、计划、回合终态、错误率详情及受类型影响的夹具；
4. 确认没有修改、删除或上传 Codex 会话数据；
5. 若任何门禁失败，定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。

## 完成标准

- 所选范围内有明确终态时，性能页展示真实回合错误率；
- 无终态时显示不可计算，扫描警告和工具失败不被误计；
- 成功、失败、中断、覆盖、每日趋势、类型分布和最近错误均有可靠数据与双语可访问展示；
- 最小测试与完整测试、类型检查、lint、build 全部通过。
