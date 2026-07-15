# Codex Token Usage

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

成本估算仅用于界面参考，不会影响原始 Token 数据。

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

如果某个 JSONL 文件存在损坏行或部分解析失败，系统会保留可用数据，并在状态列显示 warning。

### 性能视图

Performance 页面提供更偏分析型的视图，用于快速观察使用效率。

包含模块：

- Cache Hit Rate：缓存命中率
- Cost Efficiency：按 Token 估算的成本趋势
- Peak Hours：使用高峰时间
- Error Rate：解析 warning 比例

这些指标都基于本地 Codex 会话数据派生。

### 本地隐私边界

系统设计为本地只读工具：

- 不上传数据
- 不编辑 Codex 会话文件
- 不删除任何 Codex 数据
- Renderer 不直接访问文件系统
- 文件扫描只在 Electron 主进程中执行

## 界面结构

应用界面包含 5 个主要入口：

- Overview：整体统计、趋势图、活跃度热力图
- Sessions：会话级明细
- Tools：项目级统计
- Performance：缓存、成本、高峰和错误率分析
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
- 费用估算只是展示层派生值，不代表实际账单。
