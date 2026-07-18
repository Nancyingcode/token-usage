# JSX 复合条件治理设计

## 背景

`AGENTS.md` 新增约束：JSX/DOM 内部的条件判断包含多个判断项时，应将条件提取到 JSX 外部。当前项目主要存在两类对应问题：

- `App.tsx` 直接组合 `error`、`loading`、扫描结果和周期过滤结果，形成四组复合渲染条件。
- `Sidebar.tsx` 在 JSX 中直接组合导航项类型和 warning 数量。

这些表达式当前行为正确，但状态优先级分散在模板中。新增加载状态或空状态时，需要同时修改多处条件，容易出现界面分支重叠或遗漏。

## 目标

- JSX 中不再出现由多个业务判断组成的渲染条件。
- 应用主内容的互斥状态具有单一、可测试的判定入口。
- 使用现有 ESLint 10 原生规则阻止同类代码重新进入项目。
- 保持现有界面、扫描流程、周期切换和错误处理行为不变。
- 不安装 Airbnb 配置或新的 ESLint 插件。

## 非目标

- 不禁止普通的单条件三元表达式，例如 `activeView === 'overview'`。
- 不处理 `threadName || shortId(sessionId)` 这类值回退表达式。
- 不引入第三方状态机库。
- 不把可由 props、扫描结果或现有 state 计算出的值重复保存到 React state。
- 不进行与复合条件无关的组件样式或页面结构重构。

## 规则定义

本次把“超过一个条件”定义为：一个 JSX 表达式中的渲染判断同时组合两个或更多业务谓词，例如：

```tsx
{!error && !loading && result && result.summary.sessions.length === 0 ? (
  <EmptyState />
) : null}
```

允许的处理方式按优先级排列：

1. 使用具名布尔变量表达局部、无歧义的派生条件。
2. 使用纯函数集中判定具有业务含义或需要复用、测试的条件。
3. 多个互斥界面分支使用可辨识联合类型建模，并由组件或 `switch` 渲染。
4. 只有条件具有独立生命周期、会被用户事件或异步事件直接改变时，才使用 React state。

## 应用内容状态模型

新增 `src/renderer/utils/appContentModel.ts`，集中产生主内容渲染模型。

```ts
export type AppContentModel =
  | { kind: 'error'; message: string }
  | { kind: 'loading' }
  | { kind: 'empty'; result: UsageScanResult }
  | { kind: 'period-empty'; period: UsagePeriod }
  | {
      kind: 'ready';
      activeView: ViewKey;
      result: UsageScanResult;
      summary: UsageSummary;
    }
  | { kind: 'idle' };
```

`resolveAppContentModel` 接收 `error`、`loading`、`result`、`filteredSummary`、`period` 和 `activeView`，按以下固定顺序返回一个模型：

1. 存在错误：`error`。
2. 正在扫描：`loading`。
3. 尚无扫描结果：`idle`。
4. 扫描结果没有任何会话：`empty`。
5. 全量有会话，但当前周期没有会话：`period-empty`。
6. 当前周期有会话：`ready`。

错误状态优先于加载状态，以保持当前错误出现后不显示加载界面的行为。`idle` 是防御性兜底状态，正常启动流程不会长期停留在该状态。

可辨识联合类型让每个分支携带渲染所需的数据，避免组件通过非空断言访问可能缺失的 `result` 或 `filteredSummary`。

## 组件边界

新增 `src/renderer/components/AppContent.tsx`：

- Props 使用 `interface`，只接收一个 `AppContentModel`。
- 使用 `switch (model.kind)` 返回错误、加载、全量空、周期空或正常内容。
- `ready` 分支继续按 `activeView` 渲染现有页面组件，不改变页面职责。
- `idle` 返回 `null`。

`App.tsx` 保留扫描、周期选择、`useMemo` 过滤和状态管理职责，只负责调用 `resolveAppContentModel` 并渲染 `<AppContent model={contentModel} />`。这样主组件不再包含复合 JSX 条件。

`Sidebar.tsx` 的 warning badge 使用具名纯函数：

```ts
const shouldShowWarningBadge = (view: ViewKey, warningCount: number): boolean =>
  view === 'wrapped' && warningCount > 0;
```

JSX 只消费函数结果，不再直接组合判断。

## ESLint 防回归

在现有 `eslint.config.js` 的 TypeScript/TSX 规则中增加 ESLint 原生 `no-restricted-syntax`，覆盖两类结构：

- JSX 三元表达式的 `test` 是 `LogicalExpression`，例如 `{a && b ? <X /> : null}`。
- JSX 中直接使用包含多个逻辑判断的条件渲染链，例如 `{a && b && <X />}`。

规则消息明确要求提取具名布尔变量、纯函数或渲染状态模型。选择器只针对 JSX 条件渲染，不拦截普通 TypeScript 业务表达式，也不拦截单谓词条件或值回退表达式。

实现时使用 ESLint 对最小 TSX 片段验证选择器：复合条件必须报错，单条件三元和值回退必须通过。若单个选择器无法避免误报，则拆分为多个精确选择器，不扩大禁用范围。

## 文档修订

修订 `AGENTS.md` 新增段落：

- 将 `dom` 统一写为 `JSX/DOM`。
- 明确“多个条件”指组合多个业务谓词，而不是组件内出现多个独立的单条件表达式。
- 将“定义为 state”改为“优先提取具名布尔变量或纯函数；只有独立生命周期状态才使用 state”。
- 修复示例中的 `any`、未声明的 `item`、React 保留属性 `key`、缺失参数类型、重复花括号、缩进和分号问题。
- 示例 Props 使用 `interface`，组件使用 `React.FC<Props>`，与文件前文规范一致。

## 测试策略

### 状态判定测试

新增 `tests/appContentModel.test.ts`，至少覆盖：

- error 与 loading 同时存在时选择 error。
- loading 且无 error 时选择 loading。
- 无 result 时选择 idle。
- 全量会话为空时选择 empty。
- 全量有会话、当前周期为空时选择 period-empty。
- 当前周期有会话时选择 ready，并保留 activeView、result 和 summary 引用。

### 组件测试

- 使用 `renderToStaticMarkup` 验证 `AppContent` 各模型渲染对应文案或页面标识。
- 为 `Sidebar` 增加 warning badge 测试：warning 数量大于零时显示，数量为零时不显示。

### 规则验证

- 运行 ESLint 验证仓库内无复合 JSX 条件。
- 使用最小 TSX 片段验证 `no-restricted-syntax` 的正反例，防止选择器误伤单条件和值回退表达式。

## 验收标准

- `App.tsx` 和 `Sidebar.tsx` 不含 JSX 内复合业务判断。
- 应用内容状态只有一个判定入口，分支优先级由测试固定。
- `AGENTS.md` 示例符合其自身的 no-any、Props、命名和格式要求。
- ESLint 能拒绝新增的 JSX 复合条件，并允许单条件和值回退表达式。
- `npm test`、`npm run lint`、`npm run typecheck` 和 `npm run build` 全部通过。
- 应用错误、加载、空数据、周期空数据和正常内容的可见行为保持不变。

## 风险与控制

- **状态优先级改变**：通过纯函数测试固定 error、loading、empty、period-empty、ready 的顺序。
- **类型收窄不足**：使用携带必要数据的可辨识联合类型，不使用非空断言。
- **ESLint 误报值回退**：规则选择器限定到 JSX 条件渲染结构，并用允许用例验证。
- **过度拆分组件**：只新增 `AppContent` 和状态模型，不拆分现有业务页面。
