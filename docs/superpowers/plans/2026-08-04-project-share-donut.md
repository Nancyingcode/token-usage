# 项目占比环形图实施计划

## 目标

将项目页的可点击项目表替换为多分段环形图和颜色对应图例，通过鼠标 hover 和键盘 focus 显示项目详情，同时保留点击与键盘下钻到项目会话的行为。

## 架构

变更限定在 Renderer。`ProjectsView` 继续消费现有 `UsageProject[]`，新增纯函数根据项目 Token 计算每个 SVG 圆段的比例、累计偏移与浮层锚点。环形分段和常驻图例复用同一份几何数据与颜色序号，组件用受控的活动项目状态统一驱动 hover、focus、浮层和高亮；项目数据、聚合算法和导航回调保持不变。

## 任务 1：建立环形图结构与几何测试

涉及文件：

- 修改 `tests/analyticsViews.test.tsx`
- 修改 `tests/appContent.test.tsx`
- 新建 `tests/projectDonutGeometry.test.tsx`
- 删除 `tests/projectRowStyles.test.ts`

步骤：

1. 更新静态渲染断言，要求项目页包含环形图及中心总量，不再包含项目表行。
2. 添加项目分段可访问名称、点击和 Enter/Space 下钻测试。
3. 添加 hover/focus 显示详情、pointer leave/blur 隐藏详情测试。
4. 添加图例测试，证明每项显示同色标记、项目名称和百分比，并可高亮、点击对应项目。
5. 为纯几何函数添加多项目比例、累计偏移、锚点及零总量测试，并验证不修改输入。
6. 运行最小测试集，确认新测试因功能尚未实现而失败。

## 任务 2：实现环形图组件

涉及文件：

- 修改 `src/renderer/components/ProjectsView.tsx`

步骤：

1. 定义具名 SVG 几何常量、颜色数量和键盘激活键。
2. 实现纯函数，将项目数据转换为比例、圆周 dash、累计偏移和浮层锚点。
3. 用 SVG 轨道与项目圆段替换表格；中心显示总 Token。
4. 统一处理 pointer hover 与键盘 focus 活动状态。
5. 为分段添加 `role="button"`、`tabIndex`、本地化 `aria-label`、Enter/Space 激活和现有项目选择回调。
6. 渲染包含路径、占比、Token、会话数与最后活跃时间的 HTML 浮层。
7. 从同一分段数组渲染颜色一致的项目图例，并复用 hover/focus 与点击下钻行为。
8. 运行项目视图和几何测试，完成绿色阶段。

## 任务 3：补齐国际化与视觉样式

涉及文件：

- 修改 `src/shared/i18n/locales/en.ts`
- 修改 `src/shared/i18n/locales/zhCN.ts`
- 修改 `src/renderer/styles/views.css`

步骤：

1. 添加环形图名称、中心标签、分段可访问名称和详情字段的中英文资源。
2. 删除仅服务旧项目表的样式。
3. 添加图表面板、SVG 轨道、颜色循环、交互命中区、focus/hover 强调、详情浮层和图例样式。
4. 添加宽屏左右布局、窄窗口上下布局和 `prefers-reduced-motion` 处理，确保图例与浮层不撑开页面。
5. 运行受影响测试、TypeScript 和目标文件 lint，修复后重构重复逻辑。

## 任务 4：完整验证

1. 运行 `npm test`。
2. 运行 `npm run typecheck`。
3. 运行 `npm run lint`。
4. 检查最终 diff，确认没有修改聚合、主进程、preload 或无关文件，也未遗留旧项目列表结构。
