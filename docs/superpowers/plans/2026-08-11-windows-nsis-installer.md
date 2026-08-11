# Windows 品牌化 NSIS 安装器实施计划

## 目标

在现有 electron-builder 构建链上交付 Windows x64 品牌化 NSIS 辅助安装向导，固定应用与
升级身份，保留既有 `%APPDATA%/codex-token-usage` 配置，并确保安装、升级和卸载不接触
Codex 会话数据源。

设计依据：`docs/superpowers/specs/2026-08-11-windows-nsis-installer-design.md`

## 变更边界

- 修改 Electron 主进程启动路径、打包配置、构建脚本、安装器资源、测试和 README。
- 第一阶段只生成 Windows x64 NSIS 安装包。
- 不引入自动更新、MSI、MSIX、ARM64、x86、便携版或在线安装器。
- 不修改 IPC、Renderer、扫描器、费用计算或会话持久化格式。
- 不操作真实 Codex 会话目录；测试使用纯路径输入、仓库 fixture 或隔离临时目录。
- 不提交证书、密码或其他发布凭据，不主动创建 Git 提交。

## Task 1：以测试固定应用数据路径兼容行为

**文件：**

- Create: `tests/appPaths.test.ts`
- Create: `src/main/appPaths.ts`
- Modify: `src/main/main.ts`

### Step 1：先写失败测试

覆盖：

- Windows roaming app-data 根目录解析为 `<appData>/codex-token-usage`。
- 路径解析不依赖新的产品显示名称。
- 不修改传入路径或引用会话目录名称。

运行：

```powershell
npm test -- tests/appPaths.test.ts
```

预期：因 `appPaths.ts` 尚不存在而失败。

### Step 2：实现纯路径函数

- 使用具名常量保存兼容目录名 `codex-token-usage`。
- 使用 `node:path.join` 返回稳定路径。
- 文件头说明该路径是已发布持久化边界，修改会导致配置不可见。

### Step 3：接入 Electron 初始化

- 在 `app.whenReady()` 之前读取 `app.getPath('appData')`。
- 在任何配置 Store 初始化前调用 `app.setPath('userData', stablePath)`。
- 保持现有 Store 文件名、加载顺序和错误行为不变。

### Step 4：运行最小测试并重构

```powershell
npm test -- tests/appPaths.test.ts
npm run typecheck
```

## Task 2：以测试固定安装器配置不变量

**文件：**

- Create: `tests/packagingConfig.test.ts`
- Create: `electron-builder.yml`
- Modify: `package.json`

### Step 1：先写失败测试

读取 `package.json` 与 `electron-builder.yml` 原始文本，覆盖：

- 应用 ID、产品显示名称和可执行文件名为设计中的稳定值。
- Windows 目标显式为 NSIS x64。
- 产物名包含版本和架构。
- NSIS 使用辅助安装模式、允许修改目录并提供中英文资源。
- NSIS GUID 为非占位固定值。
- 开始菜单、桌面快捷方式和安装完成启动行为符合设计。
- 安装器配置与脚本不引用 `.codex`、`sessions` 或 `session_index.jsonl`。
- `build:win` 显式加载受控配置，不依赖主机默认架构。

运行：

```powershell
npm test -- tests/packagingConfig.test.ts
```

预期：因配置文件不存在且脚本仍使用默认目标而失败。

### Step 2：实现最小 electron-builder 配置

- 新建 `electron-builder.yml`，声明 `appId`、`productName`、`executableName`、文件范围、输出目录、
  Windows x64 NSIS 目标和安装器行为。
- 生成一次固定 NSIS GUID，写入配置并由测试保护。
- 更新 `build:win`，显式传入配置文件、Windows、NSIS 和 x64。
- 不增加 publish 或自动更新配置。

### Step 3：运行配置测试并重构

```powershell
npm test -- tests/packagingConfig.test.ts
```

保持测试只验证业务不变量，避免复制 electron-builder 的完整 schema。

## Task 3：创建品牌资源与受限 NSIS 扩展

**文件：**

- Create: `build/icon.ico`
- Create: `build/installer-sidebar.bmp`
- Create: `build/installer-header.bmp`
- Create: `build/installer.nsh`
- Modify: `tests/packagingConfig.test.ts`

### Step 1：扩展失败测试

覆盖：

- 配置引用的品牌资源全部存在。
- ICO 与 BMP 具有正确文件签名且不是空文件。
- `installer.nsh` 只使用 include 宏，不定义或替换完整安装器脚本入口。
- 脚本不引用应用配置目录或 Codex 会话数据源。

运行：

```powershell
npm test -- tests/packagingConfig.test.ts
```

预期：因品牌资源和脚本尚不存在而失败。

### Step 2：生成品牌资源

- 使用现有 UI 色板和中性 Token/趋势图形创建源视觉。
- 生成包含常用尺寸的 Windows ICO。
- 生成符合 NSIS 规格的侧边图和顶部图，不把文案烘焙到位图中。
- 不使用 OpenAI 标志或暗示官方归属的元素。

### Step 3：实现最小 NSIS include

- 优先使用 electron-builder assisted installer 的标准页面和内置快捷方式行为。
- 只有标准能力不能提供设计中的欢迎页或可取消桌面快捷方式时，才增加对应宏。
- 不复制安装、卸载、升级、进程关闭或签名验证主体。

### Step 4：运行测试并检查资源

```powershell
npm test -- tests/packagingConfig.test.ts
```

同时以图像检查工具确认 ICO 和 BMP 可读取、尺寸正确、主体没有裁切。

## Task 4：更新 Windows 打包与数据保留文档

**文件：**

- Modify: `README.md`

### Step 1：更新说明

补充：

- 新安装包名称和 x64 范围。
- 当前用户/所有用户安装、安装目录和快捷方式选择。
- 卸载移除程序与快捷方式，但保留 `%APPDATA%/codex-token-usage`。
- 安装器与卸载器从不接触 Codex 会话目录。
- 未签名本地构建可能出现 Windows 警告，正式发布需要可信签名和时间戳。

### Step 2：运行文档检查

```powershell
npm run lint:docs -- README.md docs/superpowers/specs/2026-08-11-windows-nsis-installer-design.md docs/superpowers/plans/2026-08-11-windows-nsis-installer.md
git diff --check
```

## Task 5：构建安装包并修复集成问题

### Step 1：运行最小相关验证

```powershell
npm test -- tests/appPaths.test.ts tests/packagingConfig.test.ts
npm run typecheck
```

### Step 2：运行应用构建

```powershell
npm run build
```

确认主进程、preload 和 Renderer 产物正常生成。

### Step 3：运行 Windows 安装包构建

```powershell
npm run build:win
```

确认 `dist/Codex-Token-Usage-Setup-<version>-x64.exe` 存在，并记录文件大小与 Authenticode
状态。没有证书时必须明确标记为未签名，不把本地构建描述为可直接可信发布。

### Step 4：执行可自动化的产物检查

- 检查 EXE 存在、非空且文件名与版本一致。
- 检查 `dist/win-unpacked/CodexTokenUsage.exe` 存在。
- 检查安装器和应用 EXE 的签名状态并如实记录。
- 检查 Git 状态，确认 `dist/`、`out/` 和临时生成文件没有进入跟踪范围。

## Task 6：全量门禁与手工验收交接

### Step 1：运行全量门禁

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

任何失败都必须定位根因，不删除测试、不放宽有效断言、不禁用规则。

### Step 2：整理隔离环境手工步骤

按设计文档记录尚需在 Windows Sandbox、虚拟机或隔离测试用户执行的步骤：

- 当前用户默认目录安装。
- 当前用户自定义目录安装。
- 所有用户安装及 UAC 取消路径。
- 中英文、快捷方式、完成后启动和三档 DPI。
- 使用隔离 fixture 验证重装/卸载不修改会话文件。
- 验证配置在重装/卸载后保留。
- 获得代码签名证书后验证安装器、应用 EXE、卸载器和时间戳。

不得在当前开发用户的真实 Codex 会话目录上执行这些验证。

## 验收检查

- Windows x64 NSIS 安装包具有稳定名称、身份和品牌资源。
- 安装向导提供设计要求的语言、范围、目录、快捷方式和启动选择。
- 产品显示名称变化不影响既有 `%APPDATA%/codex-token-usage` 配置。
- 安装器配置与 NSIS 脚本不引用或操作 Codex 会话数据源。
- README 准确描述安装、卸载、数据保留和签名边界。
- 受影响测试、全量测试、类型检查、lint、应用构建和 Windows 安装包构建全部通过。
- 未执行的隔离环境 UI/UAC/升级/签名验证被明确列出，不以自动化配置检查替代。
