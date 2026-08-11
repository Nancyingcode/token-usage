# 多套主题与系统外观跟随实施计划

> 依据已确认设计：`docs/superpowers/specs/2026-08-11-multiple-themes-design.md`

## 1. 实施原则

- 按共享模型、主进程、preload、Renderer、样式的依赖顺序推进。
- 所有行为代码先添加失败测试，再实现最小代码，通过后重构。
- 主题偏好只写入 Electron `userData`，不得接触 Codex 会话目录。
- Renderer 不直接访问文件系统；偏好读写必须经过类型化 IPC 和 preload API。
- 保留当前薄荷浅色的现有颜色值，其他主题完整覆盖同一组语义令牌。
- 新增用户可见文案同时维护英文和简体中文。

## 2. 任务一：共享主题模型与纯函数

### 测试

新增 `tests/theme.test.ts`，先覆盖：

- 五种合法偏好和四个合法主题 ID；
- 非字符串、未知字符串均被拒绝；
- `system` 在浅色系统上解析为 `mint-light`，在深色系统上解析为 `emerald-dark`；
- 显式主题不受系统明暗值影响；
- 每个主题都能返回稳定的明暗元数据与窗口背景色。

### 实现

新增 `src/shared/theme.ts`：

- 定义 `ThemeId`、`ThemePreference`、`ThemeSnapshot`；
- 导出只读主题清单、默认偏好和类型守卫；
- 导出 `resolveThemePreference`、`getThemeColorScheme`、窗口背景色映射；
- 所有业务值使用具名常量，纯函数不修改输入。

运行：

```powershell
npm test -- tests/theme.test.ts
```

## 3. 任务二：偏好存储与 Theme service

### 测试

新增 `tests/themeStore.test.ts` 和 `tests/themeService.test.ts`：

- 缺失、损坏、未知 schema 与未知偏好回退到 `system`；
- 合法偏好可以原子保存并重新读取；
- 临时文件写入失败不替换目标文件并清理临时文件；
- service 保存成功后更新 snapshot 并广播；
- 保存失败保留旧状态且不广播；
- 显式主题忽略系统事件；
- `system` 仅在 resolved theme 变化时广播；
- 销毁 service 后移除系统事件监听。

### 实现

- 新增 `src/main/themeStore.ts`，复用 locale store 的原子写入边界。
- 新增 `src/main/themeService.ts`，通过窄化的 native-theme adapter 管理系统外观订阅。
- service 使用集合保存监听者，并注释其生命周期、所有权和销毁方式。

运行：

```powershell
npm test -- tests/themeStore.test.ts tests/themeService.test.ts
```

## 4. 任务三：主进程 IPC 与窗口启动参数

### 测试

- 扩展 IPC 测试，验证 `theme:get`、`theme:set`、`theme:updated` 以及注销逻辑。
- 扩展 `tests/windowConfig.test.ts`，验证不同主题的窗口背景色和受控 initial-theme 参数。
- 验证主进程只把已经解析的 `ThemeId` 传给窗口配置。

### 实现

- 在 `src/shared/ipcChannels.ts` 新增主题通道。
- 扩展 `src/main/ipc.ts` 的依赖、handler、订阅和清理。
- 扩展 `src/main/windowConfig.ts`，接收 `resolvedTheme` 并设置 `backgroundColor`、
  `webPreferences.additionalArguments`。
- 在 `src/main/main.ts` 启动阶段加载 theme store，创建 service，并在应用退出时销毁。
- 新建窗口时读取 service 当前 snapshot，确保重新创建窗口仍使用当前主题。

运行：

```powershell
npm test -- tests/costOptimizationIpc.test.ts tests/windowConfig.test.ts tests/themeService.test.ts
```

## 5. 任务四：preload API 与首帧应用

### 测试

新增 `tests/preloadTheme.test.ts`，mock Electron bridge 后验证：

- 合法 initial-theme 参数在暴露 API 前写入根元素；
- 非法或缺失参数安全回退到 `mint-light`；
- `get`、`set` 调用正确通道；
- `onUpdated` 订阅正确 payload，并能移除监听。

### 实现

- 在 `src/preload/preload.ts` 解析受控参数并同步 `data-theme`、`color-scheme`。
- 暴露 `theme.get/set/onUpdated` 窄接口。
- 在 `src/renderer/global.d.ts` 同步 Theme API 类型。

运行：

```powershell
npm test -- tests/preloadTheme.test.ts
```

## 6. 任务五：Renderer 主题状态与设置页交互

### 测试

- 新增 `tests/themeDom.test.tsx`，验证纯 DOM 应用函数设置 `data-theme` 与 `color-scheme`。
- 新增 `tests/useTheme.test.tsx`，验证初始读取、更新订阅、保存、错误和取消订阅。
- 扩展 `tests/settingsView.test.tsx`，验证中英文主题文案、radiogroup、五个 radio、
  当前选择、保存中禁用、保存成功状态和失败警告。
- 按需要扩展 `AppContent`/`App` 测试，验证主题 props 被传递到设置视图。

### 实现

- 新增 `src/renderer/utils/theme.ts`，集中应用根元素主题属性。
- 新增 `src/renderer/hooks/useTheme.ts`，管理 snapshot、pending 和 error。
- `App` 调用 hook，并通过 `AppContent` 把主题模型传给 `SettingsView`。
- `SettingsView` 新增外观面板与可访问的主题卡，不直接访问 `window.codexUsage`。
- 在中英文 `settings` namespace 添加同构文案。

运行：

```powershell
npm test -- tests/themeDom.test.tsx tests/useTheme.test.tsx tests/settingsView.test.tsx tests/appContent.test.tsx
```

## 7. 任务六：四套主题令牌与样式策略

### 测试

先扩展 `tests/uiStylePolicy.test.ts`：

- 四个 `data-theme` 选择器全部存在；
- 每套主题都覆盖必需语义颜色令牌；
- 明暗主题声明对应 `color-scheme`；
- 主题选择卡具有键盘焦点、选中和禁用样式；
- Renderer 主题文件外不新增硬编码颜色。

### 实现

- 重构 `src/renderer/styles/tokens.css`，把非颜色令牌留在 `:root`，为四套主题完整定义颜色。
- 扩展 `src/renderer/styles/views.css` 的外观面板、主题卡、色板预览和反馈样式。
- 所有主题复核侧栏、主画布、卡片、表单、表格、图表、状态提示、Drawer/Dialog、Tooltip、
  滚动条和标题栏。
- 在 reduced-motion 下不为主题切换新增动画。

运行：

```powershell
npm test -- tests/uiStylePolicy.test.ts tests/settingsView.test.tsx
```

## 8. 任务七：集成验证与收尾

依次运行：

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

若门禁失败，定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。最后运行：

```powershell
git diff --check
git status --short
```

审查最终变更只包含主题设计、计划、实现与测试，不覆盖工作区内无关用户修改；未经用户要求不提交、
不 push、不创建 Pull Request。
