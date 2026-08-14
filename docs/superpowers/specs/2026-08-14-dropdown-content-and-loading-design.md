# 下拉内容界面与异步加载体验设计

## 1. 背景

项目当前包含两类下拉交互：

- 19 个原生 `select`，分布在语言、预算筛选、项目排序、会话筛选、成本分析筛选和设置表单等 10 个组件中；
- 预算模型与模型价格两个可输入组合框，已经使用 `combobox`、`listbox` 和 `option` 语义实现自定义候选弹层。

现有样式已经统一了原生选择框的边框、箭头、焦点和主题颜色，但 Windows/Electron 的原生选项弹层仍受平台渲染限制，候选间距、选中标记、长文本布局、空状态和加载状态无法稳定使用项目视觉规范。两个可输入组合框的弹层也各自维护相似样式，后续继续扩展会造成状态表现不一致。

成本优化页的项目候选来自异步用量扫描。首次扫描或保留旧结果的刷新过程中，页面头部可能已经显示项目筛选器，但候选仍未完成加载；当前空数组与“加载中”在界面上没有区别，用户无法判断是没有项目还是仍在等待。

## 2. 目标

- 为非编辑型选择场景提供统一、主题化的自定义下拉组件，替换现有原生 `select`。
- 统一下拉触发器、弹层、候选项、选中标记、禁用项、空状态、长文本和滚动区域的视觉表现。
- 保留现有值类型、筛选语义、设置保存语义和业务数据来源，不改变选择结果。
- 通用组件显式支持候选加载状态；异步候选加载时在弹层内显示 loading 提示，而不是呈现误导性的空列表。
- 首次加载时禁用尚不可用的候选选择；刷新期间若已有可用候选，则保留旧候选并同时提示正在更新。
- 完整支持鼠标、键盘、焦点恢复、ARIA 语义、双语文案和减少动画偏好。
- 不增加第三方依赖。

## 3. 非目标

- 不修改预算模型和模型价格两个可输入组合框的业务语义，也不把它们改成不能自由输入的普通下拉框。
- 不改变用量扫描、预算快照或成本优化快照的 IPC 契约和主进程加载流程。
- 不为同步候选制造人工延迟或伪 loading 动画。
- 不实现远程搜索、分页候选、虚拟列表或多选。
- 不修改筛选算法、默认选择、持久化格式、费用计算或未知模型处理规则。
- 不把页面级 skeleton 替换为下拉 loading；两者分别表达页面数据和候选数据的加载范围。

## 4. 现状与状态来源

### 4.1 同步候选

以下候选均由已经可用的内存数据或固定常量同步派生：

- 语言选择；
- 预算范围与周期筛选；
- 项目排序；
- 会话原因、严重程度和每页数量；
- 成本异常、节省建议和会话诊断筛选；
- 预测周期与预算策略选择。

这些下拉不展示 loading。候选为空时，只有确实允许空集合的动态筛选显示空状态；包含“全部”等固定项的筛选仍正常显示固定项。

### 4.2 异步候选

成本优化页的项目候选由 `App` 中的用量扫描结果 `result.summary.byProject` 派生。其加载模型区分为：

- 首次扫描：`loading` 为 `true` 且没有成功结果，候选不可用；
- 刷新旧数据：`loading` 为 `true` 且仍有上一次成功结果，旧候选可继续使用；
- 已完成：`loading` 为 `false`，显示最新候选；
- 扫描失败但有旧结果：保留旧候选，不伪装成仍在加载；页面现有 stale/error 提示继续负责解释数据新鲜度；
- 扫描失败且没有结果：由现有页面错误状态处理，下拉不单独构造错误文案。

`App` 将候选数组和明确的 `projectOptionsLoading` 状态传到 `AppContent` 与 `CostOptimizationView`。加载状态由现有 `loading` 和 `result` 派生，不新增重复 React state。

## 5. 通用非编辑型下拉组件

### 5.1 数据契约

新增 Renderer 通用组件，例如 `SelectMenu`。组件使用受控值，不保存业务选择状态。值支持现有场景需要的字符串和数字：

```ts
type SelectMenuValue = string | number;

interface SelectMenuOption<T extends SelectMenuValue> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface SelectMenuProps<T extends SelectMenuValue> {
  value: T;
  options: readonly SelectMenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel: string;
  emptyLabel: string;
  className?: string;
}
```

具体实现可以根据现有标签布局补充 `id` 或 `aria-labelledby`，但不得使用 `any`，也不得让组件依赖业务 namespace。所有用户可见状态文案由调用方通过 i18n 传入。

### 5.2 组件状态

组件只维护交互所需状态：

- 是否展开；
- 当前键盘活动候选索引；
- 弹层相对触发器的测量结果或放置方向。

当前显示标签、是否存在候选、是否只显示 loading 和是否禁用均从 props 派生，不复制到 state。值更新由调用方负责。

### 5.3 弹层与定位

下拉触发器保持在原布局中，候选弹层通过 React portal 渲染到 `document.body`，使用触发器的 `getBoundingClientRect()` 定位。这样可以避免设置抽屉、滚动面板和表格容器的 `overflow` 裁切候选内容。

- 默认在触发器下方展开；下方空间不足且上方空间更多时向上展开；
- 弹层最小宽度与触发器一致，并限制在当前视口内；
- 窗口尺寸变化时重新测量；父级或窗口滚动时关闭弹层，避免弹层与触发器错位；
- 点击弹层和触发器以外区域时关闭；
- 关闭后焦点保留或恢复到触发器，不跳到页面起点。

组件不依赖 Electron 主进程，也不访问文件系统。

## 6. 下拉内容界面

### 6.1 触发器

- 使用统一控件高度、圆角、内边距、边框、主题背景和右侧展开图标；
- 当前值单行省略，完整内容可通过现有可访问名称或 `title` 获取；
- 展开时同时改变边框、图标方向和 `aria-expanded`；
- hover、focus-visible、disabled 和 busy 状态使用主题 token；
- loading 且没有旧候选时，触发器不可提交新选择，并显示紧凑 loading 指示；
- 不能只依赖颜色表达展开、选中、禁用或 loading。

### 6.2 候选弹层

- 使用项目 overlay 背景、边框、圆角、阴影和紧凑滚动条；
- 候选项至少满足现有默认控件高度，并提供稳定的水平内边距；
- 当前选中项显示文字权重、左侧或背景强调以及独立的勾选图标；
- 键盘活动项和鼠标 hover 使用一致的高亮层，但选中状态仍保留独立标记；
- 长项目路径允许两行或安全断词，不让弹层无限变宽；
- 可选 `description` 使用次级文字，用于未来需要解释候选的场景；
- 禁用项显示原因或禁用文案，并从键盘可选择序列中排除；
- 候选多于可视高度时在弹层内部滚动，活动项变化时滚动到可见区域。

### 6.3 loading 与空状态

loading 行属于下拉内容的一部分，不替换整个页面：

- 没有旧候选时：弹层只显示不可选择的 loading 行，包含旋转指示和本地化文案；
- 有旧候选的刷新期间：loading 行固定显示在候选之前，旧候选仍可选择；
- 加载结束且动态候选为空：显示不可选择的空状态行；
- loading 行和空状态行不参与方向键导航，也不会触发 `onChange`；
- 不使用固定最短动画时长，数据返回后立即切换到真实候选。

通用英文与简体中文文案放在 `common` namespace，例如“正在加载选项…”和“没有可用选项”。业务需要更具体说明时由调用方覆盖。

## 7. 键盘与可访问性

非编辑型下拉遵循 ARIA combobox/listbox 模式：

- 触发器使用 `role="combobox"`、`aria-haspopup="listbox"`、`aria-expanded`、`aria-controls` 和 `aria-activedescendant`；
- 候选容器使用 `role="listbox"`，候选使用 `role="option"` 和 `aria-selected`；
- loading 通过 `aria-busy` 和可感知的 `role="status"` 文案暴露；视觉旋转图标设为 `aria-hidden="true"`；
- 支持 Enter、Space、ArrowDown 和 ArrowUp 打开；
- 支持 ArrowDown、ArrowUp、Home 和 End 在可选候选中移动；
- Enter 或 Space 选择活动项；Escape 关闭并保持触发器焦点；Tab 关闭并按文档顺序继续；
- 点击候选与键盘选择产生相同结果；
- 组件禁用时不可展开，loading 行和空状态行不可选择；
- 所有动画遵循 `prefers-reduced-motion`。

两个可输入组合框继续保留 `aria-autocomplete="list"` 和自由输入能力。它们的弹层视觉样式与通用下拉共享语义化 CSS 类或统一 token，但不强行复用非编辑型触发器逻辑。

## 8. 集成范围

### 8.1 替换原生选择器

以下组件中的原生 `select` 使用通用 `SelectMenu` 替换，保持原有受控值和回调：

- `LanguageSelector`；
- `BudgetsView`；
- `ProjectsView`；
- `SessionsView`；
- `CostOptimizationView`；
- `CostOptimizationSettingsDrawer`；
- `CostAnomalies`；
- `CostForecast`；
- `SavingsRecommendations`；
- `SessionDiagnosisList`。

迁移时优先让选项数组由现有常量或 `useMemo` 派生，不引入同步 props 到 state 的 `useEffect`。现有事件中的类型断言应尽量由泛型值类型替代。

### 8.2 异步项目候选

`App` 派生并传递：

```text
projectOptions = 上一次或当前成功扫描中的项目路径
projectOptionsLoading = loading
```

首次加载没有结果时，下拉显示 loading 且不可选择项目；刷新已有结果时显示 loading 行并保留旧项目。`CostOptimizationView` 的页面级 loading skeleton 继续显示成本快照加载状态，两种 loading 可以同时存在，因为它们分别代表项目候选和成本分析结果。

### 8.3 可输入组合框

`BudgetModelCombobox` 和 `PricingModelCombobox` 保留现有组件与业务测试，调整为与通用下拉共享以下视觉规则：

- overlay 尺寸、圆角、边框和阴影；
- 候选项间距、活动态、选中标记和禁用态；
- 弹层进入动画与 reduced-motion；
- 空候选时的明确空状态。

目前这两个组合框只在预算快照 ready 后出现，候选同步构建，因此不展示虚假的 loading。若未来候选改为单独异步请求，再通过显式 loading prop 接入相同状态行。

## 9. 错误与边界处理

- 当前值暂时不在候选中时，触发器继续显示受控值对应的安全回退文本，不自动修改业务值；
- 候选加载失败由拥有请求的页面现有错误或 stale 状态处理，通用组件不吞掉错误，也不猜测错误原因；
- 选项在弹层打开期间更新时，活动索引重新定位到当前选中项或首个可选项，不能指向已删除候选；
- 所有候选均禁用时显示原候选及禁用状态，键盘活动索引保持为空；
- portal 卸载、路由切换和组件卸载时移除 document/window 事件监听；
- 不读取、写入或上传 Codex 会话目录数据。

## 10. 测试策略

### 10.1 通用组件测试

- 点击触发器打开并选择候选；
- Arrow、Home、End、Enter、Space、Escape 和 Tab 行为；
- 当前选中项、活动项、禁用项和 ARIA 关系；
- 点击外部关闭，关闭后触发器焦点正确；
- loading 无旧候选时显示状态且不触发选择；
- loading 有旧候选时同时显示状态行与可选候选；
- 空候选显示空状态；
- 候选更新后活动项不会越界；
- portal 弹层向上/向下放置及卸载清理使用稳定的 DOM 测量桩验证。

### 10.2 页面集成测试

- 语言、预算、项目、会话和成本筛选迁移后仍产生原有值；
- 数字页大小和字符串联合值保持类型与行为正确；
- 成本优化项目候选首次加载显示双语 loading；
- 刷新已有项目时旧候选仍可用并显示更新提示；
- 加载完成后 loading 消失并显示最新候选；
- 两个可输入组合框继续支持自由输入、键盘选择、禁用未知模型和字段错误。

### 10.3 样式与国际化测试

- 样式策略测试约束通用触发器、overlay、候选、状态行、选中标记和 reduced-motion；
- i18n 测试继续保证英文与简体中文 namespace 叶子 key 一致；
- 不使用低于现有最小字号的文字，不引入裸颜色值或不安全的 blanket transition。

### 10.4 完整验证

实现完成前运行受影响的最小测试集；声称完成前至少运行：

```text
npm test
npm run typecheck
npm run lint
```

本次不修改 Electron 主进程、preload、依赖或构建配置，`npm run build` 不是项目规则强制项；考虑到会新增 portal 组件并迁移多个页面，实施完成后仍建议运行一次生产构建验证 Renderer 打包。

## 11. 验收标准

- 所有非编辑型下拉不再依赖平台原生选项弹层，四套主题下的触发器和候选内容视觉一致；
- 下拉候选具有明确的 hover、键盘活动、选中、禁用、loading 和空状态；
- 长项目路径不会撑破页面或被无提示截断，候选过多时可在弹层内部滚动；
- 成本优化项目候选首次异步加载时显示 loading，刷新期间保留旧候选并提示更新；
- loading、空状态和禁用状态不会触发业务选择；
- 鼠标和键盘均可完成所有选择操作，焦点、ARIA 和 reduced-motion 行为正确；
- 现有筛选、排序、设置、分页和语言切换语义不变；
- 英文与简体中文文案完整；
- 不新增生产依赖，不改变 IPC、持久化格式和只读会话目录边界；
- 全量测试、类型检查和 lint 通过。
