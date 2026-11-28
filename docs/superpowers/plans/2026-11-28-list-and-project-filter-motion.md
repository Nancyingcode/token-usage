# 会话、项目列表与成本优化筛选动效实施计划

实施已完成。先处理两张列表的搜索、刷新和主动换组，再处理成本优化页的异步切换。每项行为改动先用失败测试复现，再实现并复跑相关用例，保留原有交互作为回归检查。[已确认设计与现状复现](../specs/2026-11-28-list-and-project-filter-motion-design.md)

## 1. 搜索中保留仍然匹配的行

- [x] **红。** 给会话和项目各准备至少 8 个同前缀条目。展开 A 的详情，聚焦搜索框，连续输入、退格和清空。每次检查匹配集合、搜索框焦点、A 的行和 `summary` 仍为原节点且 `details.open` 为真。让 A 退出结果再重新匹配，应显示折叠的新行。另测零结果空态、会话命中数，以及项目圆环和汇总始终基于全部项目。[列表交互测试](../../../tests/analyticsViews.test.tsx)
- [x] **绿。** 会话行继续按 `sourceFile`、项目行按 `projectPath` 复用。解除搜索词、当前可见路径及其顺序与表体重建的绑定，把重置展开状态限定到用户主动切换筛选项、排序或分页的入口。移除这两张表的逐行入场类和延迟，首次进入由现有 180 ms 页面入场负责。沿用原生 `details`，行移出结果后随节点释放展开状态。[会话列表](../../../src/renderer/components/SessionsView.tsx) · [项目列表](../../../src/renderer/components/ProjectsView.tsx) · [行详情](../../../src/renderer/components/UsageRowDetails.tsx)
- [x] **复查。** 将两张表中断言旧行类、延迟和表体更换的测试改为核对用户能看到或操作的行为。保留主动排序收起详情、翻页再返回时折叠、项目下钻和打开诊断的断言。预算与诊断仍使用通用逐行样式。运行 `npm test -- tests/analyticsViews.test.tsx tests/sessionListFilters.test.tsx`。[通用列表动效](../../../src/renderer/utils/motion.ts)

## 2. 后台更新时保住键盘位置

- [x] **红。** 在同一查询和页码下，记录聚焦控件与行身份。向项目表新增 B，让 A 实际改变排名，再移除 A。会话表至少覆盖一行仍在当前页和一行被挤出当前页两种情况。测试详情 `summary`，也覆盖「查看会话」或诊断按钮。仍在场时检查 `document.activeElement`、原节点、展开状态和新数据。行已移出且页面仍在时检查焦点回到搜索框。另测刷新前用户已移到筛选器或侧栏，及已离开页面的情况。[列表交互测试](../../../tests/analyticsViews.test.tsx)
- [x] **绿。** 在列表范围内识别刷新前真正持有焦点的控件。浏览器保有焦点时直接更新数据，移动 DOM 导致失焦时才恢复同一行的同一控件。原行离开当前结果时使用仍可见的搜索框。用户已移到其他位置时尊重当前焦点。恢复仍可见的控件时保持滚动位置，控件因重排移出视口时只滚动到能看见它。复跑第 1 项测试，以 Electron 场景核对实际滚动。[会话列表](../../../src/renderer/components/SessionsView.tsx) · [项目列表](../../../src/renderer/components/ProjectsView.tsx)

## 3. 只在主动换组时淡入表体

- [x] **红。** 用 30 条会话、每页 10 条验证连续翻到第 3 页、改变每页条数、切换项目或诊断筛选、清除组合筛选，以及项目表排序。检查最终行序、页码播报、首尾禁用按钮和详情收起。分别覆盖重选当前值、搜索使第 2 页回到第 1 页、后台数据减少使当前页自动回退、空态因推送重新出现结果。这些变化都跳过主动换组反馈。[列表交互测试](../../../tests/analyticsViews.test.tsx) · [分页逻辑](../../../src/renderer/utils/sessionListFilters.ts)
- [x] **绿。** 复用第 1 项对主动换组的判断，沿用现有页码重置与页大小持久化规则。通过项目筛选标签和清除按钮操作时也按实际改变的筛选项判断。搜索框删字直接更新结果。仅当主动换组产生非空结果时，在会话 `rowgroup` 或项目 `tbody` 上从 90% 到 100% 不透明度播放一次，沿用 `--duration-fast`（140 ms），零延迟。连续操作立即中断旧反馈，数据和控件同步反映最新选择。[会话列表](../../../src/renderer/components/SessionsView.tsx) · [项目列表](../../../src/renderer/components/ProjectsView.tsx) · [组件样式](../../../src/renderer/styles/components.css) · [动效令牌](../../../src/renderer/styles/tokens.css)
- [x] **复查。** 用样式测试约束反馈只改变透明度，减少动态效果时直接呈现最终状态。沿用表头、分页、圆环及详情箭头原有布局与交互。运行 `npm test -- tests/analyticsViews.test.tsx tests/sessionListFilters.test.tsx tests/uiStylePolicy.test.ts tests/motion.test.tsx`。[样式策略测试](../../../tests/uiStylePolicy.test.ts)

## 4. 成本优化查询期间保留页头与项目按钮

- [x] **红。** 在项目选择测试中增加从 `App` 挂载的集成场景，使用真实成本优化视图和查询 Hook，通过合成 `window.codexUsage` 控制响应。A 就绪后用键盘选 B，挂起 B，检查旧结果撤下、加载提示可感知、同一个按钮仍聚焦且能重新打开菜单。等待期间选 C，先完成 C，再分别让 B 成功和失败。核对只有 C 的结果、没有 B 的错误或闪回。请求按项目与周期区分，并单独响应全局诊断查询。[项目选择测试](../../../tests/costOptimizationProjectSelect.test.tsx) · [应用入口](../../../src/renderer/App.tsx) · [合成成本快照](../../../tests/helpers/costOptimizationFixtures.ts)
- [x] **绿。** 成本优化页的外层 key 只随进入或离开该页面变化。把加载、当前查询错误和就绪结果的替换限制在页头下方。保留作用于其他页的现有 key 规则，更新导航测试中成本页的旧期望。项目选项加载与成本分析查询继续各自报告状态。复用现有请求编号和快照匹配逻辑。[导航测试](../../../tests/appNavigation.test.tsx) · [成本优化页](../../../src/renderer/components/CostOptimizationView.tsx) · [查询 Hook](../../../src/renderer/hooks/useCostOptimizationSnapshot.ts) · [查询状态规则](../../../src/renderer/utils/costOptimizationSnapshotState.ts)
- [x] **复查。** 测当前查询失败后切换恢复，检查新选择生效的首个画面就已撤下旧错误。错误归属若未通过，用失败用例限定修正范围。响应到达时，重新打开的菜单及已移走的焦点都应保留。再从工具栏切换周期，检查焦点仍在实际触发控件。运行 `npm test -- tests/appNavigation.test.tsx tests/costOptimizationProjectSelect.test.tsx tests/useCostOptimizationSnapshot.test.tsx tests/costOptimizationSnapshotState.test.tsx`。

## 5. 为匹配的新结果播放一次反馈

- [x] **红。** 首次进入仅有页面入场，同条件推送只更新读数。主动改变项目或周期后，匹配的就绪结果才获得局部反馈。覆盖立即返回、延迟返回、旧响应迟到、切页后返回，以及等待期间用户已将焦点移至其他控件。确认数据和结果内操作从渲染时即可使用。[成本优化视图测试](../../../tests/costOptimizationView.test.tsx) · [项目选择测试](../../../tests/costOptimizationProjectSelect.test.tsx)
- [x] **绿。** 以项目和周期识别本页的主动查询变化，将一次 140 ms、零延迟、从 90% 起的淡入施加于结果区。复用第 3 项的透明度样式。首屏、重选、同条件快照、过期响应和错误均跳过。页头、菜单、抽屉和 Toast 各自使用原有反馈。保留工作台的网格间距、Tab 与面板的无障碍关联，以及外层页面的 180 ms 入场。[成本优化页](../../../src/renderer/components/CostOptimizationView.tsx) · [工作台样式](../../../src/renderer/styles/views.css)
- [x] **复查。** 外层页面持续挂载后，确认在 A 关闭的告警不会误隐藏 B 的同文告警，保存设置引起刷新后抽屉不会自行重开，保存通知仅出现一次。将与当前结果有关的临时状态保留在合适的结果生命周期内。运行 `npm test -- tests/costOptimizationView.test.tsx tests/costOptimizationProjectSelect.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/uiStylePolicy.test.ts`。

## 6. Electron 验收与项目门禁

- [x] 扩展已有动效 fixture，为本轮单独准备 30 条会话、至少 8 个同前缀项目和可按项目与周期完成或拒绝的请求，增加成本优化页导航入口及受控的增删、重排和快照推送。原场景继续使用原样本。使用临时用户目录与生产样式，在操作前记录焦点节点、滚动位置和宿主动画事件数，用事件和计算样式判断动画。[动效 fixture](../../../tests/nodeHelpers/rendererMotionFixture.tsx) · [Electron 动效脚本](../../../scripts/check-renderer-motion.cjs)

| 场景 | 操作及验收依据 |
| --- | --- |
| 连续输入、快速换组 | 输入、退格、清空，验证当前匹配行可读、逐行入场事件为零。连续翻页、排序和切换离散筛选，核对最终标签、数据和操作入口。每次有效换组仅表体获得 140 ms 透明度反馈，表头与项目圆环的动画次数无增量。 |
| 窄窗刷新 | 在 900 × 680 窗口核对表格容器低于 68rem，再用 Enter 展开 A 并聚焦。先新增 B，再调整 A 的排名，检查 A 的原控件、展开字段、可见区域和列表滚动。删除 A 后核对焦点回搜索框。切到 1440 × 900 后再缩窄，对仍在场的行检查开合状态。 |
| 异步查询 | 用键盘快速切 B、C，反序返回成功或失败。检查选中标签、菜单状态、焦点、结果文本和局部动画次数。随后分别触发当前查询失败、改周期恢复及同条件推送，检查只有匹配的新查询成功时才播放一次。 |
| 系统偏好与回归 | 组合覆盖英文浅色和简体中文深色、宽窄窗口，以及普通和减少动态效果。分别在操作前和 140 ms 反馈活动期间开启减少动态效果，检查最终样式、节点、焦点及再次恢复普通模式时的重播次数为零。复跑概览刷新保焦、日期弹窗回焦、窄窗 Enter 与空格开合。 |

- [x] 分别运行 `npm run test:layout` 和 `npm run test:layout -- --motion`。前者关闭动效，用于静态布局回归。后者验证 Chromium 中的真实时序、焦点和几何位置。若需裁定 Windows 原生键盘回绕，沿用真实安装窗口的验证方式。[布局脚本](../../../scripts/check-compressed-layout.cjs) · [上轮验收记录](2026-11-27-animation-upgrade.md)
- [x] 运行 `npm test`、`npm run typecheck`、`npm run lint` 和 `npm run build`。若默认并发出现超时，保留首轮结果和原超时阈值，再以 `npm test -- --maxWorkers=2` 复核。记录各项通过或失败、窗口条件及尚未验证的场景，按两项设计分别验收。

## 验收记录

- 列表失败用例复现了搜索重建两张表的详情节点、移除或挤出聚焦行后焦点落到 `body`，以及主动换组缺少表体反馈。成本优化失败用例复现了项目按钮随查询替换、旧错误出现在新选择的首个画面、已关闭告警跨查询泄漏，以及保存设置触发旧项目的查询覆盖当前结果。修复后，相关用例全部通过。
- `npm test` 默认并发首轮有一项 ESLint 策略测试超过原有的 5 秒阈值。以 `npm test -- --maxWorkers=2` 复跑，167 个文件、1,138 项测试全部通过，保留原有超时阈值。`npm run typecheck`、`npm run lint` 和 `npm run build` 通过。
- `npm run test:layout` 的 13 个静态布局用例通过。`npm run test:layout -- --motion` 在隔离 Electron 窗口使用合成数据，覆盖英文浅色与简体中文深色、900 × 680 和 1440 × 900 窗口。核对了表体与结果区的 140 ms 零延迟淡入、窄窗重排与删除后的焦点和滚动、成本查询成功与失败乱序、同条件推送，以及播放过程中切换减少动态效果。概览读数、日期弹窗和原生详情控件的既有动效回归也通过。[Electron 动效脚本](../../../scripts/check-renderer-motion.cjs)
