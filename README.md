# Codex Token Usage

## 成本优化

“成本优化”是独立的分析工作台，支持按全局周期和项目筛选本地 Codex 用量，并提供六个标签：

- 总览：当前费用、定价覆盖率、期末预测、异常数量和保守节省额
- 模型对比：实际模型成本与可配置候选模型的价格替代情景
- 异常消耗：按日、项目、模型和会话分层检测，并展示基线与贡献证据链
- 会话诊断：排列高影响会话，并解释输入增长、缓存复用下降、生成占比集中、模型成本主导和交互累积五类原因
- 趋势预测：显示预测值、80% 经验区间和预计预算穿越日期
- 节省建议：提供金额、计算依据、置信度、风险和重叠去重后的保守总额

模型替代只比较相同 Token 用量下的价格差异，不代表质量、速度或能力等价，应用建议前必须结合实际工作负载验证。

### 会话高消耗诊断

“会话诊断”默认显示“需要关注”的高影响会话，也可以切换到全部会话，并按主要原因、严重程度和置信度筛选。打开某一项后，详情会依次展示主要原因、关键证据、输入/输出/推理与缓存率分轨时间线、其他发现，以及五个检测器的完整结果。从 Sessions 页点击原因徽标，也会切换到同一会话详情。

五类原因分别是：输入 Token 足迹放大、缓存复用信号下降、输出或推理占比集中、模型成本主导，以及用量事件累积。每个检测器都会明确标记为“已发现”“未发现”“数据不足”或“不适用”，不会把缺少历史、切片或价格的数据误报为正常。

诊断只使用会话 ID、时间、项目、模型、Token 数量、事件数量和本地估算费用等元数据，不读取或展示提示词、回复正文。定价不完整时仍会保留 Token 诊断，但只显示已计价费用和覆盖率，不生成完整费用结论，也不输出模型成本主导结论。

所有费用均根据本地日志和当前模型价格表估算，不代表 OpenAI 实际账单。

异常检测默认使用 28 个历史观察，至少需要 7 个样本。趋势预测至少需要 7 天历史数据；达到 28 天后，会在数据允许时加入星期周期。定价覆盖率低于默认安全阈值 80% 时，界面不会展示完整费用预测或汇总节省金额，而是提示先补全模型价格。

成本优化会在 Electron 的 `userData` 目录维护两个版本化文件：

```text
<Electron userData>\cost-optimization-config.json
<Electron userData>\cost-optimization-cache.json
```

配置文件保存分析参数，缓存文件保存可安全重建的增量成本索引。两者都不会修改 Codex 会话数据；应用始终以只读方式扫描 `%USERPROFILE%\.codex\sessions`，缓存损坏时可从当前会话文件重新构建。

Codex Token Usage 是一个基于 Electron 的本地桌面统计工具，用于自动扫描本机 Codex 会话数据，并按日期、项目和会话展示 Token 消耗情况。

应用只读取本地文件，不修改 Codex 数据，也不会上传统计结果。

## 核心功能

### 自动扫描 Codex 会话

应用启动后会自动扫描当前用户目录下的 Codex 会话文件：

```text
%USERPROFILE%\.codex\sessions
```

系统会递归读取 `rollout-*.jsonl` 文件，并解析其中的 `token_count` 事件，生成统一的统计结果。

### Token 消耗统计

系统会统计以下 Token 指标：

- 总 Token
- 输入 Token
- 缓存输入 Token
- 输出 Token
- 推理输出 Token
- 会话数量
- 项目数量

统计口径优先使用 Codex 事件里的 `last_token_usage` 作为增量累加；如果会话中缺少增量数据，则使用最大的 `total_token_usage` 快照作为兜底。

### 按日期统计

Overview 页面会展示每日 Token 消耗趋势，帮助查看近期使用高峰和变化情况。

主要展示内容：

- 总成本估算
- Token 总量
- 缓存命中占比
- 会话数量
- 每日趋势图
- Activity 活跃度热力图

成本根据会话中记录的模型和 Budgets 价格表估算。无法识别价格的模型会保留 Token
统计，并将费用标记为未计价，不会静默套用统一费率。

### 按项目统计

Tools 页面会按项目路径聚合 Token 消耗，适合查看哪些项目使用 Codex 最多。

每个项目会展示：

- 项目名称
- Token 占比
- 会话数量
- Token 总量
- 最后活跃时间

项目名称默认取工作目录路径的最后一段。

### 按会话统计

Sessions 页面会列出每个 Codex 会话的详细消耗。

每条会话记录包含：

- 会话名称或会话 ID
- 所属项目
- 开始时间
- 输入 Token
- 缓存 Token
- 输出 Token
- 总 Token
- 解析状态

已经获得主要诊断结论的会话会显示带文字的原因徽标；点击后进入“成本优化 → 会话诊断”的对应详情。

如果某个 JSONL 文件存在损坏行或部分解析失败，系统会保留可用数据，并在状态列显示 warning。

### 性能视图

Performance 页面提供更偏分析型的视图，用于快速观察使用效率。

包含模块：

- Cache Hit Rate：缓存命中率
- Cost Efficiency：按模型价格估算的成本趋势
- Peak Hours：使用高峰时间
- Error Rate：应用级错误比例，解析 warning 不会计为应用错误

这些指标都基于本地 Codex 会话数据派生。

### 预算控制

Budgets 页面用于同时控制 Token 消耗和预估费用：

- 支持全局和项目级预算
- 每个作用域均支持日、周、月自然周期
- Token 与预估费用限额可独立设置，也可以同时启用
- 默认在用量达到 80% 和 100% 时预警，两个全局阈值均可修改
- 支持应用内预警、侧栏徽标和 Windows 系统通知
- 相同预算在同一周期、同一阈值只发送一次系统通知
- 可按状态、作用域、周期和指标筛选预算

应用运行时每 60 秒刷新一次统计，窗口重新获得焦点时也会触发刷新。删除或修改预算只会更新应用配置，不会改动 `%USERPROFILE%\.codex\sessions`。

### 模型价格与未计价数据

应用内置 Codex 常用模型的输入、缓存输入和输出 Token 单价，也允许在 Model Pricing 中覆盖内置价格或补充未知模型价格。价格覆盖保存后，预算状态和费用估算会立即重新计算。

未知模型的 Token 会正常计入总量与 Token 预算，但不会计入已计价费用。界面会显示 `Pricing incomplete` 和未计价 Token 数量，并提供进入价格编辑页的入口。

预估费用基于本地 Codex 日志和模型价格表，不代表 OpenAI 实际账单。当前日志无法完整表达长上下文倍率、缓存写入费等账单条件，因此这类附加计价不会被推断。

### 刷新与本地配置

预算规则、全局阈值、模型价格覆盖和通知去重记录由 Electron 主进程写入版本化 JSON 配置：

```text
<Electron userData>\budget-config.json
```

配置写入采用临时文件替换方式；配置损坏时会保留备份并恢复默认值。会话扫描使用文件指纹缓存，只重新解析新增或发生变化的日志文件。

### 本地隐私边界

系统设计为本地只读工具：

- 不上传数据
- 不编辑 Codex 会话文件
- 不删除任何 Codex 数据
- Renderer 不直接访问文件系统
- 文件扫描只在 Electron 主进程中执行

## 界面结构

应用界面包含 7 个主要入口：

- Overview：整体统计、趋势图、活跃度热力图
- Sessions：会话级明细
- Tools：项目级统计
- Performance：缓存、成本、高峰和错误率分析
- Budgets：预算状态、预警、规则编辑和模型价格维护
- Cost Optimization：成本分析、异常、预测、节省建议和会话诊断
- Wrapped：数据路径、隐私说明和扫描 warning

界面风格参考轻量桌面仪表盘，强调简洁、低干扰和高信息密度。

## 技术栈

- Electron
- React
- TypeScript
- Vite
- electron-vite
- electron-builder
- Vitest
- lucide-react

## 开发运行

安装依赖：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install
```

启动开发模式：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

## 构建

构建 Electron/Vite 产物：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build
```

构建后的运行产物位于：

```text
out\
```

## Windows 打包

生成 Windows 安装包：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run build:win
```

安装包输出目录：

```text
dist\
```

典型输出文件：

```text
dist\codex-token-usage Setup 0.1.0.exe
```

## 测试

运行单元测试：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
```

运行类型检查：

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

当前测试覆盖：

- Token 字段累加
- 按日期和项目聚合
- Codex JSONL 会话解析
- `last_token_usage` 增量统计
- `total_token_usage` 兜底统计
- 损坏 JSONL 行的 warning 处理
- 日、周、月自然周期计算
- 全局与项目预算评估
- Token 和费用阈值预警
- 模型计价、价格覆盖与未知模型处理
- 配置持久化、扫描缓存和通知去重
- 会话诊断候选排名、五类原因、详情状态、时间线和跨页面导航

## 数据解析说明

系统主要读取两类数据：

### session_meta

用于识别：

- 会话 ID
- 工作目录
- 会话开始时间
- Codex 来源信息

### token_count

用于提取：

- `last_token_usage`
- `total_token_usage`
- 输入、缓存、输出、推理输出和总 Token

如果同时存在 `last_token_usage` 和 `total_token_usage`，系统以 `last_token_usage` 累加结果为准。

## 注意事项

- 如果 `%USERPROFILE%\.codex\sessions` 不存在，应用会显示空状态。
- 如果部分 JSONL 行损坏，应用不会崩溃，会跳过损坏行并记录 warning。
- GitHub 发布或安装依赖时，如果遇到网络重置，可以检查本机代理和 Git/npm 网络配置。
- 费用估算是基于本地日志与价格表的派生值，不代表实际账单。
