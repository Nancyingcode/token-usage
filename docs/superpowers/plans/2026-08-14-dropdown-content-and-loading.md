# 下拉内容界面与异步加载体验实施计划

## 目标

按照已确认的《下拉内容界面与异步加载体验设计》，新增无第三方依赖的通用非编辑型下拉组件，替换 Renderer 中 19 个原生 `select`，统一候选弹层、键盘、选中、禁用、空状态和主题样式；同时让成本优化页的异步项目候选在首次加载和保留旧结果的刷新期间显示准确的 loading 提示。预算模型和模型价格两个可输入组合框保留自由输入语义，仅统一候选弹层视觉与空状态。

## 实现原则

- 非编辑型下拉使用受控值；业务选择状态继续由现有页面持有。
- loading、是否有旧候选和显示标签均从现有 props 派生，不新增重复 state。
- 通用组件只处理交互、定位和展示，不依赖预算、成本或会话业务类型。
- portal、document 和 window 事件监听只在展开期间存在，并在关闭或卸载时清理。
- 当前选择、键盘活动、禁用、loading 和空状态均提供非颜色提示。
- 所有新增文案同步维护英文和简体中文资源。
- 行为代码按红—绿—重构推进；每批迁移先运行最小相关测试，再执行完整门禁。
- 不修改 Electron 主进程、preload、IPC、持久化格式和会话数据源边界。

## 任务一：建立通用下拉组件的行为契约

涉及文件：

- 新建 `tests/selectMenu.test.tsx`
- 新建 `src/renderer/components/SelectMenu.tsx`

步骤：

1. 先添加失败测试，覆盖受控值显示、点击展开、鼠标选择和点击外部关闭。
2. 覆盖 Enter、Space、ArrowDown、ArrowUp、Home、End、Escape 和 Tab，证明键盘只遍历可选候选。
3. 覆盖 `combobox`、`listbox`、`option`、`aria-expanded`、`aria-controls`、`aria-activedescendant` 和 `aria-selected` 关系。
4. 覆盖禁用候选、全部候选禁用、当前值不在候选和候选更新后活动索引不越界。
5. 覆盖无旧候选 loading、保留旧候选 loading、空状态以及这些状态不触发 `onChange`。
6. 覆盖 portal 渲染、向上/向下放置、窗口滚动关闭、卸载清理和关闭后的触发器焦点。
7. 运行 `tests/selectMenu.test.tsx` 确认红灯后，实现最小泛型值与候选契约、受控触发器、键盘状态机、外部点击和 portal 定位，使测试转绿。

实现时不得使用 `any`；DOM 测量使用稳定的具名常量和无副作用的放置计算纯函数，方便单元测试。

## 任务二：建立通用样式与双语状态文案

涉及文件：

- 修改 `src/renderer/styles/components.css`
- 修改 `src/renderer/styles/base.css`
- 修改 `src/renderer/styles/shell.css`
- 修改 `src/renderer/styles/views.css`
- 修改 `src/shared/i18n/locales/en.ts`
- 修改 `src/shared/i18n/locales/zhCN.ts`
- 修改 `tests/uiStylePolicy.test.ts`
- 必要时修改 `tests/i18n.test.ts`

步骤：

1. 先扩展样式策略测试，约束通用触发器、portal overlay、候选项、选中标记、禁用项、loading/empty 行和 reduced-motion。
2. 在 `common` namespace 同步增加“正在加载选项…”与“没有可用选项”文案。
3. 在 `components.css` 实现通用下拉样式，复用现有颜色、阴影、圆角、间距、运动和滚动条 token，不引入裸颜色或过小字号。
4. 为长项目路径提供安全断词与宽度上限，为多候选提供内部滚动。
5. loading 使用可见旋转指示与文字；reduced-motion 下停止旋转和弹层位移动画。
6. 迁移完成后只删除已经没有调用方的原生 `select` 专用样式，不改动输入框或其他控件规则。
7. 运行 `tests/uiStylePolicy.test.ts` 和 `tests/i18n.test.ts` 确认通过。

## 任务三：接入异步项目候选状态

涉及文件：

- 修改 `src/renderer/App.tsx`
- 修改 `src/renderer/components/AppContent.tsx`
- 修改 `src/renderer/components/CostOptimizationView.tsx`
- 修改 `tests/appContent.test.tsx`
- 修改 `tests/costOptimizationView.test.tsx` 或现有覆盖该页面的最小测试文件

步骤：

1. 先添加失败测试，证明首次扫描且没有成功结果时，成本优化项目下拉显示 loading、`aria-busy` 和不可选择状态。
2. 添加刷新测试，证明已有项目候选仍可选择，同时弹层显示“正在加载选项…”状态行。
3. 添加完成测试，证明 loading 消失并显示最新项目候选。
4. 在 `App` 从现有 `loading` 与 `result` 派生候选和候选加载状态，不添加新的 React state。
5. 通过 `AppContent` 把 `projectOptionsLoading` 传给 `CostOptimizationView`。
6. 使用通用 `SelectMenu` 替换成本优化项目原生选择器，保留空字符串代表全部项目、非空字符串代表项目路径的现有回调语义。
7. 页面级成本快照 skeleton 与候选 loading 保持独立，不改变现有错误和 stale 展示。

## 任务四：迁移应用外壳、预算、项目与会话选择器

涉及文件：

- 修改 `src/renderer/components/LanguageSelector.tsx`
- 修改 `src/renderer/components/BudgetsView.tsx`
- 修改 `src/renderer/components/ProjectsView.tsx`
- 修改 `src/renderer/components/SessionsView.tsx`
- 修改 `tests/languageSelector.test.tsx`
- 修改 `tests/budgetsViewInteraction.test.tsx`
- 修改 `tests/analyticsViews.test.tsx`
- 修改 `tests/titleBar.test.tsx`
- 修改其他直接断言原生 `combobox` 事件形状的相关测试

步骤：

1. 先更新组件测试，使其通过真实用户点击或键盘选择断言值，而不再直接构造 `HTMLSelectElement` change 事件。
2. 迁移语言选择，继续使用 `isSupportedLocale` 作为防御边界，保留禁用状态和标题栏可访问名称。
3. 迁移预算范围与周期筛选，保持 `BudgetFilters` 联合类型和默认值。
4. 迁移项目排序，保持 `ProjectSortKey` 类型与搜索输入布局。
5. 迁移会话项目、原因、严重程度和每页数量；数字页大小通过泛型数字值直接传递，不用字符串猜测。
6. 候选数组使用现有常量或 `useMemo` 派生，不用 `useEffect` 同步 props。
7. 每完成一个页面运行其最小测试，确认筛选、排序、分页和语言切换行为没有变化。

## 任务五：迁移成本分析与设置选择器

涉及文件：

- 修改 `src/renderer/components/CostAnomalies.tsx`
- 修改 `src/renderer/components/CostForecast.tsx`
- 修改 `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- 修改 `src/renderer/components/SavingsRecommendations.tsx`
- 修改 `src/renderer/components/SessionDiagnosisList.tsx`
- 修改 `tests/costOptimizationComponents.test.tsx`
- 修改 `tests/costOptimizationSettingsDrawer.test.tsx`
- 修改 `tests/sessionDiagnosticsView.test.tsx` 或实际覆盖诊断筛选的测试文件

步骤：

1. 先定位并更新现有测试；缺少交互覆盖的组件先补失败测试。
2. 迁移异常级别与严重程度、节省类型与置信度、诊断范围/原因/严重程度/置信度筛选。
3. 迁移预测预算策略选择，保留当前策略失效时的有效回退逻辑和显示标签。
4. 迁移设置抽屉预测周期，保持表单字符串值、校验、保存 pending 和错误展示。
5. 动态候选为空时显示明确空状态；包含“全部”固定项的筛选仍显示固定项。
6. 运行成本分析、设置和诊断相关最小测试，确认所有联合类型和值映射不变。

## 任务六：统一两个可输入组合框的候选内容体验

涉及文件：

- 修改 `src/renderer/components/BudgetModelCombobox.tsx`
- 修改 `src/renderer/components/PricingModelCombobox.tsx`
- 修改 `src/renderer/styles/views.css`
- 修改 `tests/budgetModelCombobox.test.tsx`
- 修改 `tests/pricingModelCombobox.test.tsx`

步骤：

1. 先添加空候选测试，证明弹层显示本地化空状态且方向键与 Enter 不产生选择。
2. 保留自由输入、当前目标、未知模型禁用项和字段错误的现有行为。
3. 复用通用 overlay、候选状态、选中标记和动画 token，避免两套弹层继续漂移。
4. 不传入虚假 loading；当前两个组件只在预算快照 ready 后出现，候选同步派生。
5. 运行两个组合框测试和模型价格页面集成测试。

## 任务七：回归验证与范围整理

1. 使用 `rg` 确认 Renderer 业务组件中不再残留原生 `<select>`；测试 fixture 或明确的兼容性边界除外。
2. 运行所有受影响测试文件，确认 portal 未残留 DOM、事件监听未泄漏、测试之间无状态污染。
3. 检查英文与简体中文资源叶子 key 一致，新增用户文案没有硬编码在业务组件中。
4. 检查 `git diff --check` 和变更列表，确认未修改主进程、preload、IPC、依赖或真实会话目录。
5. 串行运行完整质量门禁：
   - `npm test`
   - `npm run typecheck`
   - `npm run lint`
6. 额外运行 `npm run build`，验证 React portal、CSS 和所有懒加载页面可以正常打包。
7. 若检查失败，定位并修复本次引入的问题；不得删除测试、放宽有效断言、禁用规则或隐藏错误。

## 完成定义

- 19 个非编辑型下拉全部使用统一自定义弹层，不依赖 Windows 原生候选界面。
- 四套主题下的触发器、候选、选中、禁用、loading 和空状态一致。
- 成本优化项目候选首次加载显示 loading，刷新已有结果时保留旧候选并提示更新。
- 长路径、内部滚动、portal 定位和向上展开不会被抽屉或滚动容器裁切。
- 鼠标和完整键盘操作可用，焦点、ARIA、状态播报和 reduced-motion 正确。
- 所有现有筛选、排序、分页、设置、语言和可输入模型行为保持不变。
- 不新增依赖，不改变 IPC、持久化和只读会话数据源边界。
- 最小相关测试、全量测试、类型检查、lint 和生产构建全部通过。
