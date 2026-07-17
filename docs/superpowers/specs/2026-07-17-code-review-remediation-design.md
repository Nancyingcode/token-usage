# 代码审查问题分层修复设计

## 背景

本次修复针对 `style-guide.md` 代码审查中确认的六类问题：JSONL 运行时类型不安全、Error Rate 语义错误、扫描流程扩展性不足、魔法值与重复 IPC 通道、代码规范缺少 ESLint 约束，以及日期格式化重复。

项目继续使用 ESLint 10 原生扁平配置，不安装 `eslint-config-airbnb`、`eslint-plugin-import`、`eslint-plugin-jsx-a11y`、`eslint-plugin-react` 或其他 Airbnb 相关依赖。

## 目标

- 单条合法但结构异常的 JSONL 数据不会中断整个会话解析。
- Token 字段仅接受有限且非负的数字，异常字段不会污染统计结果。
- Error Rate 固定显示为 `0%`，扫描 warning 不再被解释为应用错误。
- 扫描大量会话文件时使用有上限的并发，避免完全串行读取。
- 扫描辅助函数不修改传入参数，并避免递归收集中的重复数组复制。
- IPC 通道、图表布局参数和格式化逻辑具有单一来源。
- 普通函数使用 `const` 函数表达式，React 组件继续使用 `React.FC`。
- ESLint 使用原生规则约束已选定的代码规范。

## 非目标

- 不改变 Token 统计口径和滚动周期定义。
- 不引入第三方数据校验库、并发库或格式化库。
- 不完整复刻 Airbnb ESLint 配置中的全部规则。
- 不调整界面布局、视觉样式或导航结构。
- 不把扫描 warning 转换为 Error Rate 数据。

## 分层修复方案

### 第一层：解析可靠性与指标正确性

#### JSONL 运行时校验

`JSON.parse` 的结果首先保持为 `unknown`。解析器使用小型类型守卫确认记录、payload、info 和 Token 数据都是普通对象，再读取字段。

Token 字段允许缺失，缺失值按 `0` 处理；存在的字段必须是有限且非负的数字。记录不是对象、关键结构类型错误或 Token 字段类型非法时，该行生成一条包含源文件和行号的 warning，并跳过该行的 Token 数据。其余合法行继续参与同一会话统计。

该策略将异常隔离到单行，不让 `null`、数组、字符串数字、`NaN` 等数据导致整个会话被扫描器丢弃。

#### Error Rate

当前系统没有采集应用运行错误，因此 Performance 页面中的 Error Rate 固定为 `0.00%`，计数固定为 `0 / 会话数`，环形图显示完整成功状态。

扫描 warning 仍保留在会话状态、侧边栏计数和 Wrapped 页面，不参与 Error Rate。原有基于 warning 数量计算 Error Rate 的共享函数将删除，避免继续传播错误语义。

### 第二层：扫描流程与模块边界

#### 目录扫描

目录扫描函数直接返回本层发现的文件和 warning，不接收可变 warning 参数。子目录扫描通过 `Promise.all` 执行，最终使用 `flat` 合并结果，避免每处理一个目录项都复制一次累计数组。

所有文件路径在返回前统一排序，保证后续处理输入稳定。

#### 文件读取

会话文件读取使用固定并发上限。内部并发映射工具预先创建结果数组，通过有限数量的 worker 获取下一个索引并写回原位置，从而同时满足：

- 不一次启动所有文件读取；
- 不完全串行处理；
- 输出顺序与排序后的文件顺序一致；
- 单文件失败只产生该文件对应的 warning。

扫描器最终集中合并会话 warning、文件读取 warning 和目录扫描 warning，再构建统计汇总。

### 第三层：规范落实与共享工具

#### 常量

新增共享 IPC 通道常量，主进程与 preload 共同引用，消除重复的 `usage:scan` 字符串。

Overview 与 Performance 图表的 viewBox、边界、网格数量、间距、半径和百分比刻度使用具名常量。`0`、`1` 等通用数学单位可保留，具有布局或业务含义的数值必须命名。

#### 函数风格

生产代码和测试中的普通函数声明改为 `const` 函数表达式。默认导出函数先声明具名常量，再在文件末尾导出。React 组件保持现有 `React.FC<Props>` 形式。

#### ESLint

在现有 ESLint 10 配置上增加原生规则，不新增 Airbnb 依赖：

- `func-style`：要求函数表达式；
- `no-param-reassign`：禁止重新赋值或修改参数属性；
- `prefer-const`：不重新赋值的变量使用 `const`；
- `eqeqeq`、`curly`、`object-shorthand`、`prefer-template`：落实低噪声的基础规则；
- `no-magic-numbers`：仅用于生产源码，忽略常见数学单位、数组索引和默认值；测试数据不启用该规则。

若 ESLint 规则对 TypeScript 语法产生误报，优先缩小规则作用范围或调整明确的忽略项，不通过禁用整个规范层规避问题。

#### 格式化工具

新增 renderer 格式化工具模块，集中提供紧凑数字、普通数字和短日期时间格式化。组件不再从 `MetricCard` 导入纯格式化函数，避免工具逻辑依附于 UI 组件。

## 数据流

1. 主进程递归发现 JSONL 文件并收集目录 warning。
2. 有限 worker 并发读取文件，每个文件交给解析器处理。
3. 解析器逐行执行 JSON 语法解析和运行时结构校验。
4. 有效 Token 数据进入会话统计；异常行仅追加 warning。
5. 扫描器按稳定顺序合并会话和 warning，生成 UsageScanResult。
6. renderer 使用共享格式化工具展示统计；Error Rate 使用固定零值。

## 错误处理

- JSON 语法错误：记录行级 warning，继续下一行。
- JSON 结构错误：记录行级 warning，继续下一行。
- Token 字段非法：忽略该行 Token 数据并记录 warning。
- 文件读取失败：保留其他文件结果，并记录文件级 warning。
- 目录读取失败：保留其他已发现目录结果，并记录目录级 warning。
- 格式化函数收到无效日期：返回稳定占位文本，避免 renderer 因 `RangeError` 中断。

## 测试策略

- 为解析器增加 `null`、数组、字符串 Token、负数 Token 和部分合法数据混合场景。
- 为 Error Rate 增加 Performance 静态渲染测试，确认存在多个 warning 时仍显示 `0.00%` 和非负环形图数据。
- 为扫描器增加临时目录测试，覆盖多文件稳定排序、单文件异常隔离和目录 warning 返回。
- 为共享格式化工具增加数字、紧凑数字、有效日期和无效日期测试。
- 保留现有滚动周期、趋势图、菜单策略和 Token 汇总回归测试。
- 最终执行 `npm test`、`npm run lint`、`npm run typecheck` 和 `npm run build`。

## 完成标准

- 六项审查结果均有对应代码修复或自动化约束。
- 新增异常数据测试通过，原有测试无回归。
- ESLint、Prettier、TypeScript 和 Electron 构建全部通过。
- `package.json` 不出现任何 Airbnb 相关依赖。
- 不修改用户现有的 `package-lock.json` 未提交变更，除非实施阶段确认该变更是本次依赖操作所必需；本方案不需要新增依赖。
