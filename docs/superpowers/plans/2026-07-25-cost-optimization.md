# 成本优化功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Codex Token Usage 增加独立、可配置、纯本地的成本优化中心，提供模型成本对比、四层异常检测、自适应趋势预测和可量化节省建议。

**Architecture:** `UsageRuntime` 统一协调扫描并发布文件变更集；价格无关的可逆贡献索引在主进程增量维护并持久化。共享层纯函数负责成本、异常、预测和建议，`CostOptimizationRuntime` 组合查询快照，IPC/preload 将其提供给五标签 React 工作台。

**Tech Stack:** Electron 31、React 18、TypeScript 5.5、electron-vite 2、Vitest 2、i18next 26、lucide-react、Node.js `fs/promises`。

## Global Constraints

- 设计依据：`docs/superpowers/specs/2026-07-25-cost-optimization-design.md`。
- 不新增运行时或开发依赖，不访问网络，不接入账单 API。
- 继续每 60 秒扫描一次，窗口聚焦刷新仍受 10 秒最小间隔约束，并且每轮只扫描一次。
- 只读取 Codex 会话文件；不得修改、删除或上传会话数据，也不得自动修改 Codex 配置。
- 费用均为美元估算；未知模型不得猜测价格，定价覆盖率低于用户配置的安全阈值时隐藏完整预测和节省金额，默认阈值为 80%。
- 模型替代仅比较价格，必须显示“不代表质量、速度或能力等价”。
- 禁止使用 `any` 类型、`var` 声明和硬编码魔法值；业务阈值全部使用具名常量或配置。
- React 组件使用 `React.FC`，Props 使用 `interface`，禁止类组件。
- JSX 内组合两个或更多业务谓词时，提取为具名布尔变量或纯函数；禁止保存可由 props 或现有 state 推导的重复 state。
- 核心业务、运行时、Store 和复杂组件添加符合 `rules/file-header.md` 的中文文件头。
- 所有新增界面同时提供英文和简体中文资源；金额、百分比和日期使用现有 locale formatter。
- 图表和控件可通过键盘操作，颜色不是严重程度、置信度或预测类型的唯一表达。
- 每个任务严格执行红—绿—重构测试循环，且只提交该任务涉及的文件。

## 文件结构

### 共享领域层

- `src/shared/costOptimizationTypes.ts`：设置、索引、查询、分析结果和快照契约。
- `src/shared/costOptimizationValidation.ts`：配置与查询运行时校验。
- `src/shared/costOptimizationIndex.ts`：来源贡献标准化、可逆聚合和变更应用。
- `src/shared/costOptimizationCost.ts`：定价覆盖、实际模型成本和替代场景。
- `src/shared/costOptimizationAnomalies.ts`：稳健统计和四层正向异常检测。
- `src/shared/costOptimizationForecast.ts`：连续日序列、自适应预测和经验区间。
- `src/shared/costOptimizationSuggestions.ts`：三类建议、置信度和重叠去重。
- `src/shared/costOptimizationEvaluation.ts`：将索引、价格、预算、设置和查询组合为快照。

### Electron 主进程

- `src/main/usageRuntime.ts`：统一拥有 `UsageMonitor`，发布完整结果、变更集和 stale 错误。
- `src/main/costOptimizationConfigStore.ts`：版本化设置文件、备份和原子写入。
- `src/main/costOptimizationCacheStore.ts`：版本化索引缓存、结构校验和原子写入。
- `src/main/costOptimizationRuntime.ts`：应用增量、处理失效、保存配置并发布快照。
- `src/main/applicationRuntime.ts`：协调 Usage、Budget 和 Cost Optimization 三个运行时的生命周期。
- 修改 `src/main/usageScanner.ts`：保留现有 `scan()`，新增带 `UsageChangeSet` 的 `scanCycle()`。
- 修改 `src/main/budgetRuntime.ts`：从“拥有扫描器”改为“消费用量结果”。
- 修改 `src/main/ipc.ts`、`src/main/main.ts`：注册新运行时与 IPC。

### Preload 与 Renderer

- `src/renderer/hooks/useCostOptimizationSnapshot.ts`：查询、订阅、配置动作和渲染状态。
- `src/renderer/utils/costOptimizationSnapshotState.ts`：hook 请求竞态和推送匹配的纯 reducer。
- `src/renderer/utils/costOptimizationSettingsForm.ts`：设置表单状态、转换和字段错误映射。
- `src/renderer/components/CostOptimizationView.tsx`：五标签工作台外壳、项目筛选和设置抽屉。
- `src/renderer/components/CostOptimizationOverview.tsx`：指标、预测摘要、优先建议和最新异常。
- `src/renderer/components/ModelCostComparison.tsx`：实际成本表和模型替代场景。
- `src/renderer/components/CostAnomalies.tsx`：四层异常筛选与贡献链。
- `src/renderer/components/CostForecast.tsx`：预测图、经验区间和预算线。
- `src/renderer/components/SavingsRecommendations.tsx`：建议金额、依据、置信度和风险。
- `src/renderer/components/CostOptimizationSettingsDrawer.tsx`：设置编辑与结构化错误。
- 修改 `src/preload/preload.ts`、`src/renderer/global.d.ts`、导航、App 组合、i18n 和样式。

### 测试支持

- `tests/helpers/costOptimizationFixtures.ts`：提供所有任务共享的固定时间、价格、coverage、设置、bucket 和快照工厂。各任务若需要扩展 fixture，必须在该任务的 Files 与 commit 中显式列出，禁止在测试中使用不完整对象断言绕过类型。

---

### Task 1: 建立成本优化领域契约与设置校验

**Files:**
- Create: `src/shared/costOptimizationTypes.ts`
- Create: `src/shared/costOptimizationValidation.ts`
- Create: `tests/helpers/costOptimizationFixtures.ts`
- Create: `tests/costOptimizationValidation.test.ts`

**Interfaces:**
- Produces: `CostOptimizationSettings`、`PersistedCostOptimizationConfig`、`CostOptimizationQuery`。
- Produces: `UsageSourceChange`、`UsageChangeSet`、`CostOptimizationIndex`、`CostOptimizationSnapshot`。
- Produces: `DEFAULT_COST_OPTIMIZATION_SETTINGS`、`getCostOptimizationSettingsIssues()`、`getCostOptimizationQueryIssues()`。
- Consumes: `UsagePeriod`、`UsageSession`、`TokenUsage`、`BudgetPolicyStatus`、`ModelPricingEntry`。

- [ ] **Step 1: 写设置边界和查询校验失败测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COST_OPTIMIZATION_SETTINGS,
  getCostOptimizationQueryIssues,
  getCostOptimizationSettingsIssues,
} from '../src/shared/costOptimizationValidation';

describe('cost optimization validation', () => {
  it('rejects out-of-range analysis settings', () => {
    expect(
      getCostOptimizationSettingsIssues({
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        anomalyHistoryWindow: 6,
        anomalyMinimumSamples: 2,
        anomalySensitivity: 11,
        forecastMinimumHistoryDays: 29,
        minimumSavingsUsd: -1,
        targetCachePercentage: 101,
      }).map(({ field, code }) => ({ field, code }))
    ).toEqual([
      { field: 'anomalyHistoryWindow', code: 'history-window-range' },
      { field: 'anomalyMinimumSamples', code: 'minimum-samples-range' },
      { field: 'anomalySensitivity', code: 'sensitivity-range' },
      { field: 'forecastMinimumHistoryDays', code: 'forecast-history-range' },
      { field: 'minimumSavingsUsd', code: 'minimum-savings-range' },
      { field: 'targetCachePercentage', code: 'percentage-range' },
    ]);
  });

  it('rejects duplicate or unpriced candidate models', () => {
    const issues = getCostOptimizationSettingsIssues(
      {
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        candidateModelIds: ['gpt-test', 'GPT-TEST', 'missing-model'],
      },
      ['gpt-test']
    );

    expect(issues.map(({ code }) => code)).toEqual([
      'candidate-model-duplicate',
      'candidate-model-unpriced',
    ]);
  });

  it('allows only projects present in the current scan', () => {
    expect(
      getCostOptimizationQueryIssues(
        { period: 'month', projectPath: 'C:\\missing' },
        ['C:\\repo']
      )
    ).toEqual([{ field: 'projectPath', code: 'project-not-found' }]);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationValidation.test.ts
```

Expected: FAIL，提示无法解析 `costOptimizationValidation`。

- [ ] **Step 3: 定义精确类型、默认值和校验**

在 `costOptimizationTypes.ts` 定义下列稳定接口；后续任务必须复用这些名称，不得创建平行类型：

```ts
import type { BudgetPolicyStatus, ModelPricingEntry } from './budgetTypes';
import type { TokenUsage, UsagePeriod, UsageSession } from './usageTypes';

export type CostOptimizationDataState = 'fresh' | 'stale';
export type CostOptimizationTab = 'overview' | 'comparison' | 'anomalies' | 'forecast' | 'savings';
export type CostAnomalyLevel = 'day' | 'project' | 'model' | 'session';
export type CostAnomalySeverity = 'warning' | 'critical';
export type SavingsRecommendationType = 'model-substitution' | 'cache-improvement' | 'anomaly-recovery';
export type RecommendationConfidence = 'high' | 'medium';

export interface CostOptimizationSettings {
  anomalyHistoryWindow: number;
  anomalyMinimumSamples: number;
  anomalySensitivity: number;
  forecastHorizonDays: 7 | 30;
  forecastMinimumHistoryDays: number;
  candidateModelIds: string[];
  minimumSavingsUsd: number;
  targetCachePercentage: number;
  minimumPricingCoveragePercentage: number;
}

export interface PersistedCostOptimizationConfig {
  schemaVersion: number;
  settings: CostOptimizationSettings;
}

export interface CostOptimizationQuery {
  period: UsagePeriod;
  projectPath?: string;
}

export interface UsageSourceChange {
  sourceFile: string;
  fingerprint: string;
  session: UsageSession;
}

export interface UsageChangeSet {
  upserted: UsageSourceChange[];
  removedSourceFiles: string[];
  requiresFullRebuild: boolean;
}

export interface IndexedUsageContribution extends TokenUsage {
  id: string;
  sourceFile: string;
  sessionId: string;
  occurredAt: string;
  date: string;
  projectPath: string;
  projectName: string;
  modelId?: string;
}

export interface IndexedUsageBucket extends TokenUsage {
  id: string;
  date?: string;
  projectPath?: string;
  projectName?: string;
  sessionId?: string;
  occurredAt?: string;
  modelId?: string;
  memberCounts: Record<string, number>;
  contributionCounts: Record<string, number>;
}

export interface IndexedUsageSource {
  fingerprint: string;
  contributions: IndexedUsageContribution[];
}

export interface CostOptimizationIndex {
  schemaVersion: number;
  sessionsDir: string;
  generatedAt: string;
  sources: Record<string, IndexedUsageSource>;
  dayModelBuckets: Record<string, IndexedUsageBucket>;
  projectDayModelBuckets: Record<string, IndexedUsageBucket>;
  sessionModelBuckets: Record<string, IndexedUsageBucket>;
}

export interface PricingCoverage {
  pricedTokens: number;
  unpricedTokens: number;
  totalTokens: number;
  percentage: number;
  unpricedModelIds: string[];
}

export interface ModelCostRow extends TokenUsage {
  modelId?: string;
  sessionCount: number;
  pricedCostUsd: number;
  costShare: number;
  averageSessionCostUsd: number;
  coverage: PricingCoverage;
}

export interface ModelSubstitutionScenario {
  sourceModelId?: string;
  targetModelId: string;
  actualCostUsd: number;
  scenarioCostUsd: number;
  savingsUsd: number;
  affectedSessionCount: number;
  contributionIds: string[];
}

export interface CostAnomaly {
  id: string;
  level: CostAnomalyLevel;
  severity: CostAnomalySeverity;
  occurredAt: string;
  date?: string;
  projectPath?: string;
  projectName?: string;
  modelId?: string;
  sessionId?: string;
  actualCostUsd: number;
  baselineCostUsd: number;
  deviationRatio: number;
  score: number;
  sampleCount: number;
  baselineScope: string;
  coverage: PricingCoverage;
  contributionIds: string[];
}

export interface CostForecastPoint {
  date: string;
  predictedCostUsd: number;
  lowerCostUsd: number;
  upperCostUsd: number;
}

export interface DailyCostObservation {
  date: string;
  costUsd: number;
}

export interface CostForecast {
  kind: 'ready';
  method: 'weighted-average' | 'weekday-trend';
  intervalLabel: '80% empirical interval';
  historyDays: number;
  horizonDays: 7 | 30;
  points: CostForecastPoint[];
  projectedCostUsd: number;
  periodEndProjectedCostUsd: number;
  budgetCrossings: Array<{
    policyId: string;
    date: string;
    projectedCostUsd: number;
    limitUsd: number;
  }>;
  coverage: PricingCoverage;
}

export interface InsufficientForecast {
  kind: 'insufficient-data' | 'pricing-incomplete';
  requiredHistoryDays: number;
  actualHistoryDays: number;
  coverage: PricingCoverage;
}

export interface SavingsRecommendation {
  id: string;
  type: SavingsRecommendationType;
  titleKey: string;
  scopeLabel: string;
  savingsUsd: number;
  confidence: RecommendationConfidence;
  evidence: string[];
  riskKey: string;
  contributionSavings: Record<string, number>;
}

export interface CostOptimizationSnapshot {
  generatedAt: string;
  dataState: CostOptimizationDataState;
  staleReason?: string;
  warnings: string[];
  settings: CostOptimizationSettings;
  query: CostOptimizationQuery;
  pricing: ModelPricingEntry[];
  budgets: BudgetPolicyStatus[];
  coverage: PricingCoverage;
  currentCostUsd: number;
  modelRows: ModelCostRow[];
  substitutionScenarios: ModelSubstitutionScenario[];
  anomalies: CostAnomaly[];
  forecast: CostForecast | InsufficientForecast;
  recommendations: SavingsRecommendation[];
  conservativeSavingsUsd: number;
  cacheStats: {
    upsertedSources: number;
    removedSources: number;
    reusedSources: number;
  };
}

export interface CostOptimizationValidationIssue {
  field: string;
  code:
    | 'history-window-range'
    | 'minimum-samples-range'
    | 'sensitivity-range'
    | 'forecast-horizon-invalid'
    | 'forecast-history-range'
    | 'candidate-model-duplicate'
    | 'candidate-model-unpriced'
    | 'minimum-savings-range'
    | 'percentage-range'
    | 'project-not-found';
}
```

在 `costOptimizationValidation.ts` 使用具名常量实现默认值与校验：

```ts
import type {
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationValidationIssue,
} from './costOptimizationTypes';

const MIN_HISTORY_WINDOW = 7;
const MAX_HISTORY_WINDOW = 90;
const MIN_ANOMALY_SAMPLES = 3;
const MIN_SENSITIVITY = 1;
const MAX_SENSITIVITY = 10;
const MIN_FORECAST_HISTORY = 7;
const MAX_FORECAST_HISTORY = 28;
const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 100;

export const DEFAULT_COST_OPTIMIZATION_SETTINGS: CostOptimizationSettings = {
  anomalyHistoryWindow: 28,
  anomalyMinimumSamples: 7,
  anomalySensitivity: 3.5,
  forecastHorizonDays: 30,
  forecastMinimumHistoryDays: 7,
  candidateModelIds: [],
  minimumSavingsUsd: 1,
  targetCachePercentage: 80,
  minimumPricingCoveragePercentage: 80,
};

const isFiniteInRange = (value: number, minimum: number, maximum: number): boolean =>
  Number.isFinite(value) && value >= minimum && value <= maximum;

const normalizeModelId = (modelId: string): string =>
  modelId.trim().toLocaleLowerCase('en-US');

export const getCostOptimizationSettingsIssues = (
  settings: CostOptimizationSettings,
  pricedModelIds: string[] = settings.candidateModelIds
): CostOptimizationValidationIssue[] => {
  const issues: CostOptimizationValidationIssue[] = [];
  const normalizedPricedIds = new Set(pricedModelIds.map(normalizeModelId));
  const seenCandidateIds = new Set<string>();

  if (!Number.isInteger(settings.anomalyHistoryWindow) ||
      !isFiniteInRange(settings.anomalyHistoryWindow, MIN_HISTORY_WINDOW, MAX_HISTORY_WINDOW)) {
    issues.push({ field: 'anomalyHistoryWindow', code: 'history-window-range' });
  }
  if (!Number.isInteger(settings.anomalyMinimumSamples) ||
      !isFiniteInRange(settings.anomalyMinimumSamples, MIN_ANOMALY_SAMPLES, settings.anomalyHistoryWindow)) {
    issues.push({ field: 'anomalyMinimumSamples', code: 'minimum-samples-range' });
  }
  if (!isFiniteInRange(settings.anomalySensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY)) {
    issues.push({ field: 'anomalySensitivity', code: 'sensitivity-range' });
  }
  if (settings.forecastHorizonDays !== 7 && settings.forecastHorizonDays !== 30) {
    issues.push({ field: 'forecastHorizonDays', code: 'forecast-horizon-invalid' });
  }
  if (!Number.isInteger(settings.forecastMinimumHistoryDays) ||
      !isFiniteInRange(settings.forecastMinimumHistoryDays, MIN_FORECAST_HISTORY, MAX_FORECAST_HISTORY)) {
    issues.push({ field: 'forecastMinimumHistoryDays', code: 'forecast-history-range' });
  }

  settings.candidateModelIds.forEach((modelId) => {
    const normalizedModelId = normalizeModelId(modelId);
    if (seenCandidateIds.has(normalizedModelId)) {
      issues.push({ field: 'candidateModelIds', code: 'candidate-model-duplicate' });
    } else if (!normalizedPricedIds.has(normalizedModelId)) {
      issues.push({ field: 'candidateModelIds', code: 'candidate-model-unpriced' });
    }
    seenCandidateIds.add(normalizedModelId);
  });

  if (!Number.isFinite(settings.minimumSavingsUsd) || settings.minimumSavingsUsd < 0) {
    issues.push({ field: 'minimumSavingsUsd', code: 'minimum-savings-range' });
  }
  if (!isFiniteInRange(settings.targetCachePercentage, MIN_PERCENTAGE, MAX_PERCENTAGE)) {
    issues.push({ field: 'targetCachePercentage', code: 'percentage-range' });
  }
  if (!isFiniteInRange(settings.minimumPricingCoveragePercentage, MIN_PERCENTAGE, MAX_PERCENTAGE)) {
    issues.push({ field: 'minimumPricingCoveragePercentage', code: 'percentage-range' });
  }
  return issues;
};

export const getCostOptimizationQueryIssues = (
  query: CostOptimizationQuery,
  projectPaths: string[]
): CostOptimizationValidationIssue[] =>
  query.projectPath && !projectPaths.includes(query.projectPath)
    ? [{ field: 'projectPath', code: 'project-not-found' }]
    : [];
```

创建共享测试 fixture 的基础常量；后续测试统一从该文件导入，不重复价格或默认设置：

```ts
import type { ModelPricingEntry } from '../../src/shared/budgetTypes';
import type {
  CostForecast,
  CostOptimizationIndex,
  CostOptimizationSnapshot,
  IndexedUsageBucket,
  PricingCoverage,
  UsageSourceChange,
} from '../../src/shared/costOptimizationTypes';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../../src/shared/costOptimizationValidation';

export const FIXED_NOW = new Date('2026-07-25T12:00:00.000Z');
export const FIXED_NOW_ISO = FIXED_NOW.toISOString();
export const SETTINGS = {
  ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
  candidateModelIds: ['gpt-target'],
};
export const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-source',
    aliases: [],
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 10,
    effectiveAt: '2026-07-01',
    sourceKind: 'built-in',
  },
  {
    modelId: 'gpt-target',
    aliases: [],
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.25,
    outputUsdPerMillion: 5,
    effectiveAt: '2026-07-01',
    sourceKind: 'built-in',
  },
];
export const COVERAGE: PricingCoverage = {
  pricedTokens: 1_100_000,
  unpricedTokens: 0,
  totalTokens: 1_100_000,
  percentage: 100,
  unpricedModelIds: [],
};

export const makeBucket = (
  modelId: string | undefined,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number
): IndexedUsageBucket => ({
  id: `${modelId ?? 'unknown'}:2026-07-24`,
  date: '2026-07-24',
  modelId,
  inputTokens,
  cachedInputTokens,
  outputTokens,
  reasoningOutputTokens: 0,
  totalTokens: inputTokens + outputTokens,
  memberCounts: { session: 1 },
  contributionCounts: { contribution: 1 },
});

export const makeIndex = (buckets: IndexedUsageBucket[]): CostOptimizationIndex => ({
  schemaVersion: 1,
  sessionsDir: 'C:\\sessions',
  generatedAt: FIXED_NOW_ISO,
  sources: {},
  dayModelBuckets: Object.fromEntries(buckets.map((bucket) => [bucket.id, bucket])),
  projectDayModelBuckets: {},
  sessionModelBuckets: {},
});

export const makeSourceChange = (
  sourceFile: string,
  fingerprint: string,
  totalTokens: number
): UsageSourceChange => ({
  sourceFile,
  fingerprint,
  session: {
    sessionId: sourceFile,
    startedAt: '2026-07-24T12:00:00.000Z',
    endedAt: '2026-07-24T12:00:00.000Z',
    projectPath: 'C:\\repo',
    projectName: 'repo',
    usageSlices: [
      {
        occurredAt: '2026-07-24T12:00:00.000Z',
        modelId: 'gpt-source',
        inputTokens: totalTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens,
      },
    ],
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens,
    eventCount: 1,
    sourceFile,
    warnings: [],
  },
});

export const READY_FORECAST: CostForecast = {
  kind: 'ready',
  method: 'weekday-trend',
  intervalLabel: '80% empirical interval',
  historyDays: 56,
  horizonDays: 30,
  points: [
    {
      date: '2026-07-26',
      predictedCostUsd: 2,
      lowerCostUsd: 1,
      upperCostUsd: 3,
    },
  ],
  projectedCostUsd: 60,
  periodEndProjectedCostUsd: 63.7,
  budgetCrossings: [
    {
      policyId: 'monthly-cost',
      date: '2026-08-20',
      projectedCostUsd: 70,
      limitUsd: 70,
    },
  ],
  coverage: COVERAGE,
};

export const SNAPSHOT: CostOptimizationSnapshot = {
  generatedAt: FIXED_NOW_ISO,
  dataState: 'fresh',
  warnings: [],
  settings: SETTINGS,
  query: { period: 'month' },
  pricing: PRICING,
  budgets: [],
  coverage: COVERAGE,
  currentCostUsd: 48.2,
  modelRows: [
    {
      modelId: 'gpt-source',
      inputTokens: 1_000_000,
      cachedInputTokens: 200_000,
      outputTokens: 100_000,
      reasoningOutputTokens: 0,
      totalTokens: 1_100_000,
      sessionCount: 7,
      pricedCostUsd: 2.7,
      costShare: 1,
      averageSessionCostUsd: 2.7 / 7,
      coverage: COVERAGE,
    },
  ],
  substitutionScenarios: [
    {
      sourceModelId: 'gpt-source',
      targetModelId: 'gpt-target',
      actualCostUsd: 2.7,
      scenarioCostUsd: 1.35,
      savingsUsd: 1.35,
      affectedSessionCount: 7,
      contributionIds: ['contribution-1'],
    },
  ],
  anomalies: [
    {
      id: 'day-2026-07-24',
      level: 'day',
      severity: 'warning',
      occurredAt: '2026-07-24T23:59:59.000Z',
      date: '2026-07-24',
      actualCostUsd: 8,
      baselineCostUsd: 3,
      deviationRatio: 8 / 3,
      score: 4,
      sampleCount: 28,
      baselineScope: 'global-day',
      coverage: COVERAGE,
      contributionIds: ['contribution-1'],
    },
    {
      id: 'session-session-1',
      level: 'session',
      severity: 'critical',
      occurredAt: '2026-07-24T12:00:00.000Z',
      sessionId: 'session-1',
      projectPath: 'C:\\repo',
      projectName: 'repo',
      modelId: 'gpt-source',
      actualCostUsd: 5,
      baselineCostUsd: 1,
      deviationRatio: 5,
      score: 8,
      sampleCount: 28,
      baselineScope: 'project-model',
      coverage: COVERAGE,
      contributionIds: ['contribution-1'],
    },
  ],
  forecast: READY_FORECAST,
  recommendations: [
    {
      id: 'model-substitution:gpt-source:gpt-target',
      type: 'model-substitution',
      titleKey: 'recommendation.modelSubstitution',
      scopeLabel: 'gpt-source → gpt-target',
      savingsUsd: 11.8,
      confidence: 'high',
      evidence: ['7 sessions', '100% pricing coverage'],
      riskKey: 'risk.modelEquivalence',
      contributionSavings: { 'contribution-1': 11.8 },
    },
  ],
  conservativeSavingsUsd: 17.4,
  cacheStats: {
    upsertedSources: 0,
    removedSources: 0,
    reusedSources: 1,
  },
};
```

- [ ] **Step 4: 运行测试和类型检查**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationValidation.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交领域契约**

```powershell
git add src/shared/costOptimizationTypes.ts src/shared/costOptimizationValidation.ts tests/helpers/costOptimizationFixtures.ts tests/costOptimizationValidation.test.ts
git commit -m "feat: add cost optimization domain contracts"
```

### Task 2: 让扫描器发布变更集并建立统一用量运行时

**Files:**
- Modify: `src/main/usageScanner.ts:18`
- Create: `src/main/usageRuntime.ts`
- Modify: `tests/usageScanner.test.ts:60`
- Create: `tests/usageRuntime.test.ts`

**Interfaces:**
- Consumes: `UsageChangeSet`、`UsageSourceChange`。
- Produces: `UsageScanCycle { result, changes }`。
- Produces: `UsageScanner.scanCycle(options)`，并保持 `UsageScanner.scan(options)` 返回原有 `UsageScanResult`。
- Produces: `UsageRuntime.refresh()`、`refreshOnFocus()`、`subscribe()`、`subscribeCycle()`、`subscribeError()`、`start()`、`stop()`。

- [ ] **Step 1: 写新增、复用、修改和删除文件的变更集测试**

在 `tests/usageScanner.test.ts` 增加：

```ts
it('publishes only changed and removed sources in scan cycles', async () => {
  const sessionFile = join(testDirectory, 'delta.jsonl');
  const missingIndexPath = join(testDirectory, 'missing-index.jsonl');
  await writeFile(sessionFile, validSession('delta', '2026-07-16T00:00:00.000Z'));
  const scanner = createUsageScanner();

  const first = await scanner.scanCycle({
    sessionsDir: testDirectory,
    sessionIndexPath: missingIndexPath,
  });
  expect(first.changes.upserted.map(({ sourceFile }) => sourceFile)).toEqual([sessionFile]);
  expect(first.changes.removedSourceFiles).toEqual([]);

  const unchanged = await scanner.scanCycle({
    sessionsDir: testDirectory,
    sessionIndexPath: missingIndexPath,
  });
  expect(unchanged.changes.upserted).toEqual([]);
  expect(unchanged.changes.removedSourceFiles).toEqual([]);

  await appendFile(sessionFile, '\n');
  const modified = await scanner.scanCycle({
    sessionsDir: testDirectory,
    sessionIndexPath: missingIndexPath,
  });
  expect(modified.changes.upserted).toHaveLength(1);

  await unlink(sessionFile);
  const removed = await scanner.scanCycle({
    sessionsDir: testDirectory,
    sessionIndexPath: missingIndexPath,
  });
  expect(removed.changes.removedSourceFiles).toEqual([sessionFile]);
});
```

- [ ] **Step 2: 写 UsageRuntime 单次刷新和订阅测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createUsageRuntime } from '../src/main/usageRuntime';
import type { UsageScanCycle } from '../src/main/usageScanner';

describe('usage runtime', () => {
  it('shares one active refresh and publishes the same cycle once', async () => {
    const cycle: UsageScanCycle = {
      result: {
        sessionsDir: 'C:\\sessions',
        scannedAt: '2026-07-25T00:00:00.000Z',
        summary: {
          totals: {
            inputTokens: 0,
            cachedInputTokens: 0,
            outputTokens: 0,
            reasoningOutputTokens: 0,
            totalTokens: 0,
          },
          byDay: [],
          byProject: [],
          sessions: [],
        },
        warnings: [],
      },
      changes: {
        upserted: [],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
    };
    const scanCycle = vi.fn(async (): Promise<UsageScanCycle> => cycle);
    const runtime = createUsageRuntime({
      scanCycle,
      now: () => 0,
      setIntervalFn: vi.fn(() => 1),
      clearIntervalFn: vi.fn(),
    });
    const listener = vi.fn();
    runtime.subscribeCycle(listener);

    const [first, second] = await Promise.all([runtime.refresh(), runtime.refresh()]);

    expect(first).toBe(cycle.result);
    expect(second).toBe(cycle.result);
    expect(scanCycle).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(cycle);
  });
});
```

- [ ] **Step 3: 运行测试并确认接口缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageScanner.test.ts tests/usageRuntime.test.ts
```

Expected: FAIL，提示 `scanCycle` 和 `usageRuntime` 不存在。

- [ ] **Step 4: 扩展扫描器且保持旧 API**

在 `usageScanner.ts` 新增：

```ts
export interface UsageScanCycle {
  result: UsageScanResult;
  changes: UsageChangeSet;
}

export interface UsageScanner {
  scan: (options?: ScanOptions) => Promise<UsageScanResult>;
  scanCycle: (options?: ScanOptions) => Promise<UsageScanCycle>;
}
```

`scanCycle()` 在读取前保存旧缓存路径集合，在完成后构建：

```ts
const removedSourceFiles = [...previousCachedPaths]
  .filter((path) => !discoveredPaths.has(path))
  .sort((first, second) => first.localeCompare(second));
const upserted = fileResults.flatMap(({ session, fingerprint, cacheHit }) =>
  session && fingerprint && !cacheHit
    ? [{ sourceFile: session.sourceFile, fingerprint, session }]
    : []
);

return {
  result: {
    sessionsDir,
    scannedAt,
    summary: buildUsageSummary(sessions),
    warnings,
  },
  changes: {
    upserted,
    removedSourceFiles,
    requiresFullRebuild: false,
  },
};
```

`scan()` 必须简单委托 `scanCycle()`：

```ts
const scan = async (options: ScanOptions = {}): Promise<UsageScanResult> =>
  (await scanCycle(options)).result;
```

文件读取失败时删除该文件的旧缓存，并把旧来源加入 `removedSourceFiles`，保证完整结果与增量索引一致。

- [ ] **Step 5: 实现统一 UsageRuntime**

`usageRuntime.ts` 使用现有 `createUsageMonitor`，但内部扫描函数返回 cycle、对外 refresh 返回 result：

```ts
export interface UsageRuntime {
  refresh: () => Promise<UsageScanResult>;
  refreshOnFocus: () => Promise<UsageScanResult | undefined>;
  getResult: () => UsageScanResult | undefined;
  subscribe: (listener: (result: UsageScanResult) => void) => () => void;
  subscribeCycle: (listener: (cycle: UsageScanCycle) => void | Promise<void>) => () => void;
  subscribeError: (listener: (error: unknown) => void) => () => void;
  start: () => void;
  stop: () => void;
}
```

实现必须：

- 复用 `createUsageMonitor` 的单飞、60 秒和聚焦节流语义。
- 在成功扫描后先保存 `lastResult`，再依次等待所有 cycle listener，最后发布 result；`refresh()` 只有在异步 cycle consumer 完成后才 resolve。
- 在失败时发布 error，不清空最后成功结果。
- 所有订阅函数返回幂等取消函数。

- [ ] **Step 6: 运行扫描相关回归**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/usageScanner.test.ts tests/usageRuntime.test.ts tests/usageMonitor.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS，且原有 scanner 读取次数断言保持不变。

- [ ] **Step 7: 提交扫描增量**

```powershell
git add src/main/usageScanner.ts src/main/usageRuntime.ts tests/usageScanner.test.ts tests/usageRuntime.test.ts
git commit -m "feat: publish incremental usage scan cycles"
```

### Task 3: 实现可逆贡献索引和缓存 Store

**Files:**
- Create: `src/shared/costOptimizationIndex.ts`
- Create: `src/main/costOptimizationCacheStore.ts`
- Create: `tests/costOptimizationIndex.test.ts`
- Create: `tests/costOptimizationCacheStore.test.ts`

**Interfaces:**
- Consumes: `UsageChangeSet`、`CostOptimizationIndex`、`getSessionUsageSlices()`。
- Produces: `createEmptyCostOptimizationIndex()`、`rebuildCostOptimizationIndex()`、`applyUsageChangeSet()`。
- Produces: `CostOptimizationCacheStore.load()` 和 `save(index)`。

- [ ] **Step 1: 写索引新增、替换和删除测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  applyUsageChangeSet,
  createEmptyCostOptimizationIndex,
} from '../src/shared/costOptimizationIndex';

describe('cost optimization index', () => {
  it('reverses old contributions before applying a changed source', () => {
    const empty = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);
    const first = applyUsageChangeSet(
      empty,
      { upserted: [makeSourceChange('usage.jsonl', '1', 100)], removedSourceFiles: [], requiresFullRebuild: false },
      FIXED_NOW
    );
    const changed = applyUsageChangeSet(
      first,
      { upserted: [makeSourceChange('usage.jsonl', '2', 250)], removedSourceFiles: [], requiresFullRebuild: false },
      FIXED_NOW
    );

    expect(
      Object.values(changed.dayModelBuckets).reduce(
        (total, bucket) => total + bucket.totalTokens,
        0
      )
    ).toBe(250);
    expect(changed.sources['usage.jsonl'].fingerprint).toBe('2');
  });

  it('removes source contributions and zero buckets', () => {
    const indexed = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      { upserted: [makeSourceChange('usage.jsonl', '1', 100)], removedSourceFiles: [], requiresFullRebuild: false },
      FIXED_NOW
    );
    const removed = applyUsageChangeSet(
      indexed,
      { upserted: [], removedSourceFiles: ['usage.jsonl'], requiresFullRebuild: false },
      FIXED_NOW
    );

    expect(removed.sources).toEqual({});
    expect(removed.dayModelBuckets).toEqual({});
    expect(removed.projectDayModelBuckets).toEqual({});
    expect(removed.sessionModelBuckets).toEqual({});
  });
});
```

- [ ] **Step 2: 写缓存损坏、版本失效和原子保存测试**

```ts
it('returns a rebuild warning for malformed cache without backing it up', async () => {
  await writeFile(cachePath, '{broken', 'utf8');
  const result = await createCostOptimizationCacheStore(cachePath).load();

  expect(result.index).toBeUndefined();
  expect(result.warning).toBe('Cost optimization cache will be rebuilt.');
});

it('round-trips a structurally valid index through one cache file', async () => {
  const store = createCostOptimizationCacheStore(cachePath);
  const index = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);

  await store.save(index);

  await expect(store.load()).resolves.toEqual({ index, warning: undefined });
  await expect(readdir(testDirectory)).resolves.toEqual(['cost-optimization-cache.json']);
});
```

- [ ] **Step 3: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts
```

Expected: FAIL，提示索引与 Store 模块不存在。

- [ ] **Step 4: 实现贡献标准化和三类价格安全桶**

`costOptimizationIndex.ts` 使用具名 bucket key 构造器：

```ts
const INDEX_SCHEMA_VERSION = 1;
const UNKNOWN_MODEL_KEY = 'unknown-model';
const KEY_SEPARATOR = '\u001f';

const getModelKey = (modelId: string | undefined): string =>
  modelId?.trim().toLocaleLowerCase('en-US') || UNKNOWN_MODEL_KEY;

const getDayModelBucketId = (date: string, modelId: string | undefined): string =>
  ['day-model', date, getModelKey(modelId)].join(KEY_SEPARATOR);

const getProjectDayModelBucketId = (
  projectPath: string,
  date: string,
  modelId: string | undefined
): string => ['project-day-model', projectPath, date, getModelKey(modelId)].join(KEY_SEPARATOR);

const getSessionModelBucketId = (sessionId: string, modelId: string | undefined): string =>
  ['session-model', sessionId, getModelKey(modelId)].join(KEY_SEPARATOR);
```

每个 usage slice 转换为一个 `IndexedUsageContribution`；没有 slice 的非零会话使用 `getSessionUsageSlices()` 的兜底切片。每次添加或撤销贡献时同步更新：

- `dayModelBuckets`
- `projectDayModelBuckets`
- `sessionModelBuckets`
- `memberCounts[sessionId]`
- `contributionCounts[contributionId]`

Token 数量降至零且 `memberCounts`、`contributionCounts` 均为空时删除 bucket。所有返回对象均创建新引用，不原地修改输入 index。

- [ ] **Step 5: 实现缓存结构校验与原子写入**

`costOptimizationCacheStore.ts`：

- 缺少文件时返回 `{ index: undefined, warning: undefined }`。
- JSON、schema 或结构无效时返回 rebuild warning。
- 校验 `sources` 贡献总量分别等于三类 bucket 的对应顶层总量。
- 保存到 `${cachePath}.tmp` 后使用 `rename()` 替换目标。
- 保存失败时删除临时文件并重新抛出原错误。

- [ ] **Step 6: 运行索引测试、格式检查和类型检查**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 7: 提交增量索引**

```powershell
git add src/shared/costOptimizationIndex.ts src/main/costOptimizationCacheStore.ts tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts
git commit -m "feat: add reversible cost usage index"
```

### Task 4: 实现定价覆盖、模型实耗和替代场景

**Files:**
- Create: `src/shared/costOptimizationCost.ts`
- Create: `tests/costOptimizationCost.test.ts`

**Interfaces:**
- Consumes: `CostOptimizationIndex`、`CostOptimizationQuery`、`ModelPricingEntry[]`。
- Produces: `selectQueryBuckets()`、`getPricingCoverage()`、`evaluateModelCosts()`、`evaluateSubstitutionScenarios()`。

- [ ] **Step 1: 写实际成本、未计价覆盖和替代场景测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  evaluateModelCosts,
  evaluateSubstitutionScenarios,
} from '../src/shared/costOptimizationCost';

describe('cost optimization cost analysis', () => {
  it('keeps unpriced tokens while pricing known models', () => {
    const rows = evaluateModelCosts(
      makeIndex([
        makeBucket('gpt-source', 1_000_000, 200_000, 100_000),
        makeBucket(undefined, 500_000, 0, 0),
      ]),
      { period: 'total' },
      PRICING,
      FIXED_NOW
    );

    expect(rows[0]).toEqual(
      expect.objectContaining({
        modelId: 'gpt-source',
        pricedCostUsd: 2.7,
        coverage: expect.objectContaining({ percentage: 100 }),
      })
    );
    expect(rows[1].coverage).toEqual(
      expect.objectContaining({ pricedTokens: 0, unpricedTokens: 500_000 })
    );
  });

  it('reprices the same token composition for candidate models', () => {
    const scenarios = evaluateSubstitutionScenarios(
      makeIndex([makeBucket('gpt-source', 1_000_000, 200_000, 100_000)]),
      { period: 'total' },
      PRICING,
      ['gpt-target'],
      0,
      FIXED_NOW
    );

    expect(scenarios).toEqual([
      expect.objectContaining({
        sourceModelId: 'gpt-source',
        targetModelId: 'gpt-target',
        actualCostUsd: 2.7,
        scenarioCostUsd: 1.35,
        savingsUsd: 1.35,
      }),
    ]);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationCost.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现查询范围、定价索引和成本行**

实现规则：

- `today/week/month` 使用本地日历起点，与 `filterUsageSummary()` 现有口径一致；`total` 不裁剪。
- 未选择项目时读取 `dayModelBuckets`，选择项目时读取 `projectDayModelBuckets`。
- 普通输入为 `max(inputTokens - cachedInputTokens, 0)`。
- 推理输出已包含于 output/total 语义，不重复计价。
- coverage 百分比为 `pricedTokens / totalTokens × 100`，总 Token 为零时为 100。
- 模型行按 `pricedCostUsd` 降序，未计价行排在已计价行之后。
- 替代场景按历史真实 Token 构成重新定价，保留贡献 ID 和去重会话数。

使用下列内部结果防止遗漏价格状态：

```ts
interface PricedBucket {
  pricedCostUsd: number;
  pricedTokens: number;
  unpricedTokens: number;
  unpricedModelIds: string[];
}
```

- [ ] **Step 4: 运行领域测试和现有 pricing 回归**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationCost.test.ts tests/pricing.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交成本分析**

```powershell
git add src/shared/costOptimizationCost.ts tests/costOptimizationCost.test.ts
git commit -m "feat: compare model costs and scenarios"
```

### Task 5: 实现日、项目、模型和会话四层异常检测

**Files:**
- Create: `src/shared/costOptimizationAnomalies.ts`
- Create: `tests/costOptimizationAnomalies.test.ts`

**Interfaces:**
- Consumes: 索引、查询、价格、`CostOptimizationSettings`。
- Produces: `median()`、`medianAbsoluteDeviation()`、`detectCostAnomalies()`。
- Produces: `CostAnomaly[]`，仅包含正向且定价覆盖达标的异常。

- [ ] **Step 1: 写稳健分数、MAD 零降级和四层输出测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  detectCostAnomalies,
  median,
  medianAbsoluteDeviation,
} from '../src/shared/costOptimizationAnomalies';

describe('cost anomaly detection', () => {
  it('calculates median and MAD without mutating input', () => {
    const values = [1, 1, 2, 100];
    expect(median(values)).toBe(1.5);
    expect(medianAbsoluteDeviation(values, 1.5)).toBe(0.5);
    expect(values).toEqual([1, 1, 2, 100]);
  });

  it('uses the absolute scale floor when MAD is zero', () => {
    const anomalies = detectCostAnomalies(
      makeDailyIndex([1, 1, 1, 1, 1, 1, 1, 2]),
      { period: 'total' },
      PRICING,
      { ...SETTINGS, anomalyMinimumSamples: 7, anomalySensitivity: 3.5 },
      FIXED_NOW
    );

    expect(anomalies).toContainEqual(
      expect.objectContaining({
        level: 'day',
        actualCostUsd: 2,
        baselineCostUsd: 1,
        severity: 'warning',
      })
    );
  });

  it('links day, project, model and session anomalies to contributions', () => {
    const anomalies = detectCostAnomalies(
      makeFourLevelSpikeIndex(),
      { period: 'total' },
      PRICING,
      SETTINGS,
      FIXED_NOW
    );

    expect(new Set(anomalies.map(({ level }) => level)).toEqual(
      new Set(['day', 'project', 'model', 'session'])
    );
    expect(anomalies.every(({ contributionIds }) => contributionIds.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationAnomalies.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现只使用过去观测的稳健异常引擎**

具名常量：

```ts
const MAD_SCALE_FACTOR = 1.4826;
const ZERO_MAD_RELATIVE_SCALE = 0.25;
const ZERO_MAD_ABSOLUTE_SCALE_USD = 0.01;
const CRITICAL_SCORE_MULTIPLIER = 2;
```

实现顺序：

1. 从完整历史的 price-safe buckets 生成日、项目日、模型日和会话费用观测；query 周期只限制返回哪些当前异常，不裁掉建立基线所需的更早历史。
2. 每个当前观测只使用时间早于自身的历史，截取 `anomalyHistoryWindow`。
3. 会话历史依次选择同项目同模型、同模型、全局，并记录 `baselineScope`。
4. 样本少于 `anomalyMinimumSamples` 或 coverage 低于安全阈值时跳过。
5. `scale = MAD > 0 ? 1.4826 × MAD : max(median × 0.25, 0.01)`。
6. `score = (actual - median) / scale`；低于 sensitivity 跳过，达到两倍 sensitivity 为 critical。
7. 结果按严重程度、费用增量、发生时间排序，并使用层级和贡献键生成稳定 ID。

- [ ] **Step 4: 运行异常测试和类型检查**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationAnomalies.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交异常检测**

```powershell
git add src/shared/costOptimizationAnomalies.ts tests/costOptimizationAnomalies.test.ts
git commit -m "feat: detect layered cost anomalies"
```

### Task 6: 实现自适应费用预测和预算超限日期

**Files:**
- Create: `src/shared/costOptimizationForecast.ts`
- Create: `tests/costOptimizationForecast.test.ts`

**Interfaces:**
- Consumes: 查询范围日费用、设置、定价覆盖和费用预算。
- Produces: `buildContinuousDailyCosts()`、`forecastCostTrend()`。
- Produces: `CostForecast | InsufficientForecast`。

`forecastCostTrend` 使用单一输入对象：

```ts
export interface ForecastCostInput {
  dailyCosts: DailyCostObservation[];
  settings: CostOptimizationSettings;
  budgets: BudgetPolicyStatus[];
  coverage: PricingCoverage;
  query: CostOptimizationQuery;
  currentPeriodCostUsd: number;
  now: Date;
}
```

- [ ] **Step 1: 写样本不足、加权均值、星期趋势和非负区间测试**

```ts
import { describe, expect, it } from 'vitest';
import { forecastCostTrend } from '../src/shared/costOptimizationForecast';

describe('cost forecasting', () => {
  it('returns insufficient data before the configured minimum', () => {
    const result = forecastCostTrend({
      dailyCosts: makeDailyCosts(6, () => 1),
      settings: SETTINGS,
      budgets: [],
      coverage: COVERAGE,
      query: { period: 'month' },
      currentPeriodCostUsd: 6,
      now: FIXED_NOW,
    });
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'insufficient-data',
        requiredHistoryDays: 7,
        actualHistoryDays: 6,
      })
    );
  });

  it('uses weighted average from the minimum through day 27', () => {
    const result = forecastCostTrend({
      dailyCosts: makeDailyCosts(7, (index) => index + 1),
      settings: { ...SETTINGS, forecastHorizonDays: 7 },
      budgets: [],
      coverage: COVERAGE,
      query: { period: 'month' },
      currentPeriodCostUsd: 28,
      now: FIXED_NOW,
    });

    expect(result).toEqual(expect.objectContaining({ kind: 'ready', method: 'weighted-average' }));
    if (result.kind === 'ready') {
      expect(result.points).toHaveLength(7);
      expect(result.points.every(({ lowerCostUsd }) => lowerCostUsd >= 0)).toBe(true);
    }
  });

  it('uses weekday baselines and reports the earliest budget crossing after 28 days', () => {
    const result = forecastCostTrend({
      dailyCosts: makeWeekdayPatternCosts(56),
      settings: { ...SETTINGS, forecastHorizonDays: 30 },
      budgets: [makeCostBudget('monthly-cost', 60)],
      coverage: COVERAGE,
      query: { period: 'month' },
      currentPeriodCostUsd: 50,
      now: FIXED_NOW,
    });

    expect(result).toEqual(expect.objectContaining({ kind: 'ready', method: 'weekday-trend' }));
    if (result.kind === 'ready') {
      expect(result.budgetCrossings[0]?.policyId).toBe('monthly-cost');
      expect(result.intervalLabel).toBe('80% empirical interval');
    }
  });
});
```

测试文件使用以下确定性 factory：

```ts
const MILLISECONDS_PER_DAY = 86_400_000;

const makeDailyCosts = (
  count: number,
  getCost: (index: number) => number
): DailyCostObservation[] =>
  Array.from({ length: count }, (_, index) => ({
    date: new Date(
      FIXED_NOW.getTime() - (count - index) * MILLISECONDS_PER_DAY
    ).toISOString().slice(0, 10),
    costUsd: getCost(index),
  }));

const makeWeekdayPatternCosts = (count: number): DailyCostObservation[] =>
  makeDailyCosts(count, (index) => (index % 7 < 5 ? 2 : 1) + index * 0.02);

const makeCostBudget = (id: string, limitUsd: number): BudgetPolicyStatus => ({
  policy: {
    id,
    scope: 'global',
    period: 'month',
    costLimitUsd: limitUsd,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  periodStart: '2026-07-01T00:00:00.000Z',
  periodEnd: FIXED_NOW.toISOString(),
  cost: {
    used: 50,
    limit: limitUsd,
    percent: (50 / limitUsd) * 100,
    severity: 'normal',
  },
  unpricedTokens: 0,
  unpricedModelIds: [],
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationForecast.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现连续序列和两种预测方法**

具名常量：

```ts
const WEIGHT_DECAY = 0.85;
const WEEKDAY_METHOD_MINIMUM_DAYS = 28;
const MAX_WEEKDAY_OBSERVATIONS = 8;
const MAD_SCALE_FACTOR = 1.4826;
const EMPIRICAL_INTERVAL_FACTOR = 1.28;
const DAYS_PER_WEEK = 7;
```

实现规则：

- 从所选项目的完整历史最早日期到当前本地日期补齐零费用日；query 报告期不裁剪预测基线。
- 7–27 天：最近日权重 1，向前乘 0.85，未来每日使用同一个加权均值。
- 28 天以上：每个未来星期使用最近最多 8 个同星期值的中位数，加上最近 28 天 Theil–Sen 斜率乘预测步数。
- Theil–Sen 斜率为所有点对斜率的中位数。
- 用历史拟合残差的 `1.4826 × MAD` 作为残差尺度，上下各 `1.28 × scale`。
- 点预测和下界使用 `Math.max(value, 0)`。
- `period === 'total'` 时 `periodEndProjectedCostUsd` 等于预测周期累计；其他周期累计当前已用与周期剩余预测。
- 对每个适用费用预算计算跨越日期并写入 `budgetCrossings`；按日期升序排序，相同日期把剩余额更小者放前面。总览使用数组第一项。

- [ ] **Step 4: 运行预测测试和预算周期回归**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationForecast.test.ts tests/budgetPeriods.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交预测引擎**

```powershell
git add src/shared/costOptimizationForecast.ts tests/costOptimizationForecast.test.ts
git commit -m "feat: forecast cost trends and budget crossings"
```

### Task 7: 实现节省建议、置信度和重叠去重

**Files:**
- Create: `src/shared/costOptimizationSuggestions.ts`
- Create: `tests/costOptimizationSuggestions.test.ts`

**Interfaces:**
- Consumes: contributions、模型替代场景、异常、设置、价格和 coverage。
- Produces: `buildSavingsRecommendations()`、`getConservativeSavingsUsd()`。

```ts
export interface SavingsRecommendationInput {
  contributions: IndexedUsageContribution[];
  substitutionScenarios: ModelSubstitutionScenario[];
  anomalies: CostAnomaly[];
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
  coverage: PricingCoverage;
}
```

- [ ] **Step 1: 写三类建议和去重金额测试**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildSavingsRecommendations,
  getConservativeSavingsUsd,
} from '../src/shared/costOptimizationSuggestions';

describe('cost optimization suggestions', () => {
  it('creates quantified model, cache and anomaly recommendations', () => {
    const recommendations = buildSavingsRecommendations(makeSuggestionInput());

    expect(recommendations.map(({ type }) => type)).toEqual([
      'model-substitution',
      'anomaly-recovery',
      'cache-improvement',
    ]);
    expect(recommendations[0]).toEqual(
      expect.objectContaining({ confidence: 'high', riskKey: 'risk.modelEquivalence' })
    );
    expect(recommendations[2]).toEqual(
      expect.objectContaining({ confidence: 'medium', riskKey: 'risk.cacheEligibility' })
    );
  });

  it('uses the largest saving per contribution instead of summing overlaps', () => {
    const recommendations = [
      makeRecommendation('model-substitution', { a: 5, b: 2 }),
      makeRecommendation('anomaly-recovery', { a: 3, c: 4 }),
    ];

    expect(getConservativeSavingsUsd(recommendations)).toBe(11);
  });

  it('suppresses monetary suggestions below pricing coverage and savings thresholds', () => {
    const recommendations = buildSavingsRecommendations({
      ...makeSuggestionInput(),
      coverage: { ...COVERAGE, percentage: 50 },
    });
    expect(recommendations).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationSuggestions.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现建议金额和置信度**

规则：

- 模型替代：来源和目标定价完整、至少 7 个去重会话且金额达到阈值时生成 high。
- 缓存提升：只对目标缓存占比高于当前占比的已计价输入计算，始终为 medium。
- 异常回落：`actualCostUsd - baselineCostUsd` 按贡献当前费用比例分配；28 个基线样本为 high，否则为 medium。
- 每条建议携带 `contributionSavings`，金额等于其中值之和。
- 低于 `minimumSavingsUsd` 的建议不返回。
- 按节省金额降序、类型稳定顺序排序。
- conservative total 对每个贡献 ID 取所有建议中的最大节省，再求和。

建议 title/risk 仅保存 i18n key 和结构化 evidence，不在共享层生成最终语言文案。

- [ ] **Step 4: 运行建议测试和类型检查**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationSuggestions.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 5: 提交建议引擎**

```powershell
git add src/shared/costOptimizationSuggestions.ts tests/costOptimizationSuggestions.test.ts
git commit -m "feat: generate quantified savings recommendations"
```

### Task 8: 组合分析快照并持久化用户设置

**Files:**
- Create: `src/shared/costOptimizationEvaluation.ts`
- Create: `src/main/costOptimizationConfigStore.ts`
- Create: `src/main/costOptimizationRuntime.ts`
- Create: `tests/costOptimizationEvaluation.test.ts`
- Create: `tests/costOptimizationConfigStore.test.ts`
- Create: `tests/costOptimizationRuntime.test.ts`

**Interfaces:**
- Consumes: Tasks 1–7 的类型和纯函数。
- Produces: `evaluateCostOptimization(input): CostOptimizationSnapshot`。
- Produces: `CostOptimizationConfigStore` 和 `CostOptimizationRuntime`。
- Runtime methods: `initialize()`、`applyUsageCycle()`、`applyBudgetSnapshot()`、`markStale()`、`getSnapshot(query)`、`updateSettings()`、`subscribe()`。

```ts
export interface EvaluateCostOptimizationInput {
  index: CostOptimizationIndex;
  query: CostOptimizationQuery;
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
  budgets: BudgetPolicyStatus[];
  now: Date;
  dataState: CostOptimizationDataState;
  staleReason?: string;
  warnings: string[];
  cacheStats: CostOptimizationSnapshot['cacheStats'];
}
```

- [ ] **Step 1: 写快照组合与定价安全门测试**

```ts
it('combines comparison, anomalies, forecast and de-duplicated savings', () => {
  const snapshot = evaluateCostOptimization(makeEvaluationInput());

  expect(snapshot.modelRows).not.toHaveLength(0);
  expect(snapshot.anomalies).not.toHaveLength(0);
  expect(snapshot.forecast.kind).toBe('ready');
  expect(snapshot.recommendations).not.toHaveLength(0);
  expect(snapshot.conservativeSavingsUsd).toBeGreaterThan(0);
});

it('hides full forecast and recommendations below minimum pricing coverage', () => {
  const snapshot = evaluateCostOptimization(makeEvaluationInputWithUnpricedUsage());

  expect(snapshot.coverage.percentage).toBeLessThan(80);
  expect(snapshot.forecast.kind).toBe('pricing-incomplete');
  expect(snapshot.recommendations).toEqual([]);
  expect(snapshot.conservativeSavingsUsd).toBe(0);
});
```

- [ ] **Step 2: 写配置损坏备份和原子保存测试**

沿用 `budgetStore.test.ts` 模式，验证：

```ts
it('backs up malformed configuration before returning defaults', async () => {
  await writeFile(configPath, '{broken', 'utf8');
  const result = await createCostOptimizationConfigStore(configPath, fixedNow).load([]);

  expect(result.config.settings).toEqual(DEFAULT_COST_OPTIMIZATION_SETTINGS);
  expect(result.warning).toContain('Cost optimization settings were reset');
  expect(await readdir(testDirectory)).toContain(
    'cost-optimization-config.json.corrupt-2026-07-25T00-00-00-000Z'
  );
});
```

- [ ] **Step 3: 写运行时增量、价格失效和 stale 测试**

```ts
it('persists changed sources and revalues without rebuilding the token index', async () => {
  const evaluate = vi.fn(evaluateCostOptimization);
  const dependencies = makeRuntimeDependencies({ evaluate });
  const runtime = createCostOptimizationRuntime(dependencies);
  await runtime.initialize();
  await runtime.applyUsageCycle(makeCycleWithOneSource());
  const firstEvaluation = evaluate.mock.calls.at(-1)?.[0];
  if (!firstEvaluation) {
    throw new Error('Expected an evaluation after applying usage.');
  }
  const sourceReference = firstEvaluation.index.sources;

  await runtime.applyBudgetSnapshot(makeBudgetSnapshotWithUpdatedPricing());
  const repricedEvaluation = evaluate.mock.calls.at(-1)?.[0];
  if (!repricedEvaluation) {
    throw new Error('Expected an evaluation after repricing.');
  }

  expect(repricedEvaluation.index.sources).toBe(sourceReference);
  expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot({ period: 'total' }).currentCostUsd).toBe(UPDATED_COST_USD);
});

it('keeps the last snapshot when usage refresh becomes stale', async () => {
  const runtime = createCostOptimizationRuntime(makeRuntimeDependencies());
  await runtime.initialize();
  await runtime.applyUsageCycle(makeCycleWithOneSource());
  runtime.markStale(new Error('scan failed'));

  expect(runtime.getSnapshot({ period: 'total' })).toEqual(
    expect.objectContaining({ dataState: 'stale', staleReason: 'scan failed' })
  );
});
```

`CostOptimizationRuntimeDependencies` 提供默认值为 `evaluateCostOptimization` 的 `evaluate` 依赖；测试通过 spy 观察输入索引引用，不新增测试专用生产接口。

- [ ] **Step 4: 运行测试并确认模块缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationEvaluation.test.ts tests/costOptimizationConfigStore.test.ts tests/costOptimizationRuntime.test.ts
```

Expected: FAIL。

- [ ] **Step 5: 实现 evaluateCostOptimization**

组合顺序固定为：

1. 根据 query 选择 buckets 和 contributions。
2. 计算 coverage、当前费用、模型行和替代场景。
3. coverage 达标时以完整历史建立异常基线、再按 query 过滤当前异常，否则异常为空。
4. 以完整历史构建连续日序列并预测；query 只影响当前报告期累计和适用预算。
5. coverage 达标时生成建议并去重。
6. 复制 settings、query、pricing 和 budgets，禁止向调用方暴露可变内部引用。

当单个模块抛出可预期的数据错误时，返回该模块的空/不足状态并保留其他结果；编程错误不得吞掉，测试环境应直接失败。

- [ ] **Step 6: 实现配置 Store 和 CostOptimizationRuntime**

Config Store：

- schema version 1。
- 缺少文件时把当前已计价模型填入默认 candidate list。
- malformed/结构无效时备份为 `.corrupt-<ISO-safe-time>` 并恢复默认值。
- future schema 拒绝加载且不覆盖。
- 保存前再次调用设置校验，原子替换。

Runtime：

- initialize 同时加载 config 和 cache；无 cache 时建立空索引。
- config/cache Store 的恢复提示写入 snapshot `warnings`，同一启动周期不重复追加相同提示。
- `applyUsageCycle()` 在 `requiresFullRebuild` 或 sessionsDir 变化时重建，否则应用 delta。
- 每轮把 `cycle.result.summary.sessions` 的 sourceFile 集合与持久化 index sources 对比，撤销本轮完整结果中已不存在的缓存来源，覆盖应用重启后的删除或不可读文件。
- 只有 upsert/remove 时保存 cache。
- `applyBudgetSnapshot()` 分别计算 pricing signature 和 budget signature。
- pricing 变化只重算依赖费用的快照；budget 变化只影响预算线和 crossing。
- settings 变化按字段分组更新失效版本：anomaly、forecast、suggestion。
- `getSnapshot(query)` 先校验项目存在，再按 query memoize。
- stale 只改变 dataState 和 reason，不丢弃最后成功 index。
- 所有会改变 index、pricing、budget 或 settings 的异步方法通过 runtime 内部 promise queue 串行执行，避免刷新和设置保存交错覆盖。

- [ ] **Step 7: 运行运行时领域测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationEvaluation.test.ts tests/costOptimizationConfigStore.test.ts tests/costOptimizationRuntime.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交分析运行时**

```powershell
git add src/shared/costOptimizationEvaluation.ts src/main/costOptimizationConfigStore.ts src/main/costOptimizationRuntime.ts tests/costOptimizationEvaluation.test.ts tests/costOptimizationConfigStore.test.ts tests/costOptimizationRuntime.test.ts
git commit -m "feat: add cost optimization runtime"
```

### Task 9: 用 ApplicationRuntime 协调 Usage、Budget 和 Cost Optimization

**Files:**
- Create: `src/main/applicationRuntime.ts`
- Modify: `src/main/budgetRuntime.ts:25`
- Modify: `src/main/main.ts:25`
- Modify: `src/main/ipc.ts:18`
- Modify: `tests/budgetRuntime.test.ts:1`
- Create: `tests/applicationRuntime.test.ts`

**Interfaces:**
- Consumes: `UsageRuntime`、`BudgetRuntime`、`CostOptimizationRuntime`。
- Produces: `ApplicationRuntime.initialize()`、`start()`、`stop()`、`refresh()`、`refreshOnFocus()`。
- Changes: BudgetRuntime exposes `applyUsageResult(result)` and `markUsageStale(error)`; it no longer owns `UsageMonitor`。

- [ ] **Step 1: 写单扫描分发和错误降级测试**

```ts
it('distributes one usage cycle to both analysis runtimes', async () => {
  const dependencies = makeApplicationRuntimeDependencies();
  const runtime = createApplicationRuntime(dependencies);
  await runtime.initialize();
  await runtime.refresh();

  expect(dependencies.usageRuntime.refresh).toHaveBeenCalledTimes(1);
  expect(dependencies.budgetRuntime.applyUsageResult).toHaveBeenCalledTimes(1);
  expect(dependencies.costRuntime.applyUsageCycle).toHaveBeenCalledTimes(1);
});

it('marks both consumers stale after a scan error', async () => {
  const dependencies = makeApplicationRuntimeDependencies();
  const runtime = createApplicationRuntime(dependencies);
  await runtime.initialize();
  dependencies.emitUsageError(new Error('scan failed'));

  expect(dependencies.budgetRuntime.markUsageStale).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'scan failed' })
  );
  expect(dependencies.costRuntime.markStale).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'scan failed' })
  );
});
```

- [ ] **Step 2: 运行测试并确认协调器缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/applicationRuntime.test.ts tests/budgetRuntime.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 将 BudgetRuntime 改为用量消费者**

删除 BudgetRuntime 内的 scanner、monitor、`start()`、`stop()`、`refresh()`、`refreshOnFocus()` 和 usage listeners。新增：

```ts
export interface BudgetRuntime {
  initialize: () => Promise<void>;
  applyUsageResult: (result: UsageScanResult) => Promise<BudgetSnapshot>;
  markUsageStale: (error: unknown) => BudgetSnapshot;
  getSnapshot: () => BudgetSnapshot;
  savePolicy: (input: BudgetPolicyInput) => Promise<BudgetSnapshot>;
  deletePolicy: (id: string) => Promise<BudgetSnapshot>;
  updateThresholds: (input: BudgetThresholds) => Promise<BudgetSnapshot>;
  savePricingOverride: (input: ModelPricingOverrideInput) => Promise<BudgetSnapshot>;
  resetPricingOverride: (modelId: string) => Promise<BudgetSnapshot>;
  subscribe: (listener: RuntimeListener) => () => void;
  subscribeNavigation: (listener: RuntimeNavigationListener) => () => void;
  navigateToPolicy: (policyId: string) => void;
}
```

现有通知评估、价格覆盖、配置保存语义保持不变。

- [ ] **Step 4: 实现 ApplicationRuntime 和 main 生命周期**

协调器初始化顺序：

1. `budgetRuntime.initialize()`
2. `costRuntime.initialize()`
3. 将初始预算快照传给 cost runtime
4. 注册 usage cycle、usage error 和 budget snapshot 订阅
5. `start()` 只调用 usage runtime start

收到 cycle 后按以下顺序执行，确保成本分析使用与预算一致的最新价格：

```ts
const budgetSnapshot = await budgetRuntime.applyUsageResult(cycle.result);
await costRuntime.applyBudgetSnapshot(budgetSnapshot);
await costRuntime.applyUsageCycle(cycle);
```

预算快照订阅调用 `costRuntime.applyBudgetSnapshot(snapshot)`，CostOptimizationRuntime 的签名检查和串行队列保证重复快照无副作用。`stop()` 先取消所有订阅，再停止 usage runtime。

`main.ts` 创建三个 Store、scanner、UsageRuntime、BudgetRuntime、CostOptimizationRuntime 和 ApplicationRuntime；窗口 focus 改为调用 `applicationRuntime.refreshOnFocus()`。

同一任务同步把现有 IPC 的手动扫描改为 `applicationRuntime.refresh()`，用量更新订阅改为 `usageRuntime.subscribe()`；预算 CRUD 仍调用 BudgetRuntime。这样 BudgetRuntime 删除扫描方法后，仓库在本任务提交点仍可类型检查和运行。

- [ ] **Step 5: 运行主进程回归**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/applicationRuntime.test.ts tests/budgetRuntime.test.ts tests/usageRuntime.test.ts tests/usageMonitor.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交运行时协调**

```powershell
git add src/main/applicationRuntime.ts src/main/budgetRuntime.ts src/main/main.ts src/main/ipc.ts tests/applicationRuntime.test.ts tests/budgetRuntime.test.ts
git commit -m "refactor: coordinate shared usage runtime"
```

### Task 10: 接通成本优化 IPC、preload 和 Renderer hook

**Files:**
- Modify: `src/shared/ipcChannels.ts:1`
- Modify: `src/main/ipc.ts:1`
- Modify: `src/preload/preload.ts:1`
- Modify: `src/renderer/global.d.ts:1`
- Create: `src/renderer/hooks/useCostOptimizationSnapshot.ts`
- Create: `src/renderer/utils/costOptimizationSnapshotState.ts`
- Modify: `tests/externalUrlPolicy.test.ts:1`
- Create: `tests/costOptimizationIpc.test.ts`
- Create: `tests/costOptimizationSnapshotState.test.ts`

**Interfaces:**
- Produces IPC: get snapshot、update settings、updated push。
- Produces preload API: `window.codexUsage.costOptimization.getSnapshot(query)`、`updateSettings(settings)`、`onUpdated(listener)`。
- Produces hook result: `{ snapshot, loading, error, projectPath, setProjectPath, updateSettings }`。

- [ ] **Step 1: 写 IPC 通道注册、结构化错误和订阅测试**

```ts
it('registers cost optimization snapshot and settings handlers', async () => {
  const dependencies = makeIpcDependencies();
  const unregister = registerUsageIpc(dependencies);

  await invokeHandler(COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL, { period: 'month' });
  await invokeHandler(
    COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL,
    DEFAULT_COST_OPTIMIZATION_SETTINGS
  );

  expect(dependencies.costRuntime.getSnapshot).toHaveBeenCalledWith({ period: 'month' });
  expect(dependencies.costRuntime.updateSettings).toHaveBeenCalledWith(
    DEFAULT_COST_OPTIMIZATION_SETTINGS
  );
  unregister();
  expect(removeHandler).toHaveBeenCalledWith(COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL);
});
```

- [ ] **Step 2: 写 hook 请求竞态和推送匹配的纯状态测试**

```ts
const WEEK_SNAPSHOT: CostOptimizationSnapshot = {
  ...SNAPSHOT,
  query: { period: 'week' },
};
const MONTH_SNAPSHOT: CostOptimizationSnapshot = {
  ...SNAPSHOT,
  query: { period: 'month' },
};

it('ignores an older response after a newer query starts', () => {
  const initial = createCostOptimizationSnapshotState();
  const firstRequest = reduceCostOptimizationSnapshotState(initial, {
    type: 'request-started',
    requestId: 1,
  });
  const secondRequest = reduceCostOptimizationSnapshotState(firstRequest, {
    type: 'request-started',
    requestId: 2,
  });
  const staleResponse = reduceCostOptimizationSnapshotState(secondRequest, {
    type: 'request-succeeded',
    requestId: 1,
    snapshot: WEEK_SNAPSHOT,
  });
  const currentResponse = reduceCostOptimizationSnapshotState(staleResponse, {
    type: 'request-succeeded',
    requestId: 2,
    snapshot: MONTH_SNAPSHOT,
  });

  expect(staleResponse.snapshot).toBeNull();
  expect(currentResponse.snapshot).toBe(MONTH_SNAPSHOT);
  expect(currentResponse.loading).toBe(false);
});

it('applies pushed snapshots only to the active query', () => {
  expect(
    shouldApplyCostOptimizationPush(
      { period: 'month', projectPath: 'C:\\repo' },
      { period: 'month', projectPath: 'C:\\repo' }
    )
  ).toBe(true);
  expect(
    shouldApplyCostOptimizationPush(
      { period: 'month', projectPath: 'C:\\repo' },
      { period: 'month', projectPath: 'C:\\other' }
    )
  ).toBe(false);
});
```

- [ ] **Step 3: 运行测试并确认通道缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationIpc.test.ts tests/costOptimizationSnapshotState.test.ts
```

Expected: FAIL。

- [ ] **Step 4: 实现通道、桥接与 hook**

新增常量：

```ts
export const COST_OPTIMIZATION_GET_SNAPSHOT_CHANNEL = 'cost-optimization:get-snapshot';
export const COST_OPTIMIZATION_UPDATE_SETTINGS_CHANNEL = 'cost-optimization:update-settings';
export const COST_OPTIMIZATION_UPDATED_CHANNEL = 'cost-optimization:updated';
```

preload 必须用 `ipcRenderer.invoke` 和受控 `on()` 包装，退订时移除同一个 listener。`global.d.ts` 使用共享类型，不复制接口。

`costOptimizationSnapshotState.ts` 导出：

```ts
export interface CostOptimizationSnapshotState {
  snapshot: CostOptimizationSnapshot | null;
  loading: boolean;
  error: string | null;
  activeRequestId: number;
}

export type CostOptimizationSnapshotAction =
  | { type: 'request-started'; requestId: number }
  | { type: 'request-succeeded'; requestId: number; snapshot: CostOptimizationSnapshot }
  | { type: 'request-failed'; requestId: number; message: string }
  | { type: 'snapshot-pushed'; snapshot: CostOptimizationSnapshot };

export const createCostOptimizationSnapshotState = (): CostOptimizationSnapshotState => ({
  snapshot: null,
  loading: true,
  error: null,
  activeRequestId: 0,
});

export const shouldApplyCostOptimizationPush = (
  activeQuery: CostOptimizationQuery,
  pushedQuery: CostOptimizationQuery
): boolean =>
  activeQuery.period === pushedQuery.period &&
  activeQuery.projectPath === pushedQuery.projectPath;
```

Reducer 对 request ID 不匹配的 success/failure 原样返回 state；匹配时更新 snapshot/error/loading。`snapshot-pushed` 仅由 hook 在 query 匹配后派发。

Hook：

- period 变化时重新请求。
- projectPath 变化时请求 `{ period, projectPath }`。
- updated push 仅在 snapshot query 与当前 query 相同才替换。
- 设置更新成功后使用返回 snapshot。
- 组件卸载时取消 push listener。
- Promise 竞态通过递增 request ID 忽略旧响应。
- 上述竞态判断和 query 相等判断必须委托 `costOptimizationSnapshotState.ts` 的纯函数；hook 本身只负责 effect、IPC 和退订。

- [ ] **Step 5: 运行 IPC、preload 和安全回归**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationIpc.test.ts tests/costOptimizationSnapshotState.test.ts tests/externalUrlPolicy.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交跨进程桥接**

```powershell
git add src/shared/ipcChannels.ts src/main/ipc.ts src/preload/preload.ts src/renderer/global.d.ts src/renderer/hooks/useCostOptimizationSnapshot.ts src/renderer/utils/costOptimizationSnapshotState.ts tests/costOptimizationIpc.test.ts tests/costOptimizationSnapshotState.test.ts tests/externalUrlPolicy.test.ts
git commit -m "feat: expose cost optimization snapshots"
```

### Task 11: 接入导航、工作台外壳、总览和设置抽屉

**Files:**
- Modify: `src/renderer/components/Sidebar.tsx:8`
- Modify: `src/renderer/components/Toolbar.tsx:26`
- Modify: `src/renderer/components/AppContent.tsx:13`
- Modify: `src/renderer/App.tsx:1`
- Create: `src/renderer/components/CostOptimizationView.tsx`
- Create: `src/renderer/components/CostOptimizationOverview.tsx`
- Create: `src/renderer/components/CostOptimizationSettingsDrawer.tsx`
- Create: `src/renderer/utils/costOptimizationSettingsForm.ts`
- Modify: `src/shared/i18n/resources.ts:12`
- Modify: `src/shared/i18n/locales/en.ts:1`
- Modify: `src/shared/i18n/locales/zhCN.ts:1`
- Modify: `src/renderer/styles.css:1`
- Modify: `tests/sidebar.test.tsx:1`
- Modify: `tests/appNavigation.test.tsx:1`
- Create: `tests/costOptimizationView.test.tsx`
- Create: `tests/costOptimizationSettingsDrawer.test.tsx`
- Create: `tests/costOptimizationSettingsForm.test.ts`

**Interfaces:**
- Adds `ViewKey` value `costOptimization`。
- Consumes hook snapshot/actions and current global `UsagePeriod`。
- Produces independently usable overview route, project selector and settings drawer；Task 12 在该稳定入口上增加五标签详情。

- [ ] **Step 1: 写导航与工作台总览失败测试**

```tsx
it('renders cost optimization between budgets and sessions', () => {
  const markup = renderWithI18n(
    <Sidebar activeView="costOptimization" warningCount={0} onChange={vi.fn()} />
  );
  expect(markup.indexOf('Budgets')).toBeLessThan(markup.indexOf('Cost Optimization'));
  expect(markup.indexOf('Cost Optimization')).toBeLessThan(markup.indexOf('Sessions'));
});

it('renders overview metrics, coverage and settings entry', () => {
  const markup = renderWithI18n(
    <CostOptimizationView
      model={{ kind: 'ready', snapshot: SNAPSHOT }}
      projectOptions={['C:\\repo']}
      projectPath={null}
      onProjectPathChange={vi.fn()}
      onUpdateSettings={vi.fn()}
    />
  );

  expect(markup).toContain('Cost Optimization');
  expect(markup).toContain('Pricing coverage');
  expect(markup).toContain('$48.20');
  expect(markup).toContain('Analysis settings');
});
```

- [ ] **Step 2: 写设置表单纯转换和抽屉静态可访问性测试**

```tsx
it('maps invalid string fields to structured issues without mutating settings', () => {
  const initial = createCostOptimizationSettingsForm(DEFAULT_COST_OPTIMIZATION_SETTINGS);
  const changed = updateCostOptimizationSettingsForm(
    initial,
    'anomalyHistoryWindow',
    '6'
  );

  expect(getCostOptimizationSettingsFormIssues(changed, ['gpt-test'])).toContainEqual({
    field: 'anomalyHistoryWindow',
    code: 'history-window-range',
  });
  expect(initial.anomalyHistoryWindow).toBe('28');
});

it('renders an accessible settings dialog with every numeric rule', () => {
  const markup = renderWithI18n(
    <CostOptimizationSettingsDrawer
      settings={DEFAULT_COST_OPTIMIZATION_SETTINGS}
      pricedModelIds={['gpt-test']}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />
  );

  expect(markup).toContain('role="dialog"');
  expect(markup).toContain('Anomaly history window');
  expect(markup).toContain('Forecast horizon');
  expect(markup).toContain('Minimum pricing coverage');
});
```

- [ ] **Step 3: 运行测试并确认页面缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sidebar.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/costOptimizationSettingsForm.test.ts
```

Expected: FAIL。

- [ ] **Step 4: 接入 ViewKey、App 状态和明确渲染模型**

`ViewKey`：

```ts
export type ViewKey =
  | 'overview'
  | 'budgets'
  | 'costOptimization'
  | 'sessions'
  | 'tools'
  | 'performance'
  | 'wrapped';
```

新增 `CostOptimizationContentModel`：

```ts
export type CostOptimizationContentModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: CostOptimizationSnapshot };
```

App：

- 调用 `useCostOptimizationSnapshot(period)`。
- 项目筛选仅属于 cost view，不复用 sessions 的 `selectedProjectPath`。
- 将完整扫描结果中的项目路径作为项目选项。
- AppContent 仅在 activeView 为 costOptimization 时渲染新 view。
- Toolbar 保留全局周期选择，新增成本优化标题翻译。

- [ ] **Step 5: 实现总览、五标签和设置抽屉**

`CostOptimizationView` 使用局部 `settingsOpen`；总览展示：

- 当前费用和定价覆盖
- 预测期末费用或样本不足状态
- 当前报告期异常数
- conservative savings，coverage 不足时显示修复价格提示
- 预测 method、projectedCostUsd、经验区间和最早预算 crossing 的文字摘要
- 前三条建议和最新两条异常
- snapshot warnings 以可关闭 banner 展示；已关闭 warning ID 属于用户事件直接改变的局部 state，同一消息在本次挂载期间不重复出现

Settings Drawer：

- 所有数值输入使用字符串 form state。
- candidate model 使用原生多选 checkbox。
- form 创建、字段更新、数值转换和结构化错误映射委托 `costOptimizationSettingsForm.ts` 纯函数。
- submit 前运行共享校验；IPC 结构化错误映射到字段。
- 保存中禁用提交，失败保留输入和抽屉。
- 关闭不保存。

- [ ] **Step 6: 添加 costOptimization i18n namespace 和基础样式**

在 `I18N_NAMESPACES` 添加 `costOptimization`，两种 locale 提供相同 key 结构。样式复用现有 `.panel`、`.metric-grid`、`.budget-drawer` 等基类，新增：

- `.cost-optimization-tabs`
- `.cost-optimization-toolbar`
- `.cost-optimization-overview`
- `.cost-optimization-metric-grid`
- `.cost-optimization-pricing-gate`

窄宽度使用现有媒体查询断点堆叠，禁止固定 viewport 高度和内部页面滚动。

- [ ] **Step 7: 运行导航、i18n 和页面测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/sidebar.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/costOptimizationSettingsForm.test.ts tests/i18n.test.ts tests/rendererI18n.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交工作台外壳**

```powershell
git add src/renderer/components/Sidebar.tsx src/renderer/components/Toolbar.tsx src/renderer/components/AppContent.tsx src/renderer/App.tsx src/renderer/components/CostOptimizationView.tsx src/renderer/components/CostOptimizationOverview.tsx src/renderer/components/CostOptimizationSettingsDrawer.tsx src/renderer/utils/costOptimizationSettingsForm.ts src/shared/i18n/resources.ts src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles.css tests/sidebar.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/costOptimizationSettingsForm.test.ts
git commit -m "feat: add cost optimization workspace"
```

### Task 12: 实现模型对比、异常、预测和建议详情标签

**Files:**
- Create: `src/renderer/components/ModelCostComparison.tsx`
- Create: `src/renderer/components/CostAnomalies.tsx`
- Create: `src/renderer/components/CostForecast.tsx`
- Create: `src/renderer/components/SavingsRecommendations.tsx`
- Modify: `src/renderer/components/CostOptimizationView.tsx:1`
- Modify: `src/renderer/components/CostOptimizationOverview.tsx:1`
- Modify: `src/renderer/styles.css:1`
- Create: `tests/modelCostComparison.test.tsx`
- Create: `tests/costAnomalies.test.tsx`
- Create: `tests/costForecast.test.tsx`
- Create: `tests/savingsRecommendations.test.tsx`

**Interfaces:**
- Consumes: `CostOptimizationSnapshot` 中的四类详情结果。
- Produces: 可访问的五标签、表格、筛选、SVG 预测图、异常贡献链和建议证据。
- Produces pure selectors: `filterCostAnomalies()`、`filterSavingsRecommendations()`。

- [ ] **Step 1: 写四个详情视图的关键行为测试**

```tsx
it('shows actual and scenario costs with the equivalence disclaimer', () => {
  const markup = renderWithI18n(
    <ModelCostComparison
      rows={SNAPSHOT.modelRows}
      scenarios={SNAPSHOT.substitutionScenarios}
    />
  );
  expect(markup).toContain('Actual cost');
  expect(markup).toContain('Scenario cost');
  expect(markup).toContain('does not imply equivalent quality, speed, or capability');
});

it('filters anomalies by level and exposes the contribution chain', () => {
  const filtered = filterCostAnomalies(SNAPSHOT.anomalies, 'session', 'all');
  const markup = renderWithI18n(<CostAnomalies anomalies={filtered} />);

  expect(filtered.every(({ level }) => level === 'session')).toBe(true);
  expect(markup).toContain('Session');
  expect(markup).not.toContain('Day total');
});

it('renders a labelled forecast band and budget crossing', () => {
  const markup = renderWithI18n(<CostForecast forecast={READY_FORECAST} budgets={SNAPSHOT.budgets} />);
  expect(markup).toContain('80% empirical interval');
  expect(markup).toContain('Expected to exceed budget');
  expect(markup).toContain('role="img"');
});

it('shows confidence, evidence, risk, and overlap notice for savings', () => {
  const markup = renderWithI18n(
    <SavingsRecommendations
      recommendations={SNAPSHOT.recommendations}
      conservativeSavingsUsd={SNAPSHOT.conservativeSavingsUsd}
    />
  );
  expect(markup).toContain('High confidence');
  expect(markup).toContain('Calculation basis');
  expect(markup).toContain('Risk');
  expect(markup).toContain('Overlapping savings are not added twice');
});

it('renders all five cost optimization tabs with accessible selection state', () => {
  const markup = renderWithI18n(
    <CostOptimizationView
      model={{ kind: 'ready', snapshot: SNAPSHOT }}
      projectOptions={['C:\\repo']}
      projectPath={null}
      onProjectPathChange={vi.fn()}
      onUpdateSettings={vi.fn()}
    />
  );

  expect(markup).toContain('Overview');
  expect(markup).toContain('Model comparison');
  expect(markup).toContain('Anomalies');
  expect(markup).toContain('Forecast');
  expect(markup).toContain('Savings');
  expect(markup).toContain('aria-selected="true"');
});
```

- [ ] **Step 2: 运行测试并确认组件缺失**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/modelCostComparison.test.tsx tests/costAnomalies.test.tsx tests/costForecast.test.tsx tests/savingsRecommendations.test.tsx
```

Expected: FAIL。

- [ ] **Step 3: 实现模型对比与异常详情**

Model comparison：

- 语义 table 显示模型、Token 构成、费用、占比、会话均值和 coverage。
- 未计价模型显示 `Pricing incomplete`，不显示虚构的 $0。
- scenario table 显示来源、目标、实际、情景、节省和会话数。
- 固定可见免责声明，不放在 tooltip 中。

Anomalies：

- level 和 severity 原生 select。
- 过滤结果委托 `filterCostAnomalies()` 纯函数并由当前筛选 state 派生，不保存结果副本。
- 每条展示 actual、baseline、ratio、score、sample count、baseline scope 和 coverage。
- 展开项按 day → project → model → session 展示 contribution chain。
- severity 同时使用文字、图标和颜色。

- [ ] **Step 4: 实现预测 SVG 与建议详情**

Forecast：

- insufficient/pricing-incomplete 使用明确状态面板。
- ready 绘制历史费用、点预测、上下区间填充和选中预算线。
- SVG 包含 `<title>`、`<desc>`、日期/美元单位和文本摘要。
- 多个预算使用原生 select；选中项为局部展示 state。
- tooltip 同时支持鼠标和 focus，不依赖颜色。

Savings：

- type、confidence 原生筛选。
- 过滤结果委托 `filterSavingsRecommendations()` 纯函数。
- 每条建议显示金额、适用范围、evidence 列表、confidence 文字和 risk。
- 顶部 conservative savings 旁固定显示重叠去重说明。
- recommendation 的 i18n key 只从受控映射解析，不把运行时字符串直接当翻译 key。

- [ ] **Step 5: 完成响应式样式并运行详情测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/modelCostComparison.test.tsx tests/costAnomalies.test.tsx tests/costForecast.test.tsx tests/savingsRecommendations.test.tsx tests/costOptimizationView.test.tsx
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
```

Expected: PASS。

- [ ] **Step 6: 提交详情标签**

```powershell
git add src/renderer/components/ModelCostComparison.tsx src/renderer/components/CostAnomalies.tsx src/renderer/components/CostForecast.tsx src/renderer/components/SavingsRecommendations.tsx src/renderer/components/CostOptimizationView.tsx src/renderer/components/CostOptimizationOverview.tsx src/renderer/styles.css tests/modelCostComparison.test.tsx tests/costAnomalies.test.tsx tests/costForecast.test.tsx tests/savingsRecommendations.test.tsx
git commit -m "feat: add cost optimization detail views"
```

### Task 13: 更新说明并执行完整质量门禁

**Files:**
- Modify: `README.md:1`
- Modify: `tests/fileHeaderPolicy.test.ts:1`

**Interfaces:**
- Documents: 页面入口、算法样本门槛、配置/缓存文件、定价覆盖和只读边界。
- Verifies: full Vitest、typecheck、lint、build。

- [ ] **Step 1: 更新 README 的功能和隐私说明**

新增中文段落必须覆盖：

- “成本优化”五个标签及项目/周期筛选。
- 模型替代只比较价格，不代表质量、速度或能力等价。
- 异常默认 28 个观测、最低 7 个样本。
- 预测最低 7 天，28 天后加入星期周期。
- coverage 低于 80% 时隐藏完整预测和节省金额。
- `<Electron userData>/cost-optimization-config.json`。
- `<Electron userData>/cost-optimization-cache.json`。
- 两个文件都不修改 Codex 会话数据，缓存可安全重建。

- [ ] **Step 2: 将新增核心文件纳入文件头策略**

向 `REQUIRED_FILE_HEADER_PATHS` 添加：

```ts
'src/main/applicationRuntime.ts',
'src/main/usageRuntime.ts',
'src/main/costOptimizationConfigStore.ts',
'src/main/costOptimizationCacheStore.ts',
'src/main/costOptimizationRuntime.ts',
'src/shared/costOptimizationIndex.ts',
'src/shared/costOptimizationCost.ts',
'src/shared/costOptimizationAnomalies.ts',
'src/shared/costOptimizationForecast.ts',
'src/shared/costOptimizationSuggestions.ts',
'src/shared/costOptimizationEvaluation.ts',
'src/renderer/components/CostOptimizationView.tsx',
'src/renderer/components/CostOptimizationSettingsDrawer.tsx',
'src/renderer/hooks/useCostOptimizationSnapshot.ts',
```

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/fileHeaderPolicy.test.ts
```

Expected: PASS。

- [ ] **Step 3: 运行成本优化专项测试**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test -- tests/costOptimizationValidation.test.ts tests/usageRuntime.test.ts tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts tests/costOptimizationCost.test.ts tests/costOptimizationAnomalies.test.ts tests/costOptimizationForecast.test.ts tests/costOptimizationSuggestions.test.ts tests/costOptimizationEvaluation.test.ts tests/costOptimizationConfigStore.test.ts tests/costOptimizationRuntime.test.ts tests/applicationRuntime.test.ts tests/costOptimizationIpc.test.ts tests/costOptimizationSnapshotState.test.ts tests/costOptimizationView.test.tsx tests/costOptimizationSettingsDrawer.test.tsx tests/costOptimizationSettingsForm.test.ts tests/modelCostComparison.test.tsx tests/costAnomalies.test.tsx tests/costForecast.test.tsx tests/savingsRecommendations.test.tsx --maxWorkers=1 --no-file-parallelism
```

Expected: PASS，零失败。

- [ ] **Step 4: 运行完整测试套件**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' test
```

Expected: PASS，零失败。

- [ ] **Step 5: 运行类型、风格和构建门禁**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run typecheck
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
```

Expected: 三条命令全部以 exit code 0 完成；lint 无 warning，Electron/Vite 构建成功。

- [ ] **Step 6: 检查增量路径的可观察工作量**

运行 `tests/usageScanner.test.ts`、`tests/costOptimizationIndex.test.ts` 和 `tests/costOptimizationRuntime.test.ts` 中的计数断言，确认：

- 未变化 JSONL 不重新读取。
- 单来源变化只撤销和加入该来源贡献。
- 价格变化不替换 sources/index 引用。
- 设置变化不调用 scanner。
- Renderer 测试不导入或调用全量领域评估函数。

Expected: 所有计数和引用身份断言 PASS。

- [ ] **Step 7: 提交文档与最终修整**

```powershell
git add README.md tests/fileHeaderPolicy.test.ts
git commit -m "docs: document cost optimization workflow"
```
