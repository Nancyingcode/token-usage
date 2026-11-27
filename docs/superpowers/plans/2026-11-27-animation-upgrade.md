# 动画效果升级实施计划

实施已完成。先解决刷新时丢失读数位置的问题，再调整动效、处理退场中断。每项行为改动先用失败测试复现，再做最小实现。测试转绿后整理重复逻辑，复跑同组测试及原有交互用例。[已确认设计](../specs/2026-11-27-animation-upgrade-design.md)

## 1. 保留同一范围内的趋势点、指标和日历

- [x] **复现。** 在概览测试中用真实 DOM 焦点聚焦某个趋势点，记录该命中节点、趋势面板和日历节点。重新渲染同一范围的合成数据，让该日 Token 与本地估算费用变化。断言节点身份及 `document.activeElement` 保留，提示和无障碍名称反映新值。另测该日期移出时旧提示消失，以及展开 53 周后同范围刷新仍保持展开。[概览趋势测试](../../../tests/overviewTrend.test.tsx)
- [x] **实现。** 移除指标区和趋势面板对会话数、Token 总量及末日日期的 React key 依赖。趋势命中点继续按日期复用，指标按最终格式化值更新。沿用日历的筛选范围 key 和结束周定位规则。手动刷新和后台推送都走同一套就地更新逻辑。[概览组件](../../../src/renderer/components/Overview.tsx) · [指标值组件](../../../src/renderer/components/AnimatedValue.tsx)
- [x] **复核。** 从应用入口分别触发手动扫描和后台更新，覆盖总量改变及仅扫描时间改变两种结果。用上述行为断言接替绑定旧动画 key 的断言，同时保留日期分组、计价、峰值和键盘提示用例。运行 `npm test -- tests/overviewTrend.test.tsx tests/overviewDateRange.test.tsx tests/animatedValue.test.tsx`。[日期范围集成测试](../../../tests/overviewDateRange.test.tsx)

## 2. 将页面入场与主动换范围分开

- [x] **先测触发条件。** 首次就绪、从其他页面返回、加载态或空态转为就绪只触发页面入场。连续选择「周 → 月 → 周」时核对每次真实切换及最后一组曲线、峰值和选中项。重选当前预设、重复应用相同日期、取消草稿、展开日历和同范围刷新均跳过图形渐显。加入单点日期和切到空区间的情况。[概览趋势测试](../../../tests/overviewTrend.test.tsx) · [应用导航测试](../../../tests/appNavigation.test.tsx)
- [x] **再改表现。** 由现有页面容器承担 180 ms 入场，移除概览卡片错峰、折线延迟绘制和日历延迟入场。初次挂载的 KPI 与页面同时出现，同范围刷新才为显示值改变的 KPI 播放已有反馈。沿用指标组件在 Performance 页的现有行为。[页面容器](../../../src/renderer/App.tsx) · [指标卡](../../../src/renderer/components/MetricCard.tsx) · [组件样式](../../../src/renderer/styles/components.css)
- [x] **限定图形层。** 比较前后已生效的预设或起止日期，仅在就绪概览内主动更换范围时，为可见曲线和点播放一次 140 ms 透明度过渡。轴、峰值标签、命中区域立即使用最终数据。快速切换时结束上一轮反馈，焦点留在触发控件。减少动态效果时直接显示最终图形与聚焦高亮，包括趋势点半径和滤镜。复跑第 1 项的用例，并运行 `npm test -- tests/appNavigation.test.tsx tests/uiStylePolicy.test.ts`。[视图样式](../../../src/renderer/styles/views.css) · [动效令牌](../../../src/renderer/styles/tokens.css)

## 3. 补齐日期对话框和行详情反馈

- [x] **日期对话框。** 先为新入场样式及其减少动态效果规则添加失败断言，回归有效提交、校验失败、取消与 Esc。为原生模态面板增加 180 ms 小幅上移，遮罩同步淡入。校验失败保留草稿，有效提交和取消即时关闭。用第 5 项的真实窗口检查两种入口的焦点恢复。[日期对话框](../../../src/renderer/components/DateRangeDialog.tsx) · [工具栏](../../../src/renderer/components/Toolbar.tsx) · [日期范围测试](../../../tests/overviewDateRange.test.tsx)
- [x] **会话与项目行详情。** 先断言只有箭头的 `transform` 使用 140 ms 过渡，减少动态效果时直接到达最终方向。再为现有 `details[open]` 旋转规则配上过渡，沿用原生开合和 `:focus-within`。两张表都复核立即显示或隐藏字段，宽度变化保留行状态，筛选或翻页时沿用已有的行身份规则。运行 `npm test -- tests/overviewDateRange.test.tsx tests/analyticsViews.test.tsx tests/uiStylePolicy.test.ts`。[行详情](../../../src/renderer/components/UsageRowDetails.tsx) · [列表交互测试](../../../tests/analyticsViews.test.tsx)

## 4. 让中断的退场只完成一次

- [x] **复现中断。** 为 `matchMedia` 准备可触发偏好变化的测试替身。请求关闭后依次触发开启减少动态效果、宿主退场取消、迟到的结束事件，交换顺序重测，回调始终只执行一次。单独验证子元素事件、同宿主旧入场事件均被忽略，父页面中途卸载后回调次数为零。确认框还要验证首次选中的确认与取消动作互斥。[退场 Hook 测试](../../../tests/useExitTransition.test.tsx) · [覆盖层交互测试](../../../tests/overlayExitTransitions.test.tsx)
- [x] **共用一次性回调。** 已挂载的组件收到退场结束、退场取消或开启减少动态效果的第一个有效通知时，取出并清除待办，再执行回调。对动画事件同时检查宿主和退场动画名。React 18 的取消事件通过宿主原生 `animationcancel` 监听处理，卸载时移除订阅并丢弃待办。检查减少动态效果的样式能覆盖带 `data-state` 的退场选择器。[退场 Hook](../../../src/renderer/hooks/useExitTransition.ts)
- [x] **逐个接入调用方。** 预算抽屉、成本优化设置抽屉，以及模型定价页的两个编辑抽屉，都监听各自的根节点。Toast 监听通知根节点。确认框监听外层遮罩的 `dialog-backdrop-exit`，内部对话框继续约束焦点。现有测试的模拟事件补上真实动画名，覆盖 Toast 自动关闭、重复 Esc 和关闭后恢复焦点。运行 `npm test -- tests/useExitTransition.test.tsx tests/overlayExitTransitions.test.tsx tests/useOverlayFocus.test.tsx tests/modelPricingView.test.tsx`。[确认框](../../../src/renderer/components/ConfirmDialog.tsx) · [模型定价抽屉](../../../src/renderer/components/ModelPricingView.tsx) · [Toast](../../../src/renderer/components/ToastNotice.tsx)

## 5. 在 Electron 验收并运行项目门禁

现有布局脚本给所有元素注入了关闭动画和过渡的样式，且合成页面直接挂载概览。实施时给同一脚本增加专用参数 `--motion`，用临时用户目录、合成会话和生产样式挂载所测的真实组件。默认布局场景继续使用静态样式，动效场景单独运行。测试刷新通过合成数据更新触发，以便在推送时保留键盘焦点。[Electron 布局脚本](../../../scripts/check-compressed-layout.cjs) · [现有合成页面](../../../tests/nodeHelpers/compressedLayoutFixture.tsx)

| 场景 | 操作与通过条件 |
| --- | --- |
| 普通动效 | 在操作前记录动画事件和计算样式，校验页面 180 ms、范围切换 140 ms、零启动延迟及正确的触发层。后台刷新时趋势点仍有焦点。日历展开至 53 周后横向滚动，再刷新同一结束周的数据，原滚动位置保留。 |
| 原生控件与窗口宽度 | 在 1024 × 680 及宽版（如 1440 × 900）检查日期按钮、图表与焦点，再缩到 960 像素或以下，通过日期下拉入口执行应用、取消与 Esc。两张表各用 Enter、空格开合详情，跨过表格容器断点再返回，检查字段、箭头、展开状态和焦点。 |
| 系统偏好与中断 | 在操作前模拟 `prefers-reduced-motion: reduce`，确认无等待、图形处于最终坐标、打开的详情箭头方向正确。再从普通模式发起退场，在动画活动期间切换偏好，确认原动作只执行一次且模态焦点恢复。组合覆盖中英文与深浅主题。 |

- [x] 运行 `npm run test:layout` 和新增模式 `npm run test:layout -- --motion`。记录窗口、主题、语言、动效偏好和断言结果。动画是否播放以事件或计算样式判断，静态截图只辅助检查布局。
- [x] 运行 `npm test`、`npm run typecheck`、`npm run lint`。逐项对照已确认设计记录结果，区分既有失败与本次回归。

## 验收记录

- 全量 Vitest 测试覆盖 167 个文件、1119 项用例。首轮并发运行出现 ESLint 策略和压缩用量集成超时，使用 `npm test -- --maxWorkers=2` 保留原超时阈值后全部通过。
- `npm run test:layout` 的 13 个静态布局用例通过。`npm run test:layout -- --motion` 在 900 × 680、1024 × 680 和 1440 × 900 窗口通过真实动效验收，覆盖英文浅色和简体中文深色，以及普通和减少动态效果两种偏好。
- `npm run typecheck`、`npm run lint` 和 `npm run build` 通过。
