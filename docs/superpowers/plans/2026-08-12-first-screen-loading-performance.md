# 首屏加载速度优化实施计划

## 目标

按照已确认的《首屏加载速度优化设计》，缩短 Electron 冷启动到窗口加载、以及窗口加载到概览用量数据可用的关键路径。成本优化初始化、派生分析和缓存写入不得阻塞概览；后续冷启动复用持久化解析缓存；非首屏页面代码与数据请求按需加载。

设计依据：`docs/superpowers/specs/2026-08-12-first-screen-optimization-design.md`

## 实现原则

- 真实 Codex 会话目录始终只读；新增缓存只写入 Electron `userData`，测试只使用独立临时目录。
- 用量扫描成功与预算、成本分析成功分开建模，派生分析失败不得覆盖已成功的用量结果。
- 首次加载和手动刷新使用不同 API 语义；首次加载复用结果，手动刷新必须触发新扫描。
- 后台任务保持顺序并观察所有失败，不产生未处理 Promise rejection。
- 不使用绝对耗时作为单元测试断言；用可控 Promise 验证先后顺序和是否阻塞。
- 行为代码执行红—绿—重构，先运行最小相关测试，最后运行完整质量门禁与生产构建。

## 任务一：建立快速用量交付与有序后台分析

涉及文件：

- 修改 `tests/usageRuntime.test.ts`
- 修改 `tests/applicationRuntime.test.ts`
- 修改 `src/main/usageRuntime.ts`
- 修改 `src/main/applicationRuntime.ts`

步骤：

1. 先添加失败测试，用未解析的派生分析 Promise 证明扫描结果必须先返回并通知用量订阅者。
2. 添加连续两个 cycle 的测试，证明后台预算与成本处理严格按 cycle 顺序执行。
3. 添加后台分析失败测试，证明用量结果仍成功、错误被观察且对应派生运行时被标记 stale。
4. 将 `UsageRuntime` 的 cycle 通知改为不阻塞结果交付，`ApplicationRuntime` 使用私有 Promise 队列串行消费 cycle。
5. 保留单次 cycle 内“预算用量 → 成本预算 → 成本用量”的业务顺序，并为 `stop()` 固定不再接收新 cycle 的语义。
6. 运行最小测试并重构命名和错误边界。

## 任务二：区分首次用量读取与手动刷新

涉及文件：

- 修改 `tests/usageRuntime.test.ts`
- 修改 `tests/costOptimizationIpc.test.ts` 或新增专用 IPC 测试
- 修改 `src/main/usageMonitor.ts`
- 修改 `src/main/usageRuntime.ts`
- 修改 `src/main/applicationRuntime.ts`
- 修改 `src/shared/ipcChannels.ts`
- 修改 `src/main/ipc.ts`
- 修改 `src/preload/preload.ts`
- 修改 `src/renderer/global.d.ts`
- 修改 `src/renderer/App.tsx`

步骤：

1. 添加失败测试，覆盖启动扫描进行中时首次读取共享 Promise、启动扫描完成后首次读取复用最后结果、手动刷新始终触发下一次扫描。
2. 在运行时新增类型化 `getInitialUsage` 能力，不把“是否首次”隐藏在 Renderer 局部标记中。
3. 新增独立 IPC channel 和 preload API；现有 `scan()` 保持显式刷新语义。
4. Renderer 首次 Effect 调用 `getInitialUsage()`，工具栏刷新继续调用 `scan()`。
5. 扩展 IPC、preload 和 Renderer 全局类型测试，确认通道注册、注销和调用目标正确。

## 任务三：实现版本化持久化用量解析缓存

涉及文件：

- 新建 `src/main/usageScanCacheStore.ts`
- 新建 `tests/usageScanCacheStore.test.ts`
- 修改 `src/main/usageScanner.ts`
- 修改 `tests/usageScanner.test.ts`
- 修改 `src/main/main.ts`

步骤：

1. 先为缓存 Store 添加失败测试，覆盖缺失文件、合法读取、schema 或数据损坏、目录不匹配、原子保存和保存失败清理。
2. 定义版本化缓存类型，只保存文件指纹与解析后的基础 `UsageSession`；线程名称继续来自最新会话索引。
3. 实现防御式解码和原子写入。损坏缓存直接忽略，不修改真实会话文件。
4. 扩展扫描器测试：水合缓存后未变化文件不 read/parse，修改文件重新读取，删除文件移除，目录切换完整重建，线程名称变化无需重新解析。
5. 扫描成功后输出缓存快照；主进程通过单写队列后台保存，扫描结果不等待磁盘写入。
6. 添加较新缓存不得被较旧写入覆盖的测试，并观察保存错误而不使扫描失败。

## 任务四：提前创建窗口并延迟成本优化初始化

涉及文件：

- 修改 `src/main/main.ts`
- 修改 `src/main/applicationRuntime.ts`
- 修改 `src/main/ipc.ts`
- 修改 `tests/applicationRuntime.test.ts`
- 修改 `tests/costOptimizationIpc.test.ts`
- 必要时抽取可测试的启动编排纯函数与对应测试

步骤：

1. 添加可控 Promise 测试，证明语言、主题和用量路径并行读取，预算初始化完成后即可进入窗口创建阶段。
2. 添加成本运行时初始化屏障测试，证明未完成时不阻止用量扫描，但成本 IPC 会等待并在失败时返回错误。
3. 重构应用运行时：预算初始化属于关键就绪，成本初始化在后台启动；cycle 分析队列在应用成本变更前等待成本就绪。
4. 调整主进程顺序：并行读取基础偏好，初始化预算，注册 IPC 和窗口控制，创建窗口，启动扫描，然后继续后台成本初始化。
5. 确保 `activate` 重建窗口时复用已就绪运行时，不重复初始化或注册 IPC。
6. 用测试证明成本缓存 Promise 未解析时窗口启动所需 Promise 已完成。

## 任务五：同步提供初始语言并立即挂载 Renderer

涉及文件：

- 修改 `src/shared/i18n/locale.ts`
- 修改 `src/main/windowConfig.ts`
- 修改 `tests/windowConfig.test.ts`
- 修改 `src/preload/preload.ts`
- 修改 `tests/preloadTheme.test.ts` 或新增 preload 启动上下文测试
- 修改 `src/renderer/global.d.ts`
- 修改 `src/renderer/main.tsx`
- 修改 `tests/rendererI18n.test.tsx`

步骤：

1. 先添加失败测试，覆盖窗口参数只接受受支持 locale、缺失或非法参数回退默认 locale。
2. 与主题参数相同，在窗口配置中附加受控初始语言参数，并由 preload 解析后通过类型化同步属性暴露。
3. Renderer 使用同步初始语言创建 i18n，不在 `createRoot` 前调用 `locale.get()`。
4. 保留 `locale.get/set/onUpdated` 兼容现有设置流程；验证后续语言切换仍同步文档语言和标题。
5. 检查启动参数不向 Renderer 暴露任意 argv。

## 任务六：延迟非首屏请求并拆分页面代码

涉及文件：

- 修改 `src/renderer/hooks/useCostOptimizationSnapshot.ts`
- 修改 `tests/costOptimizationSnapshotState.test.tsx` 或新增 Hook 测试
- 修改 `src/renderer/App.tsx`
- 修改 `src/renderer/components/AppContent.tsx`
- 修改 `tests/appContent.test.tsx`
- 修改 `tests/appNavigation.test.tsx`
- 修改或新增构建产物策略测试

步骤：

1. 先添加失败测试，证明默认概览不请求成本优化或数据目录，首次进入会话、成本优化或设置页时才请求一次。
2. 为成本优化 Hook 增加 `enabled` 条件；禁用时不请求、不订阅，重新启用时保留匹配的已有快照并按查询需要刷新。
3. 数据目录只在设置页首次进入时读取，更新和重置继续覆盖最新内存状态。
4. 将 Overview 与应用外壳保持 eager，使用 `React.lazy` 拆分预算、成本优化、会话、项目、性能和设置组件。
5. 在页面边界加入本地化 `Suspense` fallback 和可重试错误边界，不改变现有页面内容与布局。
6. 生产构建后检查入口 chunk 与独立页面 chunk，避免测试仅依赖源码字符串。

## 任务七：全量验证与性能验收

步骤：

1. 运行所有新增与受影响的最小测试，特别检查：
   - 首次扫描调用次数。
   - 用量结果与后台分析顺序。
   - 缓存命中、失效和保存失败。
   - 成本初始化屏障。
   - 初始语言与 Renderer 挂载。
   - 概览阶段无非首屏请求。
2. 运行 `git diff --check`，检查未修改或写入任何真实会话目录。
3. 运行完整门禁：

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

4. 检查生产构建 chunk，确认非首屏页面代码已拆分。
5. 使用仓库 fixture 或隔离临时数据目录分别测量无缓存和有缓存启动，记录窗口创建、首次扫描完成、用量交付和后台分析完成的相对顺序。
6. 若完整门禁或构建失败，区分本次回归与既有问题；未全部通过前不声称完整完成。

## 完成定义

- 窗口创建不等待成本优化缓存初始化。
- 首次用量结果不等待预算和成本分析，后台分析仍严格有序且错误可观察。
- 每次启动只执行一次首次扫描，手动刷新仍执行新扫描。
- 后续冷启动复用未变化会话的持久化解析缓存，新增、修改、删除和目录切换结果正确。
- 缓存只写入 Electron `userData`，真实会话目录保持只读。
- Renderer 不等待初始语言 IPC，概览不请求非首屏数据，非首屏页面生成独立 chunk。
- 费用、未知模型、预算、stale、错误和国际化语义无回归。
- 全量测试、类型检查、lint 和生产构建全部通过。
