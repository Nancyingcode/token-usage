# 模型价格 Model ID 组合框实施计划

> **Goal:** 将新增模型价格的 Model ID 文本框改为包含当前模型候选、支持自由新增、并统一展示缺失 ID 未知模型的无障碍组合框。

**Architecture:** 在 Renderer 工具层用纯函数合并价格列表与未计价摘要，输出显式区分具体模型和禁用未知项的候选联合类型；新增价格专用受控组合框负责键盘和 ARIA 交互；`ModelPricingView` 只负责把候选与表单状态连接起来。编辑模式、IPC、持久化与费用计算保持不变。

**Tech Stack:** React 18、TypeScript、i18next、Vitest、Testing Library、CSS。

---

## 任务 1：建立价格模型候选的纯函数边界

**文件：**

- 新建：`src/renderer/utils/pricingModelOptions.ts`
- 新建：`tests/pricingModelOptions.test.tsx`

### 步骤 1：先写失败测试

覆盖以下行为：

- 已定价模型和未计价具体模型均进入候选。
- 按 `normalizeModelId` 去重，冲突时保留价格列表展示 ID。
- 已定价和未计价两组分别稳定排序，已定价在前。
- 多个缺失或空白 ID 只生成一个禁用的未知模型项。
- 不存在缺失 ID 时不生成未知项。
- 构建过程不修改输入数组。

### 步骤 2：运行测试确认红灯

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/pricingModelOptions.test.tsx
```

预期：因模块尚不存在而失败。

### 步骤 3：实现最小纯函数

定义 `PricingModelOption` 判别联合，并实现 `buildPricingModelOptions(pricing, unpricedModels)`。复用 `normalizeModelId`，不引入特殊字符串形式的业务 ID。

### 步骤 4：运行测试确认绿灯

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/pricingModelOptions.test.tsx
```

## 任务 2：实现价格 Model ID 组合框

**文件：**

- 新建：`src/renderer/components/PricingModelCombobox.tsx`
- 新建：`tests/pricingModelCombobox.test.tsx`
- 修改：`src/renderer/styles/views.css`

### 步骤 1：先写失败测试

覆盖以下行为：

- 输入候选外的新 Model ID 会调用 `onChange`。
- 鼠标和键盘可以选择具体候选。
- 方向键跳过禁用的未知模型项。
- 点击禁用项不会改变值。
- Escape 关闭列表，Tab 正常离开。
- 输入框、列表和错误信息具有正确 ARIA 关联。

### 步骤 2：运行测试确认红灯

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/pricingModelCombobox.test.tsx
```

### 步骤 3：实现最小组合框

组合框接收字符串值、候选、本地化标签和错误；内部只维护展开状态与活动候选索引。使用 `role="combobox"`、`listbox`、`option`、`aria-disabled`，并实现方向键、Enter、Escape 和 Tab。

### 步骤 4：补充样式

复用现有预算组合框的视觉变量，为价格组合框增加独立类名；禁用项使用文字和禁用语义表达，不只依赖颜色。

### 步骤 5：运行测试确认绿灯

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/pricingModelCombobox.test.tsx
```

## 任务 3：集成模型价格表单与双语文案

**文件：**

- 修改：`src/renderer/components/ModelPricingView.tsx`
- 修改：`src/shared/i18n/locales/en.ts`
- 修改：`src/shared/i18n/locales/zhCN.ts`
- 修改：`tests/modelPricingView.test.tsx`

### 步骤 1：先写失败的页面集成测试

覆盖以下行为：

- 新增抽屉使用 Model ID 组合框并包含当前候选。
- 缺失 ID 的未知模型只出现一个禁用候选。
- 从具体未计价模型进入新增抽屉时预填对应 ID。
- 编辑已有价格仍使用只读 Model ID。
- 英文和简体中文辅助文案可渲染。

### 步骤 2：运行测试确认红灯

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/modelPricingView.test.tsx
```

### 步骤 3：集成候选和组件

在页面层使用 `useMemo` 构建候选并传给编辑器。新增模式渲染价格组合框，编辑模式保留只读输入。现有字段更新、保存、校验和错误处理函数不变。

### 步骤 4：补齐国际化资源

英文和简体中文同步增加：已定价、未计价、未知模型以及“缺少 Model ID，无法添加价格”的候选辅助文案。组件中不硬编码用户可见字符串。

### 步骤 5：运行受影响测试集

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/pricingModelOptions.test.tsx tests/pricingModelCombobox.test.tsx tests/modelPricingView.test.tsx tests/pricingForm.test.tsx
```

## 任务 4：重构与完整验证

### 步骤 1：运行格式检查并只格式化相关文件

若 Prettier 报告相关文件格式问题，只格式化本计划涉及的文件，不改动无关文件。

### 步骤 2：运行完整验证

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

预期：全部通过且无 warning。若失败，定位根因并修复，不删除测试、不放宽有效断言、不禁用规则。

### 步骤 3：检查变更范围

```powershell
git status --short
git diff --check
```

确认只包含设计、计划、候选工具、组合框、模型价格页面、相关样式、双语资源和对应测试；不提交、不 push。
