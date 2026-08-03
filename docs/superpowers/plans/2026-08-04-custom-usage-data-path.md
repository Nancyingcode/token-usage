# 自定义用量数据路径实施计划

## 实施原则

按红—绿—重构循环完成每个任务。默认路径继续由 `getDefaultCodexSessionsDir()` 提供，任何新逻辑不得修改 Codex 会话目录内容。

## 任务 1：建立共享契约与版本化路径存储

**文件：**

- 新增 `src/shared/usageDataPathTypes.ts`
- 新增 `src/main/usageDataPathStore.ts`
- 新增 `tests/usageDataPathStore.test.ts`

**步骤：**

1. 先测试无配置、损坏配置、自定义路径往返、恢复默认配置和写入失败不替换目标文件。
2. 定义路径设置、结构化问题码和 IPC 响应类型。
3. 实现 schema version 1 的原子存储。
4. 运行 `npm test -- tests/usageDataPathStore.test.ts`。

## 任务 2：让用量运行时安全切换扫描目录

**文件：**

- 修改 `src/main/codexPaths.ts`
- 修改 `src/main/usageScanner.ts`
- 修改 `src/main/usageMonitor.ts`
- 修改 `src/main/usageRuntime.ts`
- 修改 `tests/usageScanner.test.ts`
- 修改 `tests/usageMonitor.test.ts`
- 修改 `tests/usageRuntime.test.ts`

**步骤：**

1. 先测试目录变化会清空旧扫描缓存、标记完整重建，并从目录父级读取会话索引。
2. 先测试强制刷新会等待当前刷新后重新执行，不复用旧结果。
3. 扩展运行时，使扫描回调接收当前目录并提供目录切换操作。
4. 运行上述三个最小测试文件。

## 任务 3：实现主进程路径服务与 IPC

**文件：**

- 新增 `src/main/usageDataPathService.ts`
- 修改 `src/shared/ipcChannels.ts`
- 修改 `src/main/ipc.ts`
- 修改 `src/main/applicationRuntime.ts`
- 修改 `src/main/main.ts`
- 修改 `src/preload/preload.ts`
- 修改 `src/renderer/global.d.ts`
- 新增 `tests/usageDataPathService.test.ts`
- 修改 `tests/applicationRuntime.test.ts`
- 修改 `tests/costOptimizationIpc.test.ts`

**步骤：**

1. 先测试路径校验、持久化顺序、保存失败不切换，以及成功后刷新。
2. 先测试 get、update、reset IPC 注册、清理和参数转发。
3. 接入主进程启动加载、类型化 IPC 与 preload API。
4. 运行本任务相关最小测试集。

## 任务 4：实现设置页路径编辑体验

**文件：**

- 修改 `src/renderer/App.tsx`
- 修改 `src/renderer/components/AppContent.tsx`
- 修改 `src/renderer/components/SettingsView.tsx`
- 修改 `src/renderer/styles/views.css`
- 修改 `src/shared/i18n/locales/en.ts`
- 修改 `src/shared/i18n/locales/zhCN.ts`
- 修改 `tests/settingsView.test.tsx`
- 修改 `tests/appContent.test.tsx`
- 修改 `tests/appContentModel.test.tsx`（仅在状态模型契约需要调整时）

**步骤：**

1. 先测试表单标签、当前/默认路径、保存、恢复、结构化错误和提交状态。
2. 先测试扫描失败、空目录与周期空结果时设置路由仍渲染设置页。
3. 接入 Electron 原生目录选择器；路径框只读，用户取消选择时不改变草稿。
4. 在 `App` 管理独立路径状态，并把行为回调传到设置页。
5. 添加双语文案和与现有视觉系统一致的响应式样式。
6. 运行 Renderer 最小测试集。

## 任务 5：完整验证

依次运行：

1. `npm test`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run build`

任何失败都先定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。
