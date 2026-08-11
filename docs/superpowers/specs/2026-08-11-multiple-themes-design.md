# 多套主题与系统外观跟随设计

## 1. 背景

当前 Renderer 已把绝大多数颜色集中在 `src/renderer/styles/tokens.css` 的语义变量中，
但所有变量只定义了一套浅色薄荷配色，窗口创建阶段也固定使用浅色背景。设置页尚未提供外观入口，
应用重启后也没有可恢复的主题偏好。

本次功能把现有配色保留为默认主题，并新增多套经过完整设计的内置主题。主题偏好由应用配置持久化，
支持跟随操作系统明暗模式，并在应用启动、运行期间系统外观变化以及用户主动切换时保持主进程、
preload 与 Renderer 一致。

## 2. 目标

1. 提供“跟随系统”以及四套可直接选择的内置主题。
2. 在设置页以可访问的主题选择卡展示名称、说明和配色预览，切换后立即作用于整个应用。
3. 原子持久化用户选择，重启应用后恢复；配置损坏时安全回退到“跟随系统”。
4. “跟随系统”模式在操作系统明暗外观变化时实时更新，不要求重启应用。
5. 首次可见帧即使用正确主题，避免深色主题启动时先闪出浅色界面。
6. 所有状态色、图表色、焦点样式、滚动条和覆盖层在每套主题中都保持清晰、可辨认。

## 3. 非目标

- 本阶段不提供任意颜色拾取器、用户自建主题、主题导入导出或云同步。
- 不允许主题修改字体、字号、间距、圆角、布局、动画时长或业务数据展示方式。
- 不根据项目、页面或时间段自动轮换主题。
- 不修改 Codex 会话目录，也不把主题偏好写入只读数据源目录。
- 不把颜色作为状态、严重程度或置信度的唯一表达方式。

## 4. 主题集合

主题偏好与最终呈现主题分开建模：

```ts
type ThemePreference = 'system' | ThemeId;

type ThemeId = 'mint-light' | 'emerald-dark' | 'ocean-dark' | 'sand-light';

interface ThemeSnapshot {
  preference: ThemePreference;
  resolvedTheme: ThemeId;
}
```

内置主题如下：

| ID | 中文名 | 英文名 | 明暗 | 视觉方向 |
| --- | --- | --- | --- | --- |
| `mint-light` | 薄荷晨光 | Mint Daylight | 浅色 | 保留现有冷白、深绿侧栏和薄荷强调色 |
| `emerald-dark` | 翡翠夜色 | Emerald Night | 深色 | 深墨绿画布、柔和翡翠强调色和低眩光表面 |
| `ocean-dark` | 深海蓝 | Deep Ocean | 深色 | 深海军蓝画布、青蓝强调色和冷色图表 |
| `sand-light` | 暖砂纸 | Warm Sand | 浅色 | 暖米色画布、深棕侧栏和琥珀强调色 |

“跟随系统”不是第五套颜色。系统使用浅色外观时解析为 `mint-light`，使用深色外观时解析为
`emerald-dark`。用户选择 `ocean-dark` 或 `sand-light` 后不再受系统明暗变化影响。

主题名称与说明进入 `settings` 国际化 namespace，英文和简体中文资源保持相同叶子 key。
稳定的内部 ID 不参与翻译，也不使用展示文案作为持久化值。

## 5. 颜色令牌与 CSS 结构

### 5.1 语义令牌

保留现有组件对 `--color-*` 的引用方式，把 `tokens.css` 拆分为两类定义：

- `:root`：字号、间距、圆角、控件尺寸、动画和其他与主题无关的令牌；
- `:root[data-theme='<ThemeId>']`：每套主题完整定义颜色、阴影和滚动条令牌。

每套主题必须完整提供以下语义族，不允许组件按主题 ID 编写分支：

- 品牌与导航：`brand-*`、侧栏文字、悬停和选中状态；
- 页面层级：画布、表面、次级表面、覆盖层、边框、正文和弱化正文；
- 反馈状态：success、warning、danger、info 的文字、边框、表面和强调色；
- 数据图形：主趋势填充和全部分类色；
- 交互与层级：焦点环、阴影、滚动条和深色表面滚动条。

`html` 同步设置 `color-scheme: light | dark`，使原生表单控件和浏览器 UI 与主题明暗一致。
现有 `mint-light` 的视觉值保持不变，避免默认用户升级后发生无意的视觉回归。

### 5.2 颜色质量

- 正文与主要表面、弱化正文与主要表面的对比度目标至少达到 WCAG AA。
- 焦点环在画布、卡片、侧栏和对话框上都必须可见。
- success、warning、danger、info 在每套主题中同时保留图标或文案语义。
- 图表分类色需要在对应画布上可区分；图表既有的文本、Tooltip 和静态摘要继续提供非颜色入口。
- 禁止在 Renderer 组件或视图样式中新增十六进制、RGB 或 HSL 业务颜色；颜色值集中在主题令牌文件。

## 6. 偏好持久化与主进程服务

新增 `theme-preferences.json`，位于 Electron `userData` 目录，而不是 Codex 会话目录。格式为：

```json
{
  "schemaVersion": 1,
  "preference": "system"
}
```

新增的 theme store 沿用 locale store 的原子写入模式：写入同目录临时文件，成功后重命名替换，
最后清理临时文件。读取缺失文件、损坏 JSON、未知 schema 或未知主题 ID 时均返回 `system`；
保存非法值时拒绝操作，不覆盖现有文件。

Theme service 持有当前 `ThemeSnapshot`，职责为：

1. 使用 Electron `nativeTheme.shouldUseDarkColors` 解析 `system`；
2. 保存有效偏好，并在保存成功后发布新 snapshot；
3. 仅在偏好为 `system` 时响应 `nativeTheme` 的 `updated` 事件；
4. 解析结果实际变化时才向订阅者广播，避免无意义重渲染；
5. 应用退出时移除系统主题监听器。

主题状态属于应用外观，不改变现有用量、预算、定价或会话解析数据模型。

## 7. IPC、preload 与启动流程

新增类型化通道：

- `theme:get`：返回当前 `ThemeSnapshot`；
- `theme:set`：接收 `unknown`，由主进程验证为 `ThemePreference` 后保存并返回新 snapshot；
- `theme:updated`：在用户偏好或系统外观使 resolved theme 变化时推送 snapshot。

preload 只暴露窄接口：

```ts
interface ThemeApi {
  get: () => Promise<ThemeSnapshot>;
  set: (preference: ThemePreference) => Promise<ThemeSnapshot>;
  onUpdated: (listener: (snapshot: ThemeSnapshot) => void) => () => void;
}
```

为消除启动闪烁，主进程在创建窗口前已经完成主题读取与解析，并通过受控的
`webPreferences.additionalArguments` 把经过验证的初始 `resolvedTheme` 传给 preload。
preload 在页面脚本执行前把它写入 `document.documentElement.dataset.theme`，同时设置匹配的
`color-scheme`。窗口 `backgroundColor` 也根据 resolved theme 使用对应画布色，避免页面加载前露出错误底色。

Renderer 启动后仍调用 `theme:get` 获取包含 preference 的权威 snapshot；若调用异常，保留 preload
已经应用的安全主题，不阻塞应用启动。运行期间统一通过 `theme:updated` 同步。

## 8. Renderer 状态与设置页交互

新增主题控制 hook，负责：

- 读取初始 snapshot 并订阅更新；
- 通过单一纯函数把 `resolvedTheme` 应用到根元素的 `data-theme` 与 `color-scheme`；
- 暴露当前 preference、resolved theme、保存中状态、保存操作和可翻译的失败状态；
- 组件卸载时取消订阅。

设置页新增“外观”面板，置于数据路径面板之前。面板内使用原生单选控件组成的 radiogroup；
每张选择卡包含主题名称、简短说明、明暗文字标签和三枚装饰性色块。色块设置
`aria-hidden="true"`，选择状态由 radio、文字和选中标记共同表达。

选择主题后调用主进程保存；成功返回时整个应用立即应用新 snapshot，并通过 `role="status"`
反馈已保存。保存期间禁用主题选项以避免并发写入。保存失败时保持上一套已确认主题，使用
`role="alert"` 显示本地化错误，不显示原始文件系统错误。系统主题变化不会显示“已保存”提示。

为避免 SettingsView 继续承担更多顶层状态编排，主题状态与操作由 `App` 获取后通过
`AppContent` 传给 SettingsView；主题卡可拆为小组件，但不自行访问全局 API。

## 9. 窗口与平台行为

- `windowConfig` 接收 resolved theme，并从具名映射取得窗口背景色，不再使用单一硬编码颜色。
- 自定义标题栏继续使用主题语义令牌，不调用操作系统原生深色标题栏 API。
- 新建或重新创建窗口时使用 Theme service 的当前 snapshot。
- 多窗口不是本次产品功能，但订阅模型不把状态绑定到单个 Renderer；当前发送辅助函数仍只需覆盖主窗口。

## 10. 错误与回退策略

- 偏好文件缺失或损坏：使用 `system`，不在启动时自动覆盖损坏文件。
- 系统明暗值不可用：解析为 `mint-light`。
- 保存失败：Theme service 不提交内存状态、不广播更新，Renderer 保持上一主题。
- Renderer 获取失败：保留 preload 初始主题并继续渲染。
- 收到未知 IPC payload：主进程抛出类型错误，preload 和 Renderer 不自行猜测主题。
- CSS 属性缺失或被移除：`:root` 提供 `mint-light` 的安全颜色回退，页面仍可读。

## 11. 测试策略

行为代码遵循红—绿—重构：先添加失败测试，再实现最小代码使其通过。

1. 共享主题模型：验证合法 ID、系统明暗解析、主题明暗元数据，并保证纯函数不修改输入。
2. Theme store：验证缺失/损坏回退、合法往返、非法保存拒绝和原子写失败不替换目标文件。
3. Theme service：验证保存成功广播、保存失败回滚、显式主题忽略系统变化、系统主题只在解析结果变化时广播，以及销毁时清理监听。
4. IPC 与 preload：验证 get/set/updated 通道、payload 验证、监听取消和初始主题参数解析。
5. 启动与窗口配置：验证窗口背景色和 additional arguments 与 resolved theme 一致。
6. Renderer：验证根元素属性应用、订阅清理、保存失败状态以及中英文设置文案。
7. 可访问性：验证 radiogroup、可访问名称、选中状态、保存状态与错误 live region。
8. 样式策略：验证四套主题选择器齐全、每套都覆盖必需语义令牌、主题外样式不新增硬编码颜色。
9. 回归门禁：运行 `npm test`、`npm run typecheck`、`npm run lint` 和 `npm run build`。

## 12. 预计变更范围

- `src/shared/theme.ts`
- `src/shared/ipcChannels.ts`
- `src/main/themeStore.ts`
- `src/main/themeService.ts`
- `src/main/main.ts`
- `src/main/ipc.ts`
- `src/main/windowConfig.ts`
- `src/preload/preload.ts`
- `src/renderer/global.d.ts`
- `src/renderer/main.tsx`
- `src/renderer/App.tsx`
- `src/renderer/components/AppContent.tsx`
- `src/renderer/components/SettingsView.tsx`
- `src/renderer/hooks/useTheme.ts`
- `src/renderer/utils/theme.ts`
- `src/renderer/styles/tokens.css`
- `src/renderer/styles/views.css`
- `src/shared/i18n/locales/en.ts`
- `src/shared/i18n/locales/zhCN.ts`
- 对应测试文件

具体文件拆分可在实施计划中根据测试边界微调，但不改变主进程拥有持久化、preload 提供窄接口、
Renderer 只通过类型化 IPC 访问主题状态的边界。

## 13. 验收标准

- 设置页可选择“跟随系统”和四套内置主题，所有文案支持英文与简体中文。
- 每套主题覆盖全部页面、覆盖层、图表、状态、滚动条和自定义标题栏，无局部残留默认色。
- 显式主题重启后恢复；跟随系统能响应运行期间的系统明暗变化。
- 深色主题启动时不出现可见的浅色闪屏，窗口加载背景与最终画布一致。
- 键盘可完成主题选择，选中与反馈状态不依赖颜色表达，焦点清晰可见。
- 偏好损坏、未知值或保存失败均安全回退，不影响用量数据读取和其他设置。
- 全量测试、类型检查、lint 与生产构建全部通过。
