# 自定义标题栏实施计划

## 目标

将 Electron 主窗口改为无系统边框窗口，在 Renderer 中提供可拖拽、可访问且支持中英文的自定义标题栏，并通过类型化 IPC 安全地完成最小化、最大化/还原和关闭操作。

## 任务一：约束主窗口配置

涉及文件：

- 新建 `src/main/windowConfig.ts`
- 新建 `tests/windowConfig.test.ts`
- 修改 `src/main/main.ts`

步骤：

1. 先添加失败测试，断言窗口配置关闭系统边框，并保留当前尺寸、最小尺寸、背景色和 webPreferences。
2. 提取纯函数生成 `BrowserWindowConstructorOptions`，避免通过导入带应用启动副作用的 `main.ts` 测试配置。
3. 在 `createWindow` 中使用配置函数，并运行 `tests/windowConfig.test.ts`。
4. 重构重复常量和配置拼装，确保配置函数无副作用且不修改输入。

## 任务二：实现类型化窗口控制 IPC

涉及文件：

- 新建 `src/shared/windowTypes.ts`
- 修改 `src/shared/ipcChannels.ts`
- 新建 `src/main/windowControls.ts`
- 新建 `tests/windowControls.test.ts`
- 修改 `src/main/main.ts`

步骤：

1. 先添加失败测试，覆盖最小化、最大化/还原、关闭、状态查询、状态广播与注销。
2. 定义 `WindowState`，并新增五个具名 IPC 通道。
3. 在独立模块中注册窗口控制 handler；根据 IPC 事件发送方定位窗口。
4. 监听窗口 `maximize`、`unmaximize` 事件，并向对应 Renderer 推送状态。
5. 在窗口创建时注册控制模块，在窗口关闭或应用退出时清理资源。
6. 运行 `tests/windowControls.test.ts` 并重构测试替身与清理逻辑。

## 任务三：通过 preload 暴露最小权限 API

涉及文件：

- 修改 `src/preload/preload.ts`
- 修改 `src/renderer/global.d.ts`
- 新建或修改 preload 相关静态策略测试

步骤：

1. 先添加失败断言，验证 Renderer 类型只暴露明确的窗口操作，而非通用 IPC 能力。
2. 在 `window.codexUsage.window` 下暴露 `minimize`、`toggleMaximize`、`close`、`getState` 和 `onStateChanged`。
3. 同步 Renderer 全局类型声明，复用共享 `WindowState` 类型。
4. 运行最小相关测试与类型检查。

## 任务四：实现自定义标题栏组件

涉及文件：

- 新建 `src/renderer/components/TitleBar.tsx`
- 新建 `tests/titleBar.test.tsx`
- 修改 `src/renderer/App.tsx`
- 修改 `src/shared/i18n/locales/en.ts`
- 修改 `src/shared/i18n/locales/zhCN.ts`

步骤：

1. 先添加失败组件测试，验证三个按钮、API 调用、初始状态读取、状态订阅及最大化/还原文案。
2. 新增英文与简体中文窗口操作文案。
3. 实现 `TitleBar`，使用原生按钮与 Lucide 图标，并正确清理状态订阅。
4. 将组件接入 `App` 的顶层布局。
5. 运行 `tests/titleBar.test.tsx`、`tests/i18n.test.ts` 和 Renderer 类型检查。

## 任务五：完成标题栏与滚动布局样式

涉及文件：

- 修改 `src/renderer/styles/shell.css`
- 修改 `src/renderer/styles/views.css`
- 修改 `src/renderer/styles/tokens.css`（仅在现有令牌不足时）
- 修改 `tests/uiStylePolicy.test.ts`

步骤：

1. 先添加失败样式策略测试，约束拖拽区、非拖拽按钮与关闭按钮状态。
2. 将应用框架改为两列两行，侧边栏跨两行，标题栏和主内容区位于右列。
3. 标题栏使用 `-webkit-app-region: drag`，窗口按钮使用 `no-drag`。
4. 让主内容区独立滚动，确保标题栏与侧边栏保持可见。
5. 为窄窗口保留可操作布局，不隐藏窗口控制按钮。
6. 运行 `tests/uiStylePolicy.test.ts` 与相关导航测试。

## 任务六：完整验证

依次运行：

1. `npm test`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`

如有失败，定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。最后检查 `git diff --check` 与工作区变更范围，确认只包含本任务文件。

