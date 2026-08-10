# 概览活动日历 GitHub 式布局实施计划

## 目标

将概览页活动区域调整为 53 周 × 7 天的年度自然周日历，增加月份标签、强度图例，以及鼠标悬停和键盘聚焦均可见的单日 Token tooltip。

设计依据：`docs/superpowers/specs/2026-08-10-overview-activity-calendar-design.md`

## 变更边界

- 修改活动日历的纯数据模型、Overview 活动区域、相关样式和中英文资源。
- 不修改全局周期筛选、Token 聚合、Electron 主进程、preload 或构建配置。
- 不主动提交 Git 变更。

## Task 1：建立自然周日历模型回归测试

**文件：**

- Modify: `tests/activityGrid.test.tsx`
- Modify: `src/renderer/utils/activityGrid.ts`

### Step 1：先写失败测试

覆盖：

- 371 个单元从周日开始、到周六结束。
- 扫描日位于最后一个自然周，扫描日之后的日期标记为未来占位。
- Today、Week、Month、All time 周期边界不包含未来日期。
- 强度最大值忽略未来日期与周期外日期。
- 模型提供 53 个周列所需的星期索引和月份标签位置。

运行：

```powershell
npm test -- tests/activityGrid.test.tsx
```

预期：新断言失败。

### Step 2：实现最小模型

- 以 UTC 计算扫描日所在周的周日和周六。
- 固定生成 53 × 7 个日期单元。
- 为单元提供周索引、星期索引、`isFuture` 与现有周期/强度状态。
- 导出纯函数生成月份标签槽位。

### Step 3：运行单测并重构

运行同一测试文件，确保通过；整理具名常量和日期辅助函数，不修改输入对象。

## Task 2：建立活动日历渲染与 tooltip 回归测试

**文件：**

- Modify: `tests/overviewTrend.test.tsx`
- Modify: `src/renderer/components/Overview.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`

### Step 1：先写失败测试

覆盖：

- 输出月份标签行、星期标签列、53 周 × 7 天网格和“少—多”图例。
- 周期内日期具有 `role="img"`、键盘焦点和本地化 `aria-label`。
- 未来日期与周期外日期不可聚焦且对辅助技术隐藏。
- hover / focus 显示包含本地化日期与 Token 数量的 tooltip。
- mouseleave / blur 关闭 tooltip。

优先使用项目现有 Vitest + React 测试能力；如现有配置没有 DOM 运行环境，则把活动状态转换和 tooltip 文案提取为可单测的纯函数，并保留结构渲染断言，不引入新依赖。

运行：

```powershell
npm test -- tests/overviewTrend.test.tsx
```

预期：新断言失败。

### Step 2：实现组件与国际化

- `ActivityGrid` 只保存 `activeDate`。
- hover 和 focus 共用打开逻辑，mouseleave 和 blur 共用关闭逻辑。
- tooltip 使用当前活动单元的派生数据，左右边缘使用对齐 class。
- 使用 locale formatter 生成月份和完整日期。
- 英文与简体中文同步增加强度图例文案；复用或调整 `activityDay`。

### Step 3：运行单测并重构

运行 Overview 与 i18n 最小测试集：

```powershell
npm test -- tests/activityGrid.test.tsx tests/overviewTrend.test.tsx tests/rendererI18n.test.tsx
```

## Task 3：实现 GitHub 式布局与响应式样式

**文件：**

- Modify: `src/renderer/styles/views.css`

### Step 1：调整布局

- 月份标签与 53 个周列共享列尺寸和间距。
- 日期网格固定 7 行并按列填充。
- 星期标签使用相同格子高度和间距精确对齐。
- 添加底部强度图例、未来占位、活动态轮廓和 tooltip 样式。

### Step 2：调整窄窗口

- 删除将活动网格改为 14 列的窄屏规则。
- 使用横向滚动保留 53 周年度自然周结构。
- tooltip 禁止指针事件，并在左右边缘切换对齐。

### Step 3：最小验证

运行：

```powershell
npm test -- tests/activityGrid.test.tsx tests/overviewTrend.test.tsx tests/rendererI18n.test.tsx
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

- 53 个自然周从左到右排列，每列周日到周六。
- 月份、星期和色阶图例与当前语言一致。
- hover 与键盘 focus 都能显示单日 tooltip。
- 未来、周期外和零用量状态可区分。
- 窄窗口不破坏自然周结构。
- 全量测试、类型检查和 lint 通过。
