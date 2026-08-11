# Codex Token Usage

Codex Token Usage 是一款基于 Electron 的本地桌面分析工具。它以只读方式扫描 Codex 会话日志，按日期、项目和会话统计 Token 用量，并提供费用估算、预算预警、性能分析和成本优化建议。

应用默认读取 `%USERPROFILE%\.codex\sessions`，也可以在设置中选择其他 Codex 会话目录。会话数据不会被修改或上传；所有费用均由本地日志和模型价格表估算，不代表 OpenAI 实际账单。

## 开发运行

环境要求：Windows、Node.js 和 npm。

安装依赖：

```powershell
npm install
```

启动开发模式：

```powershell
npm run dev
```

构建 Electron/Vite 运行产物：

```powershell
npm run build
```

构建结果位于 `out\`。

> 如果 `npm` 未加入 `PATH`，可在 PowerShell 中将上述命令的 `npm` 替换为 `& 'C:\Program Files\nodejs\npm.cmd'`。

## Windows 安装与打包

生成 Windows x64 品牌化 NSIS 安装包：

```powershell
npm run build:win
```

该命令会先执行完整构建，再调用 electron-builder 生成中英文辅助安装向导。安装包输出到
`dist\`，文件名为：

```text
dist\Codex-Token-Usage-Setup-<version>-x64.exe
```

安装向导默认按系统语言选择英文或简体中文，支持当前用户/所有用户安装、自定义安装目录、
桌面快捷方式选择以及安装完成后启动应用。当前用户安装默认不要求管理员权限；选择所有用户
安装时，Windows 会请求管理员授权。

本地构建在没有代码签名证书时仍可生成安装包，但 Windows 可能显示未知发布者或 SmartScreen
提示。正式发布前必须使用可信证书和时间戳服务签名，并分别验证安装器、应用可执行文件和
卸载器的签名状态。证书私钥和密码不得提交到仓库。

卸载会移除程序文件、开始菜单项和安装器管理的桌面快捷方式，但保留
`%APPDATA%\codex-token-usage` 中的应用配置与可重建缓存。安装、重装和卸载均不会读取、修改
或删除 `%USERPROFILE%\.codex` 或用户在设置中选择的 Codex 会话数据源。如需清除应用自身
配置，应在确认不再需要预算、语言、主题和自定义数据路径后，手动删除且仅删除
`%APPDATA%\codex-token-usage`。

## 测试与质量检查

运行单元测试：

```powershell
npm test
```

运行 TypeScript 类型检查：

```powershell
npm run typecheck
```

运行 ESLint 和 Prettier 检查：

```powershell
npm run lint
```

提交前建议依次完成：

```powershell
npm test
npm run typecheck
npm run lint
```

当前测试覆盖的主要领域包括：

- Codex JSONL 解析、损坏行容错和扫描缓存
- `last_token_usage` 增量累加与 `total_token_usage` 快照兜底
- 按日期、项目和会话聚合 Token 用量
- 日、周、月预算周期，Token/费用阈值和通知去重
- 模型计价、价格覆盖和未知模型处理
- 成本异常、趋势预测、节省建议和会话诊断
- Renderer 视图、交互、国际化与可访问性
- Electron 主进程、IPC、窗口行为和本地配置持久化

## 核心功能

### 本地会话扫描

应用会递归扫描 `rollout-*.jsonl` 文件，并解析 `session_meta` 与 `token_count` 事件：

- `session_meta`：识别会话 ID、工作目录、开始时间和 Codex 来源信息
- `token_count`：提取输入、缓存输入、输出、推理输出和总 Token

统计优先累加 `last_token_usage`；会话缺少增量数据时，使用最大的 `total_token_usage` 快照兜底。部分 JSONL 行损坏不会中断整次扫描，可用数据会被保留并产生 warning。

扫描结果包含总 Token、输入 Token、缓存输入 Token、输出 Token、推理输出 Token、会话数和项目数。应用运行期间每 60 秒刷新一次，窗口重新获得焦点时也会触发刷新；文件指纹缓存只重新解析新增或发生变化的日志。

### 用量与性能分析

- **Overview**：总量、费用估算、缓存命中占比、会话数、每日趋势和活跃度热力图
- **Sessions**：会话级输入、缓存、输出、总量、所属项目和解析状态
- **Projects**：按工作目录聚合项目用量、Token 占比、会话数和最后活跃时间
- **Performance**：缓存命中率、成本效率、使用高峰和应用级错误率

无法识别价格的模型仍会保留 Token 统计，并明确标记为未计价，不会静默套用统一费率。

### 预算与模型价格

Budgets 支持：

- 全局和项目级预算
- 日、周、月自然周期
- 独立或同时设置 Token 与预估费用限额
- 可配置的预警阈值（默认 80% 和 100%）
- 应用内提示、侧栏徽标和 Windows 系统通知
- 按状态、作用域、周期和指标筛选预算
- 覆盖内置模型价格，或为具体 Model ID 补充价格

相同预算在同一周期、同一阈值只发送一次系统通知。修改预算或价格只会更新应用配置，不会改动 Codex 会话数据。

没有价格规则覆盖的 Token 会计入总量和 Token 预算，但不会计入已计价费用。界面会显示 `Pricing incomplete`、定价覆盖率和未计价 Token 数量。

“未知模型兜底计价”仅用于日志完全缺少 Model ID 的情况，默认关闭且必须由用户显式配置。它不会应用于已有具体但尚未定价的 Model ID，也不会根据相近模型自动猜测价格。启用后，界面会持续标记费用包含未知模型假设；停用后，相关历史 Token 会立即恢复为未计价。

### 成本优化

Cost Optimization 是独立的分析工作台，可按全局周期和项目筛选本地用量，包含六个标签：

- **总览**：当前费用、定价覆盖率、期末预测、异常数量和保守节省额
- **模型对比**：比较相同 Token 用量下实际模型与候选模型的价格情景
- **异常消耗**：按日、项目、模型和会话检测异常，并展示基线与贡献证据
- **会话诊断**：定位输入增长、缓存复用下降、生成占比集中、模型成本主导和交互累积
- **趋势预测**：展示预测值、80% 经验区间和预计预算穿越日期
- **节省建议**：展示金额、计算依据、置信度、风险和去重后的保守总额

模型对比只反映价格差异，不代表质量、速度或能力等价，应用建议前应结合实际工作负载验证。

#### 会话高消耗诊断

会话诊断默认展示需要关注的高影响会话，也可以查看全部会话，并按主要原因、严重程度和置信度筛选。详情包含主要原因、关键证据、输入/输出/推理与缓存率时间线、其他发现，以及五类检测器的完整结果。从 Sessions 页点击原因徽标可直接打开对应诊断。

每个检测器会明确标记为“已发现”“未发现”“数据不足”或“不适用”。诊断只使用会话 ID、时间、项目、模型、Token 数量、事件数量和本地估算费用等元数据，不读取或展示提示词、回复正文。

异常检测默认使用 28 个历史观察且至少需要 7 个样本。趋势预测至少需要 7 天历史数据；达到 28 天后，会在数据允许时加入星期周期。定价覆盖率低于默认安全阈值 80% 时，不会生成完整费用预测、汇总节省金额或模型成本主导结论。

## 界面结构

侧栏包含七个主要入口：

- Overview：整体统计、趋势图和活跃度热力图
- Sessions：会话级用量明细与诊断入口
- Projects（项目）：项目级聚合统计
- Performance：缓存、成本、高峰和错误率分析
- Cost Optimization：异常、预测、节省建议和会话诊断
- Budgets：预算状态、规则编辑、预警和模型价格维护
- Settings（设置）：会话数据路径、隐私说明和扫描 warning

界面支持英文和简体中文，并使用本地 locale 格式化金额、百分比和日期。

## 数据与隐私

系统遵循本地只读边界：

- 不上传统计结果或会话数据
- 不编辑、删除 Codex 会话文件
- Renderer 不直接访问文件系统
- 文件扫描和配置读写由 Electron 主进程负责
- 自定义会话目录只改变扫描来源，不改变原始数据

默认数据源为：

```text
%USERPROFILE%\.codex\sessions
%USERPROFILE%\.codex\session_index.jsonl
```

在 Electron `userData` 目录中，应用维护以下版本化配置和可重建缓存：

```text
<Electron userData>\budget-config.json
<Electron userData>\cost-optimization-config.json
<Electron userData>\cost-optimization-cache.json
<Electron userData>\locale-preferences.json
<Electron userData>\theme-preferences.json
<Electron userData>\usage-data-path.json
```

打包后的 Windows 应用将 `<Electron userData>` 固定为 `%APPDATA%\codex-token-usage`，避免产品
显示名称变化后既有配置不可见。预算、成本优化参数、语言、主题和自定义数据路径保存在配置
文件中；成本优化缓存损坏时可由现有会话日志重新构建。

## 技术栈

- Electron
- React
- TypeScript
- Vite / electron-vite
- electron-builder
- Vitest / Testing Library
- i18next
- lucide-react

## 注意事项

- 默认会话目录不存在或没有可解析会话时，应用会显示空状态。
- 部分 JSONL 行损坏时，应用会跳过损坏行、保留可用数据并记录 warning。
- 预估费用不代表 OpenAI 实际账单，也不会推断日志中无法完整表达的长上下文倍率、缓存写入费等附加计价条件。
- 安装依赖或访问 GitHub 时遇到网络重置，请检查本机代理以及 Git/npm 网络配置。
