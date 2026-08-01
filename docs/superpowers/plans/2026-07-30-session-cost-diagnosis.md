# 会话高消耗诊断实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有成本优化工作台中增加可解释的会话高消耗诊断，自动排列高影响会话，并通过元数据证据说明输入增长、缓存下降、生成占比、模型成本和交互累积原因。

**Architecture:** 扩展现有可重建成本索引以保存最小会话元数据，在 `shared` 层用无副作用纯函数完成候选排名、历史基线和五类检测。成本优化快照只携带轻量摘要，完整时间线通过主进程运行时和类型化 IPC 按需获取；Renderer 只负责导航、筛选、本地化和展示。

**Tech Stack:** Electron 31、React 18、TypeScript 5.5、Vitest 2、i18next、lucide-react、现有 SVG/CSS 图表体系。

## Global Constraints

- Codex 会话目录始终只读；不得修改、删除或上传其中的数据。
- 首版只使用 Token、模型、缓存、时间、项目和会话标识元数据，不读取提示词或回复正文。
- Renderer 不直接访问文件系统；所有详情读取必须通过 Electron 主进程、类型化 IPC 和 preload API。
- 未知模型价格不得猜测；保留 Token，并将费用明确标为未计价或部分计价。
- 费用始终描述为本地估算，不得描述为 OpenAI 实际账单。
- 核心诊断函数不得修改输入对象。
- 禁止使用 `any` 和 `var`；内部阈值使用靠近检测器的具名常量。
- 新增用户可见文案同时维护英文和简体中文，不在 React 组件中硬编码。
- 金额、百分比、数字和日期使用现有 locale formatter。
- 交互控件支持键盘操作，颜色不是严重程度、原因或置信度的唯一表达方式。
- 不增加新的运行时依赖、图表依赖、分页或虚拟列表。
- 每个任务按红—绿—重构执行；任务提交遵循 Conventional Commits，且只包含本任务文件。
- 最终必须通过 `npm test`、`npm run typecheck`、`npm run lint` 和 `npm run build`。

---

## 文件结构

### 共享领域与计算

- Modify: `src/shared/costOptimizationTypes.ts`
  - 增加索引会话元数据、诊断摘要、详情、证据、检测器状态和 IPC 请求类型。
- Modify: `src/shared/costOptimizationIndex.ts`
  - 把最小会话元数据写入增量索引，并将 schema 升级为 2。
- Create: `src/shared/robustStatistics.ts`
  - 提供中位数、MAD 和可配置零 MAD 尺度的稳健分数。
- Create: `src/shared/sessionDiagnosisTypes.ts`
  - 保存计算内部使用的会话观测、检测器上下文和数值指标类型。
- Create: `src/shared/sessionDiagnosisCandidates.ts`
  - 构建会话观测、计算中秩百分位、候选状态和稳定诊断 ID。
- Create: `src/shared/sessionDiagnosisBaselines.ts`
  - 只从当前会话之前选择检测器专用历史基线。
- Create: `src/shared/sessionDiagnosisInput.ts`
  - 输入 Token 足迹增长检测。
- Create: `src/shared/sessionDiagnosisCache.ts`
  - 缓存复用信号检测。
- Create: `src/shared/sessionDiagnosisGeneration.ts`
  - 输出与推理 Token 占比检测。
- Create: `src/shared/sessionDiagnosisModelCost.ts`
  - 模型成本主导和模型切换成本检测。
- Create: `src/shared/sessionDiagnosisAccumulation.ts`
  - 用量事件与持续时间累积检测。
- Create: `src/shared/sessionDiagnosisEvaluation.ts`
  - 组合五个检测器，选择主原因，生成摘要和按需详情。
- Modify: `src/shared/costOptimizationAnomalies.ts`
  - 改用共享稳健统计函数，保持现有异常行为不变。
- Modify: `src/shared/pricing.ts`
  - 导出现有模型 ID 规范化函数，供诊断排序与价格匹配复用。
- Modify: `src/shared/costOptimizationEvaluation.ts`
  - 将轻量诊断摘要加入成本优化快照。

### 主进程、IPC 与 preload

- Modify: `src/main/costOptimizationCacheStore.ts`
  - 校验 schema 2 会话元数据，并让 schema 1 缓存安全失效。
- Modify: `src/main/costOptimizationRuntime.ts`
  - 增加按查询和诊断 ID 获取最新详情的只读方法。
- Modify: `src/shared/ipcChannels.ts`
  - 增加会话诊断详情 channel。
- Modify: `src/main/ipc.ts`
  - 注册、验证并卸载详情 handler。
- Modify: `src/preload/preload.ts`
  - 暴露类型化 `getSessionDiagnosis`。
- Modify: `src/renderer/global.d.ts`
  - 声明 Renderer 可用的详情 API。

### Renderer

- Create: `src/renderer/utils/sessionDiagnosisFilters.ts`
  - 纯函数实现关注范围、原因、严重程度和置信度筛选。
- Create: `src/renderer/utils/sessionDiagnosisDetailState.ts`
  - 防止异步详情响应覆盖较新的会话选择。
- Create: `src/renderer/hooks/useSessionDiagnosisDetail.ts`
  - 按当前查询和诊断 ID 加载详情。
- Create: `src/renderer/components/SessionDiagnosisList.tsx`
  - 诊断摘要列表和成功型空状态。
- Create: `src/renderer/components/SessionDiagnosisTimeline.tsx`
  - 共享时间轴上的 Token 与缓存率分轨图。
- Create: `src/renderer/components/SessionDiagnosisDetail.tsx`
  - 原因优先详情、证据和五个检测器状态。
- Create: `src/renderer/components/SessionDiagnosticsView.tsx`
  - 保留列表筛选/滚动状态并协调列表与详情。
- Modify: `src/renderer/hooks/useCostOptimizationSnapshot.ts`
  - 同时维护当前项目快照和无项目筛选的全局诊断摘要。
- Modify: `src/renderer/utils/costOptimizationSnapshotState.ts`
  - 增加全局查询复用辅助函数。
- Modify: `src/renderer/App.tsx`
  - 控制成本优化标签和当前诊断会话，协调跨页面导航。
- Modify: `src/renderer/components/AppContent.tsx`
  - 传递诊断摘要、详情模型和导航回调。
- Modify: `src/renderer/components/CostOptimizationView.tsx`
  - 增加受控“会话诊断”标签。
- Modify: `src/renderer/components/SessionsView.tsx`
  - 为已诊断会话增加可访问的原因徽标。
- Modify: `src/renderer/styles.css`
  - 增加列表、原因优先详情、分轨图和响应式样式。

### 国际化、测试与文档

- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `tests/helpers/costOptimizationFixtures.ts`
- Create: `tests/helpers/sessionDiagnosisFixtures.ts`
- Create: `tests/robustStatistics.test.ts`
- Create: `tests/sessionDiagnosisCandidates.test.ts`
- Create: `tests/sessionDiagnosisBaselines.test.ts`
- Create: `tests/sessionDiagnosisInput.test.ts`
- Create: `tests/sessionDiagnosisCache.test.ts`
- Create: `tests/sessionDiagnosisGeneration.test.ts`
- Create: `tests/sessionDiagnosisModelCost.test.ts`
- Create: `tests/sessionDiagnosisAccumulation.test.ts`
- Create: `tests/sessionDiagnosisEvaluation.test.ts`
- Create: `tests/sessionDiagnosisFilters.test.tsx`
- Create: `tests/sessionDiagnosisDetailState.test.tsx`
- Create: `tests/sessionDiagnosticsView.test.tsx`
- Create: `tests/sessionDiagnosisList.test.tsx`
- Create: `tests/sessionDiagnosisTimeline.test.tsx`
- Create: `tests/sessionDiagnosisDetail.test.tsx`
- Modify: `tests/costOptimizationIndex.test.ts`
- Modify: `tests/costOptimizationCacheStore.test.ts`
- Modify: `tests/costOptimizationAnomalies.test.ts`
- Modify: `tests/pricing.test.ts`
- Modify: `tests/costOptimizationEvaluation.test.ts`
- Modify: `tests/costOptimizationRuntime.test.ts`
- Modify: `tests/costOptimizationIpc.test.ts`
- Modify: `tests/costOptimizationSnapshotState.test.tsx`
- Modify: `tests/costOptimizationView.test.tsx`
- Modify: `tests/appNavigation.test.tsx`
- Modify: `tests/appContent.test.tsx`
- Modify: `tests/i18n.test.ts`
- Modify: `README.md`

---

### Task 1: 将最小会话元数据写入 schema 2 增量索引

**Files:**

- Modify: `src/shared/costOptimizationTypes.ts`
- Modify: `src/shared/costOptimizationIndex.ts`
- Modify: `src/main/costOptimizationCacheStore.ts`
- Modify: `tests/helpers/costOptimizationFixtures.ts`
- Modify: `tests/costOptimizationIndex.test.ts`
- Modify: `tests/costOptimizationCacheStore.test.ts`

**Interfaces:**

- Produces: `IndexedUsageSessionMetadata`
- Produces: `IndexedUsageSource.metadata`
- Produces: `CostOptimizationIndex.schemaVersion === 2`
- Produces: `COST_OPTIMIZATION_INDEX_SCHEMA_VERSION === 2`
- Preserves: `applyUsageChangeSet(index, changes, now): CostOptimizationIndex`

- [ ] **Step 1: 写入索引元数据的失败测试**

在 `tests/costOptimizationIndex.test.ts` 增加：

```ts
it('stores immutable diagnosis metadata with each indexed source', () => {
  const source = makeSourceChange('usage.jsonl', '1', 100);
  source.session.threadName = 'Investigate budget spike';
  source.session.startedAt = '2026-07-24T10:00:00.000Z';
  source.session.endedAt = '2026-07-24T10:45:00.000Z';
  source.session.eventCount = 3;

  const indexed = applyUsageChangeSet(
    createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
    {
      upserted: [source],
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
    FIXED_NOW
  );

  expect(indexed.schemaVersion).toBe(2);
  expect(indexed.sources['usage.jsonl'].metadata).toEqual({
    sessionId: 'usage.jsonl',
    threadName: 'Investigate budget spike',
    startedAt: '2026-07-24T10:00:00.000Z',
    endedAt: '2026-07-24T10:45:00.000Z',
    projectPath: 'C:\\repo',
    projectName: 'repo',
    eventCount: 3,
    sourceFile: 'usage.jsonl',
  });
  expect(indexed.sources['usage.jsonl'].metadata).not.toBe(source.session);
});

it('replaces and removes diagnosis metadata with the source lifecycle', () => {
  const firstSource = makeSourceChange('usage.jsonl', '1', 100);
  firstSource.session.threadName = 'Before';
  const first = applyUsageChangeSet(
    createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
    {
      upserted: [firstSource],
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
    FIXED_NOW
  );
  const nextSource = makeSourceChange('usage.jsonl', '2', 250);
  nextSource.session.threadName = 'After';
  const changed = applyUsageChangeSet(
    first,
    {
      upserted: [nextSource],
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
    FIXED_NOW
  );
  const removed = applyUsageChangeSet(
    changed,
    {
      upserted: [],
      removedSourceFiles: ['usage.jsonl'],
      requiresFullRebuild: false,
    },
    FIXED_NOW
  );

  expect(changed.sources['usage.jsonl'].metadata.threadName).toBe('After');
  expect(removed.sources['usage.jsonl']).toBeUndefined();
});
```

在 `tests/costOptimizationCacheStore.test.ts` 把“不支持 schema”用例改为写入 `schemaVersion: 1`，并增加 schema 2 元数据损坏用例：

```ts
it('rejects schema 1 and malformed schema 2 metadata', async () => {
  const index = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);
  await writeFile(cachePath, JSON.stringify({ ...index, schemaVersion: 1 }), 'utf8');
  await expect(createCostOptimizationCacheStore(cachePath).load()).resolves.toEqual({
    index: undefined,
    warning: REBUILD_WARNING,
  });

  const sourceIndex = applyUsageChangeSet(
    index,
    {
      upserted: [makeSourceChange('usage.jsonl', '1', 100)],
      removedSourceFiles: [],
      requiresFullRebuild: false,
    },
    FIXED_NOW
  );
  const broken = structuredClone(sourceIndex) as unknown as {
    sources: Record<string, { metadata: { eventCount: unknown } }>;
  };
  broken.sources['usage.jsonl'].metadata.eventCount = -1;
  await writeFile(cachePath, JSON.stringify(broken), 'utf8');

  await expect(createCostOptimizationCacheStore(cachePath).load()).resolves.toEqual({
    index: undefined,
    warning: REBUILD_WARNING,
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
npm test -- tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts
```

Expected: FAIL，分别指出 `schemaVersion` 仍为 1、`metadata` 不存在或 schema 2 被拒绝。

- [ ] **Step 3: 增加类型和索引写入**

在 `src/shared/costOptimizationTypes.ts` 定义：

```ts
export interface IndexedUsageSessionMetadata {
  sessionId: string;
  threadName?: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  eventCount: number;
  sourceFile: string;
}

export interface IndexedUsageSource {
  fingerprint: string;
  metadata: IndexedUsageSessionMetadata;
  contributions: IndexedUsageContribution[];
}
```

在 `src/shared/costOptimizationIndex.ts` 使用具名版本和复制函数：

```ts
export const COST_OPTIMIZATION_INDEX_SCHEMA_VERSION = 2;

const getSessionMetadata = (
  sourceChange: UsageSourceChange
): IndexedUsageSessionMetadata => ({
  sessionId: sourceChange.session.sessionId,
  ...(sourceChange.session.threadName
    ? { threadName: sourceChange.session.threadName }
    : {}),
  startedAt: sourceChange.session.startedAt,
  endedAt: sourceChange.session.endedAt,
  projectPath: sourceChange.session.projectPath,
  projectName: sourceChange.session.projectName,
  eventCount: sourceChange.session.eventCount,
  sourceFile: sourceChange.sourceFile,
});
```

写入来源时保存 `{ fingerprint, metadata, contributions }`，不要保存原 `UsageSession` 引用。

- [ ] **Step 4: 升级缓存校验和一致性重建**

在 `src/main/costOptimizationCacheStore.ts`：

```ts
const isSessionMetadata = (
  value: unknown,
  sourceFile: string
): value is IndexedUsageSessionMetadata =>
  isRecord(value) &&
  typeof value.sessionId === 'string' &&
  hasOptionalString(value, 'threadName') &&
  typeof value.startedAt === 'string' &&
  typeof value.endedAt === 'string' &&
  typeof value.projectPath === 'string' &&
  typeof value.projectName === 'string' &&
  Number.isInteger(value.eventCount) &&
  Number(value.eventCount) >= 0 &&
  value.sourceFile === sourceFile;
```

`costOptimizationCacheStore.ts` 从 `costOptimizationIndex.ts` 导入 `COST_OPTIMIZATION_INDEX_SCHEMA_VERSION`，不维护第二份版本值。`isSourcesRecord` 同时校验 `source.metadata`。`toSourceChange` 直接从 metadata 恢复会话身份和时间，不再从第一个贡献推测这些字段。

- [ ] **Step 5: 运行聚焦测试和类型检查**

Run:

```powershell
npm test -- tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts
npm run typecheck
```

Expected: PASS；旧 schema 返回重建 warning，schema 2 能完整 round-trip。

- [ ] **Step 6: 提交任务**

```powershell
git add src/shared/costOptimizationTypes.ts src/shared/costOptimizationIndex.ts src/main/costOptimizationCacheStore.ts tests/helpers/costOptimizationFixtures.ts tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts
git commit -m "feat: index session diagnosis metadata"
```

---

### Task 2: 建立诊断类型、稳健统计、候选排名和历史基线

**Files:**

- Create: `src/shared/robustStatistics.ts`
- Create: `src/shared/sessionDiagnosisTypes.ts`
- Create: `src/shared/sessionDiagnosisCandidates.ts`
- Create: `src/shared/sessionDiagnosisBaselines.ts`
- Modify: `src/shared/costOptimizationTypes.ts`
- Modify: `src/shared/costOptimizationAnomalies.ts`
- Modify: `src/shared/pricing.ts`
- Create: `tests/helpers/sessionDiagnosisFixtures.ts`
- Create: `tests/robustStatistics.test.ts`
- Create: `tests/sessionDiagnosisCandidates.test.ts`
- Create: `tests/sessionDiagnosisBaselines.test.ts`
- Modify: `tests/costOptimizationAnomalies.test.ts`
- Modify: `tests/pricing.test.ts`
- Modify: `tests/helpers/costOptimizationFixtures.ts`

**Interfaces:**

- Produces: `getRobustScore(actual, samples, options): RobustScore`
- Produces: `getMidrankPercentiles(values): number[]`
- Produces: `buildSessionDiagnosisObservations(input): SessionDiagnosisObservation[]`
- Produces: `selectDiagnosisCandidates(input): SessionDiagnosisCandidate[]`
- Produces: `resolveDiagnosisBaseline(input): SessionDiagnosisBaseline | undefined`
- Produces: public `SessionDiagnosisSummary`, `SessionDiagnosisDetail`, `SessionDetectorResult`
- Preserves and exports: `normalizeModelId(modelId): string`

- [ ] **Step 1: 写入稳健统计和中秩百分位失败测试**

`tests/robustStatistics.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { getRobustScore, median, medianAbsoluteDeviation } from '../src/shared/robustStatistics';

describe('robust statistics', () => {
  it('calculates median and MAD without mutating input', () => {
    const values = [9, 1, 5, 3];
    expect(median(values)).toBe(4);
    expect(medianAbsoluteDeviation(values, 4)).toBe(2);
    expect(values).toEqual([9, 1, 5, 3]);
  });

  it('uses the configured zero-MAD scale', () => {
    expect(
      getRobustScore(20, [10, 10, 10], {
        zeroMadRelativeScale: 0.25,
        zeroMadAbsoluteScale: 1,
      })
    ).toEqual({
      median: 10,
      mad: 0,
      scale: 2.5,
      score: 4,
      ratio: 2,
    });
  });
});
```

`tests/sessionDiagnosisCandidates.test.ts`：

```ts
it('assigns stable midrank percentiles including ties', () => {
  expect(getMidrankPercentiles([])).toEqual([]);
  expect(getMidrankPercentiles([10, 20, 20, 40])).toEqual([0, 0.5, 0.5, 1]);
  expect(getMidrankPercentiles([7])).toEqual([1]);
});

it('marks the top impact quintile and session anomalies for attention', () => {
  const observations = [10, 20, 30, 40, 50].map((totalTokens, index) =>
    makeDiagnosisObservation({
      diagnosisId: `source-${index}\u001fsession-${index}`,
      totalTokens,
      pricedCostUsd: totalTokens,
    })
  );
  const candidates = selectDiagnosisCandidates({
    observations,
    anomalies: [makeSessionAnomaly('session-1')],
    minimumPricingCoveragePercentage:
      SETTINGS.minimumPricingCoveragePercentage,
  });

  expect(candidates.filter(({ requiresAttention }) => requiresAttention).map(({ sessionId }) => sessionId))
    .toEqual(['session-4', 'session-1']);
});

it('uses cost percentile only for sessions meeting the safe pricing threshold', () => {
  const observations = [
    makeDiagnosisObservation({
      diagnosisId: 'low-token-high-cost\u001flow-token-high-cost',
      sessionId: 'low-token-high-cost',
      totalTokens: 10,
      pricedCostUsd: 100,
    }),
    makeDiagnosisObservation({
      diagnosisId: 'partial\u001fpartial',
      sessionId: 'partial',
      totalTokens: 50,
      pricedCostUsd: 1_000,
      coverage: {
        pricedTokens: 25,
        unpricedTokens: 25,
        totalTokens: 50,
        percentage: 50,
        unpricedModelIds: ['unknown-model'],
      },
    }),
    makeDiagnosisObservation({
      diagnosisId: 'high-token-low-cost\u001fhigh-token-low-cost',
      sessionId: 'high-token-low-cost',
      totalTokens: 100,
      pricedCostUsd: 1,
    }),
  ];

  const candidates = selectDiagnosisCandidates({
    observations,
    anomalies: [],
    minimumPricingCoveragePercentage: 90,
  });

  expect(
    candidates.find(({ sessionId }) => sessionId === 'low-token-high-cost')
  ).toMatchObject({
    tokenPercentile: 0,
    pricedCostPercentile: 1,
    impactPercentile: 1,
  });
  expect(
    candidates.find(({ sessionId }) => sessionId === 'partial')
  ).toMatchObject({
    tokenPercentile: 0.5,
    impactPercentile: 0.5,
  });
  expect(
    candidates.find(({ sessionId }) => sessionId === 'partial')
  ).not.toHaveProperty('pricedCostPercentile');
});

it('builds a stable source-session id and breaks dominant-model ties lexically', () => {
  const source = makeDiagnosisSourceChange(
    'tie.jsonl',
    'tie-session',
    '2026-07-24T10:00:00.000Z',
    [
      makeSlice('2026-07-24T10:00:00.000Z', {
        modelId: 'gpt-z',
        totalTokens: 1_000,
      }),
      makeSlice('2026-07-24T10:10:00.000Z', {
        modelId: 'gpt-a',
        totalTokens: 1_000,
      }),
    ]
  );
  const index = rebuildCostOptimizationIndex(
    'C:\\sessions',
    [source],
    FIXED_NOW
  );

  expect(
    buildSessionDiagnosisObservations({
      index,
      pricing: PRICING,
    })
  ).toEqual([
    expect.objectContaining({
      diagnosisId: 'tie.jsonl\u001ftie-session',
      dominantModelId: 'gpt-a',
    }),
  ]);
});
```

- [ ] **Step 2: 写入历史仅向前和范围回退失败测试**

`tests/sessionDiagnosisBaselines.test.ts`：

```ts
it('uses only prior project-model values and ignores future observations', () => {
  const current = makeNumericMetric('current', '2026-07-20T12:00:00.000Z', 30, {
    projectPath: 'C:\\repo',
    dominantModelId: 'gpt-source',
  });
  const history = [
    makeNumericMetric('prior-1', '2026-07-18T12:00:00.000Z', 10),
    makeNumericMetric('prior-2', '2026-07-19T12:00:00.000Z', 12),
    makeNumericMetric('future', '2026-07-21T12:00:00.000Z', 100),
    makeNumericMetric('invalid', 'invalid', 1_000),
  ];

  const baseline = resolveDiagnosisBaseline({
    current,
    history,
    scopeOrder: ['project-model', 'model', 'global'],
    minimumSamples: 2,
    historyWindow: 28,
    direction: 'positive',
    zeroMadAbsoluteScale: 1,
  });

  expect(baseline).toMatchObject({
    scope: 'project-model',
    sampleCount: 2,
    median: 11,
  });
});

it('falls back from project-model to model before global', () => {
  const current = makeNumericMetric('current', '2026-07-20T12:00:00.000Z', 30, {
    projectPath: 'C:\\selected',
    dominantModelId: 'gpt-source',
  });
  const history = [
    ...[8, 10, 12].map((value, index) =>
      makeNumericMetric(`model-${index}`, `2026-07-1${index + 1}T12:00:00.000Z`, value, {
        projectPath: 'C:\\other',
        dominantModelId: 'gpt-source',
      })
    ),
    ...[1, 2, 3].map((value, index) =>
      makeNumericMetric(`global-${index}`, `2026-07-0${index + 1}T12:00:00.000Z`, value, {
        projectPath: 'C:\\other',
        dominantModelId: 'gpt-other',
      })
    ),
  ];
  const baseline = resolveDiagnosisBaseline({
    current,
    history,
    scopeOrder: ['project-model', 'model', 'global'],
    minimumSamples: 3,
    historyWindow: 28,
    direction: 'positive',
    zeroMadAbsoluteScale: 1,
  });
  expect(baseline?.scope).toBe('model');
});
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- tests/robustStatistics.test.ts tests/sessionDiagnosisCandidates.test.ts tests/sessionDiagnosisBaselines.test.ts
```

Expected: FAIL，提示新模块或导出不存在。

- [ ] **Step 4: 定义公共诊断类型**

在 `src/shared/costOptimizationTypes.ts` 增加以下稳定名称：

```ts
export type SessionDiagnosisCause =
  | 'input-growth'
  | 'cache-degradation'
  | 'generation-concentration'
  | 'model-cost-dominance'
  | 'interaction-accumulation';
export type SessionDiagnosisSeverity = 'warning' | 'critical';
export type SessionDiagnosisConfidence = 'low' | 'medium' | 'high';
export type SessionDetectorState =
  | 'finding'
  | 'not-found'
  | 'insufficient-data'
  | 'not-applicable';
export type SessionDiagnosisBaselineScope =
  | 'session'
  | 'project-model'
  | 'model'
  | 'project'
  | 'global';

export interface SessionDiagnosisBaseline {
  scope: SessionDiagnosisBaselineScope;
  sampleCount: number;
  median: number;
  mad: number;
  score: number;
}

export interface SessionDiagnosisFinding {
  state: 'finding';
  cause: SessionDiagnosisCause;
  severity: SessionDiagnosisSeverity;
  confidence: SessionDiagnosisConfidence;
  normalizedScore: number;
  baseline?: SessionDiagnosisBaseline;
  evidence: SessionDiagnosisEvidence;
  range?: { start: string; end: string };
}

export interface SessionDiagnosisUnavailable {
  state: Exclude<SessionDetectorState, 'finding'>;
  cause: SessionDiagnosisCause;
  reason:
    | 'within-normal-range'
    | 'insufficient-history'
    | 'insufficient-slices'
    | 'pricing-incomplete'
    | 'zero-input'
    | 'zero-total'
    | 'invalid-time-range';
}

export type SessionDetectorResult =
  | SessionDiagnosisFinding
  | SessionDiagnosisUnavailable;
```

五种 evidence 联合和公开传输类型使用以下完整字段：

```ts
export type SessionDiagnosisEvidence =
  | {
      kind: 'input-growth';
      earlyMedianTokens: number;
      lateMedianTokens: number;
      growthRatio: number;
      absoluteGrowthTokens: number;
    }
  | {
      kind: 'cache-reuse';
      currentPercentage: number;
      firstHalfPercentage: number;
      secondHalfPercentage: number;
      targetPercentage: number;
    }
  | {
      kind: 'generation-share';
      subtype: 'output' | 'reasoning' | 'both';
      outputPercentage: number;
      reasoningPercentage: number;
    }
  | {
      kind: 'model-cost';
      modelId: string;
      costShare: number;
      unitCostRatio: number;
      switchedFromModelId?: string;
      switchedToModelId?: string;
      switchedCostShare?: number;
    }
  | {
      kind: 'interaction-accumulation';
      eventCount: number;
      durationMs?: number;
      maxSliceShare: number;
    };

export type SessionDiagnosisFindingSummary = Pick<
  SessionDiagnosisFinding,
  'cause' | 'severity' | 'confidence' | 'normalizedScore' | 'baseline'
>;

export interface SessionDiagnosisSummary extends TokenUsage {
  diagnosisId: string;
  sourceFile: string;
  sessionId: string;
  threadName?: string;
  startedAt: string;
  projectPath: string;
  projectName: string;
  eventCount: number;
  pricedCostUsd: number;
  coverage: PricingCoverage;
  tokenPercentile: number;
  pricedCostPercentile?: number;
  impactPercentile: number;
  requiresAttention: boolean;
  anomalySeverity?: CostAnomalySeverity;
  primaryFinding?: SessionDiagnosisFindingSummary;
  additionalFindingCount: number;
}

export interface SessionDiagnosisTimelinePoint extends TokenUsage {
  contributionId: string;
  occurredAt: string;
  modelId?: string;
}

export interface SessionDiagnosisDetail {
  summary: SessionDiagnosisSummary;
  detectors: SessionDetectorResult[];
  timeline: SessionDiagnosisTimelinePoint[];
  invalidTimelinePointCount: number;
}

export interface SessionDiagnosisRequest {
  query: CostOptimizationQuery;
  diagnosisId: string;
}

export type SessionDiagnosisDetailResult =
  | { kind: 'ready'; detail: SessionDiagnosisDetail }
  | { kind: 'not-found'; diagnosisId: string };
```

把 `diagnostics: SessionDiagnosisSummary[]` 加入 `CostOptimizationSnapshot`，并在测试 `SNAPSHOT` fixture 中初始化为空数组。

在 `src/shared/sessionDiagnosisTypes.ts` 增加检测器统一上下文：

```ts
export interface SessionDiagnosisDetectorContext {
  current: SessionDiagnosisObservation;
  history: SessionDiagnosisObservation[];
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
}
```

- [ ] **Step 5: 实现稳健统计并保持现有异常行为**

`src/shared/robustStatistics.ts`：

```ts
const MAD_SCALE_FACTOR = 1.4826;

export interface RobustScoreOptions {
  zeroMadRelativeScale: number;
  zeroMadAbsoluteScale: number;
}

export interface RobustScore {
  median: number;
  mad: number;
  scale: number;
  score: number;
  ratio: number;
}

export const getRobustScore = (
  actual: number,
  samples: number[],
  options: RobustScoreOptions
): RobustScore => {
  const center = median(samples);
  const mad = medianAbsoluteDeviation(samples, center);
  const scale =
    mad > 0
      ? MAD_SCALE_FACTOR * mad
      : Math.max(center * options.zeroMadRelativeScale, options.zeroMadAbsoluteScale);
  return {
    median: center,
    mad,
    scale,
    score: (actual - center) / scale,
    ratio: center > 0 ? actual / center : actual / options.zeroMadAbsoluteScale,
  };
};
```

将 `costOptimizationAnomalies.ts` 的本地 median/MAD/scale 逻辑改为调用该模块，并保持原有 USD 零尺度常量。

- [ ] **Step 6: 实现会话观测、百分位与候选**

`src/shared/sessionDiagnosisTypes.ts` 定义内部接口：

```ts
export interface SessionDiagnosisObservation extends TokenUsage {
  diagnosisId: string;
  sourceFile: string;
  sessionId: string;
  threadName?: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  eventCount: number;
  dominantModelId?: string;
  contributions: IndexedUsageContribution[];
  pricedCostUsd: number;
  coverage: PricingCoverage;
}

export interface SessionDiagnosisCandidate extends SessionDiagnosisObservation {
  tokenPercentile: number;
  pricedCostPercentile?: number;
  impactPercentile: number;
  requiresAttention: boolean;
}

export interface BuildSessionDiagnosisObservationsInput {
  index: CostOptimizationIndex;
  pricing: ModelPricingEntry[];
}

export interface SelectDiagnosisCandidatesInput {
  observations: SessionDiagnosisObservation[];
  anomalies: CostAnomaly[];
  minimumPricingCoveragePercentage: number;
}
```

把 `pricing.ts` 现有私有 `normalizeModelId` 改为具名导出，不改变实现；诊断代码必须复用它。`buildSessionDiagnosisObservations` 从索引的全部来源构建历史全集，不按当前查询截断；查询范围过滤在 Task 5 组合评估时完成，使检测器仍能读取周期之前的观测。主要模型按贡献总 Token 降序选择；并列时按规范化模型 ID 字典序选择，缺失模型使用稳定键 `__unknown_model__`。

每个来源的费用和 coverage 复用现有 `calculateEstimatedCost`，不复制价格别名逻辑：

```ts
const slices = source.contributions.map(
  ({
    occurredAt,
    modelId,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
  }): UsageSlice => ({
    occurredAt,
    modelId,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    totalTokens,
  })
);
const estimate = calculateEstimatedCost(slices, input.pricing);
const totalTokens = source.contributions.reduce(
  (total, contribution) => total + contribution.totalTokens,
  0
);
const unpricedTokens = Math.min(
  Math.max(estimate.unpricedTokens, 0),
  totalTokens
);
const pricedTokens = totalTokens - unpricedTokens;
const coverage: PricingCoverage = {
  pricedTokens,
  unpricedTokens,
  totalTokens,
  percentage: totalTokens > 0 ? (pricedTokens / totalTokens) * 100 : 100,
  unpricedModelIds: [...estimate.unpricedModelIds],
};
```

`sessionDiagnosisCandidates.ts` 使用 `KEY_SEPARATOR = '\u001f'` 生成 `sourceFile + sessionId` 的稳定 ID。`getMidrankPercentiles` 严格实现设计文档公式，并将结果限制在 `[0, 1]`。候选选择使用：

```ts
const HIGH_IMPACT_PERCENTILE = 0.8;

const safeCostCandidates = observations.filter(
  ({ coverage }) =>
    coverage.percentage >= input.minimumPricingCoveragePercentage
);
const impactPercentile = Math.max(
  tokenPercentile,
  pricedCostPercentile ?? 0
);
const requiresAttention =
  impactPercentile >= HIGH_IMPACT_PERCENTILE ||
  sessionAnomalyIds.has(sessionId);
```

费用百分位只在 `safeCostCandidates` 内计算，并且只写回达到安全覆盖阈值的会话；覆盖不足的会话保留 Token 排名且不设置 `pricedCostPercentile`。候选先按 `requiresAttention`、`impactPercentile`、`startedAt` 倒序和 `diagnosisId` 排序；检测完成后的 Renderer 会再加入 severity 维度。数组排序全部在副本上完成。

同时在 `tests/helpers/sessionDiagnosisFixtures.ts` 建立后续任务共用的确定性工厂：

```ts
export const makeSlice = (
  occurredAt: string,
  overrides: Partial<UsageSlice> = {}
): UsageSlice => {
  const inputTokens = overrides.inputTokens ?? 1_000;
  const outputTokens = overrides.outputTokens ?? 100;
  return {
    occurredAt,
    modelId: overrides.modelId ?? 'gpt-source',
    inputTokens,
    cachedInputTokens: overrides.cachedInputTokens ?? 0,
    outputTokens,
    reasoningOutputTokens: overrides.reasoningOutputTokens ?? 0,
    totalTokens: overrides.totalTokens ?? inputTokens + outputTokens,
  };
};

export const makeContribution = (
  overrides: Partial<IndexedUsageContribution> = {}
): IndexedUsageContribution => ({
  id: overrides.id ?? 'source.jsonl\u001fsession\u001f2026-07-24T10:00:00.000Z\u001f0',
  sourceFile: overrides.sourceFile ?? 'source.jsonl',
  sessionId: overrides.sessionId ?? 'session',
  occurredAt: overrides.occurredAt ?? '2026-07-24T10:00:00.000Z',
  date: overrides.date ?? '2026-07-24',
  projectPath: overrides.projectPath ?? 'C:\\repo',
  projectName: overrides.projectName ?? 'repo',
  modelId: overrides.modelId ?? 'gpt-source',
  inputTokens: overrides.inputTokens ?? 1_000,
  cachedInputTokens: overrides.cachedInputTokens ?? 0,
  outputTokens: overrides.outputTokens ?? 100,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 0,
  totalTokens: overrides.totalTokens ?? 1_100,
});

export const makeDiagnosisObservation = (
  overrides: Partial<SessionDiagnosisObservation> = {}
): SessionDiagnosisObservation => ({
  diagnosisId: overrides.diagnosisId ?? 'source.jsonl\u001fsession',
  sourceFile: overrides.sourceFile ?? 'source.jsonl',
  sessionId: overrides.sessionId ?? 'session',
  startedAt: overrides.startedAt ?? '2026-07-24T10:00:00.000Z',
  endedAt: overrides.endedAt ?? '2026-07-24T10:10:00.000Z',
  projectPath: overrides.projectPath ?? 'C:\\repo',
  projectName: overrides.projectName ?? 'repo',
  eventCount: overrides.eventCount ?? 1,
  dominantModelId: overrides.dominantModelId ?? 'gpt-source',
  contributions: overrides.contributions ?? [makeContribution()],
  pricedCostUsd: overrides.pricedCostUsd ?? 1,
  coverage: overrides.coverage ?? COVERAGE,
  inputTokens: overrides.inputTokens ?? 1_000,
  cachedInputTokens: overrides.cachedInputTokens ?? 0,
  outputTokens: overrides.outputTokens ?? 100,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 0,
  totalTokens: overrides.totalTokens ?? 1_100,
  ...(overrides.threadName ? { threadName: overrides.threadName } : {}),
});

export const makeDiagnosisObservationWithSlices = (
  slices: UsageSlice[],
  overrides: Partial<SessionDiagnosisObservation> = {}
): SessionDiagnosisObservation =>
  makeDiagnosisObservation({
    ...sumSlices(slices),
    ...overrides,
    eventCount: overrides.eventCount ?? slices.length,
    contributions: slices.map((slice, index) =>
      makeContribution({
        id: `source.jsonl\u001fsession\u001f${slice.occurredAt}\u001f${index}`,
        ...slice,
      })
    ),
  });

export const makeDiagnosisSourceChange = (
  sourceFile: string,
  sessionId: string,
  startedAt: string,
  slices: UsageSlice[],
  projectPath = 'C:\\repo'
): UsageSourceChange => ({
  sourceFile,
  fingerprint: `${sessionId}:${slices.length}`,
  session: {
    sessionId,
    startedAt,
    endedAt: slices.at(-1)?.occurredAt ?? startedAt,
    projectPath,
    projectName: projectPath.split('\\').pop() || 'Unknown Project',
    usageSlices: slices.map((slice) => ({ ...slice })),
    ...sumSlices(slices),
    eventCount: slices.length,
    sourceFile,
    warnings: [],
  },
});

export const makeDetectorContext = (
  current: SessionDiagnosisObservation,
  history: SessionDiagnosisObservation[],
  settingOverrides: Partial<CostOptimizationSettings> = {},
  pricing: ModelPricingEntry[] = PRICING
): SessionDiagnosisDetectorContext => ({
  current,
  history,
  settings: { ...SETTINGS, ...settingOverrides },
  pricing,
});

export const makeNumericMetric = (
  diagnosisId: string,
  occurredAt: string,
  value: number,
  overrides: Partial<NumericDiagnosisMetric> = {}
): NumericDiagnosisMetric => ({
  diagnosisId,
  occurredAt,
  projectPath: overrides.projectPath ?? 'C:\\repo',
  dominantModelId: overrides.dominantModelId ?? 'gpt-source',
  value,
});

export const makeSessionAnomaly = (sessionId: string): CostAnomaly => ({
  id: `anomaly-${sessionId}`,
  level: 'session',
  severity: 'warning',
  occurredAt: '2026-07-24T10:00:00.000Z',
  sessionId,
  actualCostUsd: 2,
  baselineCostUsd: 1,
  deviationRatio: 2,
  score: 4,
  sampleCount: 7,
  baselineScope: 'model',
  coverage: COVERAGE,
  contributionIds: [],
});

const sumSlices = (slices: UsageSlice[]): TokenUsage =>
  slices.reduce<TokenUsage>(
    (total, slice) => ({
      inputTokens: total.inputTokens + slice.inputTokens,
      cachedInputTokens: total.cachedInputTokens + slice.cachedInputTokens,
      outputTokens: total.outputTokens + slice.outputTokens,
      reasoningOutputTokens:
        total.reasoningOutputTokens + slice.reasoningOutputTokens,
      totalTokens: total.totalTokens + slice.totalTokens,
    }),
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    }
  );
```

这些 helper 不得调用生产诊断代码来制造期望值。

- [ ] **Step 7: 实现只向前的检测器专用基线**

`sessionDiagnosisBaselines.ts` 暴露：

```ts
export interface NumericDiagnosisMetric {
  diagnosisId: string;
  occurredAt: string;
  projectPath: string;
  dominantModelId?: string;
  value: number;
}

export interface ResolveDiagnosisBaselineInput {
  current: NumericDiagnosisMetric;
  history: NumericDiagnosisMetric[];
  scopeOrder: SessionDiagnosisBaselineScope[];
  minimumSamples: number;
  historyWindow: number;
  direction: 'positive' | 'negative';
  zeroMadAbsoluteScale: number;
}

export const resolveDiagnosisBaseline = (
  input: ResolveDiagnosisBaselineInput
): SessionDiagnosisBaseline | undefined;
```

先用 `Date.parse` 得到有限毫秒值；当前时间无效时返回 `undefined`，历史时间无效或不早于当前会话时跳过。再按范围、时间和 `diagnosisId` 稳定排序，最后截取最近 `historyWindow` 个样本。负向指标把稳健分数取反，使较低缓存率得到正异常分数。

- [ ] **Step 8: 运行新测试和异常回归**

```powershell
npm test -- tests/robustStatistics.test.ts tests/sessionDiagnosisCandidates.test.ts tests/sessionDiagnosisBaselines.test.ts tests/costOptimizationAnomalies.test.ts tests/pricing.test.ts
npm run typecheck
```

Expected: PASS；现有异常检测输出保持不变。

- [ ] **Step 9: 提交任务**

```powershell
git add src/shared/robustStatistics.ts src/shared/sessionDiagnosisTypes.ts src/shared/sessionDiagnosisCandidates.ts src/shared/sessionDiagnosisBaselines.ts src/shared/costOptimizationTypes.ts src/shared/costOptimizationAnomalies.ts src/shared/pricing.ts tests/helpers/sessionDiagnosisFixtures.ts tests/helpers/costOptimizationFixtures.ts tests/robustStatistics.test.ts tests/sessionDiagnosisCandidates.test.ts tests/sessionDiagnosisBaselines.test.ts tests/costOptimizationAnomalies.test.ts tests/pricing.test.ts
git commit -m "feat: rank session diagnosis candidates"
```

---

### Task 3: 实现输入增长与缓存复用检测

**Files:**

- Create: `src/shared/sessionDiagnosisInput.ts`
- Create: `src/shared/sessionDiagnosisCache.ts`
- Create: `tests/sessionDiagnosisInput.test.ts`
- Create: `tests/sessionDiagnosisCache.test.ts`
- Modify: `tests/helpers/sessionDiagnosisFixtures.ts`

**Interfaces:**

- Consumes: `SessionDiagnosisObservation`, `resolveDiagnosisBaseline`
- Produces: `detectInputGrowth(context): SessionDetectorResult`
- Produces: `detectCacheDegradation(context): SessionDetectorResult`
- Produces: `clampUnitInterval(value): number`
- Produces: `normalizeDiagnosisScore(score, criticalThreshold): number`

- [ ] **Step 1: 写入输入增长失败测试**

`tests/sessionDiagnosisInput.test.ts`：

```ts
it('reports fallback input growth from three ordered slices', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
    makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
    makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 16_500 }),
  ]);

  expect(detectInputGrowth(makeDetectorContext(current, []))).toMatchObject({
    state: 'finding',
    cause: 'input-growth',
    severity: 'critical',
    confidence: 'low',
    evidence: {
      kind: 'input-growth',
      earlyMedianTokens: 4_000,
      lateMedianTokens: 16_500,
      absoluteGrowthTokens: 12_500,
    },
  });
});

it('requires both relative and absolute fallback growth', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 100 }),
    makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 200 }),
    makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 500 }),
  ]);
  expect(detectInputGrowth(makeDetectorContext(current, []))).toMatchObject({
    state: 'insufficient-data',
    cause: 'input-growth',
  });
});

it('reports warning for a conservative fallback below the critical ratio', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
    makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
    makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 13_000 }),
  ]);
  expect(
    detectInputGrowth(makeDetectorContext(current, []))
  ).toMatchObject({
    state: 'finding',
    severity: 'warning',
    confidence: 'low',
  });
});
```

增加以下明确用例：

```ts
it.each([
  { name: 'one slice', slices: [makeSlice('2026-07-24T10:00:00.000Z')] },
  {
    name: 'two slices',
    slices: [
      makeSlice('2026-07-24T10:00:00.000Z'),
      makeSlice('2026-07-24T10:10:00.000Z'),
    ],
  },
  {
    name: 'two valid slices plus an invalid timestamp',
    slices: [
      makeSlice('2026-07-24T10:00:00.000Z'),
      makeSlice('invalid'),
      makeSlice('2026-07-24T10:10:00.000Z'),
    ],
  },
])('returns insufficient data for $name', ({ slices }) => {
  expect(
    detectInputGrowth(
      makeDetectorContext(makeDiagnosisObservationWithSlices(slices), [])
    )
  ).toMatchObject({
    state: 'insufficient-data',
    reason: 'insufficient-slices',
  });
});

it('sorts a copy of slices and leaves the source order unchanged', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 20_000 }),
    makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
    makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
  ]);
  const originalIds = current.contributions.map(({ id }) => id);
  detectInputGrowth(makeDetectorContext(current, []));
  expect(current.contributions.map(({ id }) => id)).toEqual(originalIds);
});
```

```ts
const makeInputGrowthHistory = (): SessionDiagnosisObservation[] =>
  Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservationWithSlices(
      [
        makeSlice(`2026-07-${index + 10}T10:00:00.000Z`, { inputTokens: 4_000 }),
        makeSlice(`2026-07-${index + 10}T10:10:00.000Z`, { inputTokens: 4_500 }),
        makeSlice(`2026-07-${index + 10}T10:20:00.000Z`, { inputTokens: 5_000 }),
      ],
      {
        diagnosisId: `history-${index}`,
        sessionId: `history-${index}`,
        startedAt: `2026-07-${index + 10}T10:00:00.000Z`,
        endedAt: `2026-07-${index + 10}T10:20:00.000Z`,
      }
    )
  );

it('requires both historical growth metrics to be anomalous', () => {
  const history = makeInputGrowthHistory();
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
    makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
    makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 20_000 }),
  ]);
  expect(
    detectInputGrowth(makeDetectorContext(current, history))
  ).toMatchObject({ state: 'finding', confidence: 'high' });
});

it('returns not-found for input growth within a sufficient baseline', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
    makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 4_500 }),
    makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 5_000 }),
  ]);
  expect(
    detectInputGrowth(makeDetectorContext(current, makeInputGrowthHistory()))
  ).toMatchObject({
    state: 'not-found',
    cause: 'input-growth',
  });
});
```

- [ ] **Step 2: 写入缓存失败测试**

`tests/sessionDiagnosisCache.test.ts`：

```ts
it('reports a target gap and caps confidence at medium', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
    }),
    makeSlice('2026-07-24T10:10:00.000Z', {
      inputTokens: 10_000,
      cachedInputTokens: 1_000,
    }),
  ]);

  expect(
    detectCacheDegradation(
      makeDetectorContext(current, [], { targetCachePercentage: 80 })
    )
  ).toMatchObject({
    state: 'finding',
    cause: 'cache-degradation',
    severity: 'critical',
    confidence: 'medium',
    evidence: {
      kind: 'cache-reuse',
      currentPercentage: 15,
      targetPercentage: 80,
    },
  });
});

it('bounds cached input before calculating percentages', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      inputTokens: 1_000,
      cachedInputTokens: 2_000,
    }),
  ]);
  const result = detectCacheDegradation(
    makeDetectorContext(current, [], { targetCachePercentage: 80 })
  );
  expect(result).toMatchObject({ state: 'not-found' });
});
```

增加以下明确用例：

```ts
it('returns zero-input when no input tokens exist', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 100,
      totalTokens: 100,
    }),
  ]);
  expect(detectCacheDegradation(makeDetectorContext(current, []))).toMatchObject({
    state: 'not-applicable',
    reason: 'zero-input',
  });
});

it('reports a fifteen-point late-session decline', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      inputTokens: 10_000,
      cachedInputTokens: 8_000,
    }),
    makeSlice('2026-07-24T10:10:00.000Z', {
      inputTokens: 10_000,
      cachedInputTokens: 6_500,
    }),
  ]);
  expect(
    detectCacheDegradation(
      makeDetectorContext(current, [], { targetCachePercentage: 60 })
    )
  ).toMatchObject({
    state: 'finding',
    severity: 'warning',
    confidence: 'medium',
  });
});
```

```ts
it('caps a high-confidence historical cache anomaly at medium', () => {
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservationWithSlices(
      [
        makeSlice(`2026-07-${index + 10}T10:00:00.000Z`, {
          inputTokens: 10_000,
          cachedInputTokens: 8_000,
        }),
      ],
      {
        diagnosisId: `history-${index}`,
        sessionId: `history-${index}`,
        startedAt: `2026-07-${index + 10}T10:00:00.000Z`,
        endedAt: `2026-07-${index + 10}T10:00:00.000Z`,
      }
    )
  );
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      inputTokens: 10_000,
      cachedInputTokens: 2_000,
    }),
  ]);
  expect(
    detectCacheDegradation(
      makeDetectorContext(current, history, { targetCachePercentage: 10 })
    )
  ).toMatchObject({ state: 'finding', confidence: 'medium' });
});
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- tests/sessionDiagnosisInput.test.ts tests/sessionDiagnosisCache.test.ts
```

Expected: FAIL，提示检测器模块不存在。

- [ ] **Step 4: 实现输入增长检测器**

使用以下具名常量：

```ts
const MIN_INPUT_GROWTH_SLICES = 3;
const INPUT_GROWTH_FALLBACK_RATIO = 2;
const INPUT_GROWTH_FALLBACK_MIN_TOKENS = 8_192;
const INPUT_GROWTH_CRITICAL_RATIO = 4;
```

跳过无效 `occurredAt`，按毫秒时间和 contribution ID 稳定排序副本。`segmentSize = Math.floor(validSlices.length / 3)`；前段取开头 `segmentSize` 个，后段取末尾 `segmentSize` 个，中段不参与早晚中位数。历史基线顺序为 `['project-model', 'model', 'global']`。历史充足时，增长倍数和绝对增长量都必须达到正向异常阈值。

历史 finding 的置信度为 high；两个指标都达到 warning 才 finding，且增长倍数达到 `INPUT_GROWTH_CRITICAL_RATIO`、绝对增长仍达到 warning 时升级 critical。历史不足但满足双重保守条件时置信度为 low。`normalizedScore` 对两个必需证据分别归一化后取较小值，并通过有限数检查限制在 `[0, 1]`。

所有归一化分数调用本任务 Step 6 定义的 `normalizeDiagnosisScore`，不在检测器内重复边界实现。

- [ ] **Step 5: 实现缓存复用检测器**

使用：

```ts
const CACHE_TARGET_GAP_POINTS = 10;
const CACHE_DECLINE_POINTS = 15;
const CACHE_CRITICAL_GAP_POINTS = 30;
```

缓存率计算为 `boundedCachedInputTokens / inputTokens * 100`，历史基线顺序为 `['project-model', 'model', 'project', 'global']`。整体目标差距、前后下降和历史负向异常任一成立即可 finding；严重程度取三项中的最高结果；置信度最终执行：

```ts
const confidence: SessionDiagnosisConfidence =
  candidateConfidence === 'low' ? 'low' : 'medium';
```

warning/critical 分别使用历史 `anomalySensitivity`/两倍阈值和上述目标差距常量。`normalizedScore` 取历史负向分数、目标差距和前后下降三个有限归一化值中的最大值，再限制在 `[0, 1]`。

- [ ] **Step 6: 运行聚焦测试并重构重复辅助函数**

```powershell
npm test -- tests/sessionDiagnosisInput.test.ts tests/sessionDiagnosisCache.test.ts tests/sessionDiagnosisBaselines.test.ts
npm run typecheck
```

Expected: PASS。把重复边界逻辑移动到 `sessionDiagnosisTypes.ts`，并使用以下稳定纯函数；不创建全局业务常量文件：

```ts
export const clampUnitInterval = (value: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;

export const normalizeDiagnosisScore = (
  score: number,
  criticalThreshold: number
): number =>
  criticalThreshold > 0
    ? clampUnitInterval(score / criticalThreshold)
    : 0;
```

- [ ] **Step 7: 提交任务**

```powershell
git add src/shared/sessionDiagnosisInput.ts src/shared/sessionDiagnosisCache.ts src/shared/sessionDiagnosisTypes.ts tests/helpers/sessionDiagnosisFixtures.ts tests/sessionDiagnosisInput.test.ts tests/sessionDiagnosisCache.test.ts
git commit -m "feat: diagnose input and cache consumption"
```

---

### Task 4: 实现生成占比、模型成本与交互累积检测

**Files:**

- Create: `src/shared/sessionDiagnosisGeneration.ts`
- Create: `src/shared/sessionDiagnosisModelCost.ts`
- Create: `src/shared/sessionDiagnosisAccumulation.ts`
- Create: `tests/sessionDiagnosisGeneration.test.ts`
- Create: `tests/sessionDiagnosisModelCost.test.ts`
- Create: `tests/sessionDiagnosisAccumulation.test.ts`
- Modify: `tests/helpers/sessionDiagnosisFixtures.ts`

**Interfaces:**

- Produces: `detectGenerationConcentration(context): SessionDetectorResult`
- Produces: `detectModelCostDominance(context): SessionDetectorResult`
- Produces: `isHighCostModelSwitch(unitCostRatio, switchedCostShare): boolean`
- Produces: `detectInteractionAccumulation(context): SessionDetectorResult`

- [ ] **Step 1: 写入生成占比失败测试**

```ts
it('reports both output and reasoning concentration against model history', () => {
  const current = makeDiagnosisObservation({
    totalTokens: 100_000,
    outputTokens: 60_000,
    reasoningOutputTokens: 40_000,
  });
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      totalTokens: 100_000,
      outputTokens: 10_000,
      reasoningOutputTokens: 5_000,
    })
  );

  expect(
    detectGenerationConcentration(makeDetectorContext(current, history))
  ).toMatchObject({
    state: 'finding',
    cause: 'generation-concentration',
    severity: 'critical',
    confidence: 'high',
    evidence: {
      kind: 'generation-share',
      subtype: 'both',
      outputPercentage: 60,
      reasoningPercentage: 40,
    },
  });
});

it('returns insufficient data without a historical ratio baseline', () => {
  expect(
    detectGenerationConcentration(
      makeDetectorContext(makeDiagnosisObservation(), [])
    )
  ).toMatchObject({
    state: 'insufficient-data',
    cause: 'generation-concentration',
  });
});

it('returns not-applicable instead of dividing by zero total tokens', () => {
  expect(
    detectGenerationConcentration(
      makeDetectorContext(
        makeDiagnosisObservation({
          inputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
        }),
        []
      )
    )
  ).toMatchObject({
    state: 'not-applicable',
    reason: 'zero-total',
  });
});

it.each([
  {
    name: 'output',
    outputTokens: 60_000,
    reasoningOutputTokens: 5_000,
  },
  {
    name: 'reasoning',
    outputTokens: 10_000,
    reasoningOutputTokens: 45_000,
  },
])('reports an isolated $name subtype', ({ name, outputTokens, reasoningOutputTokens }) => {
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      totalTokens: 100_000,
      outputTokens: 10_000,
      reasoningOutputTokens: 5_000,
    })
  );
  const result = detectGenerationConcentration(
    makeDetectorContext(
      makeDiagnosisObservation({
        totalTokens: 100_000,
        outputTokens,
        reasoningOutputTokens,
      }),
      history
    )
  );
  expect(result).toMatchObject({
    state: 'finding',
    evidence: { kind: 'generation-share', subtype: name },
  });
});

it('returns not-found when both generation shares stay within history', () => {
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      totalTokens: 100_000,
      outputTokens: 10_000,
      reasoningOutputTokens: 5_000,
    })
  );
  expect(
    detectGenerationConcentration(
      makeDetectorContext(
        makeDiagnosisObservation({
          totalTokens: 100_000,
          outputTokens: 10_000,
          reasoningOutputTokens: 5_000,
        }),
        history
      )
    )
  ).toMatchObject({ state: 'not-found' });
});
```

- [ ] **Step 2: 写入模型成本失败测试**

```ts
const DIAGNOSIS_PRICING: ModelPricingEntry[] = [
  ...PRICING,
  {
    modelId: 'gpt-expensive',
    aliases: [],
    inputUsdPerMillion: 8,
    cachedInputUsdPerMillion: 2,
    outputUsdPerMillion: 32,
    effectiveAt: '2026-07-01',
    sourceKind: 'built-in',
  },
];

it('reports a dominant high-unit-cost model with complete pricing', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      modelId: 'gpt-expensive',
      inputTokens: 800_000,
      outputTokens: 100_000,
    }),
    makeSlice('2026-07-24T10:10:00.000Z', {
      modelId: 'gpt-source',
      inputTokens: 50_000,
      outputTokens: 10_000,
    }),
  ]);

  expect(
    detectModelCostDominance(
      makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING)
    )
  ).toMatchObject({
    state: 'finding',
    cause: 'model-cost-dominance',
    evidence: {
      kind: 'model-cost',
      modelId: 'gpt-expensive',
      costShare: expect.any(Number),
    },
  });
});

it('does not infer model cost when any participating model is unpriced', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      modelId: 'unpriced-model',
    }),
  ]);
  expect(
    detectModelCostDominance(makeDetectorContext(current, []))
  ).toMatchObject({
    state: 'not-applicable',
    reason: 'pricing-incomplete',
  });
});

it('returns not-found for a completely priced ordinary-cost model', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      modelId: 'gpt-source',
      inputTokens: 100_000,
      outputTokens: 10_000,
    }),
  ]);
  expect(
    detectModelCostDominance(
      makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING)
    )
  ).toMatchObject({
    state: 'not-found',
    cause: 'model-cost-dominance',
  });
});
```

增加模型切换边界和不可变性用例：

```ts
it('reports a higher-cost model switch with at least twenty percent cost share', () => {
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      modelId: 'gpt-source',
      inputTokens: 100_000,
      outputTokens: 10_000,
    }),
    makeSlice('2026-07-24T10:10:00.000Z', {
      modelId: 'gpt-expensive',
      inputTokens: 100_000,
      outputTokens: 10_000,
    }),
  ]);
  expect(
    detectModelCostDominance(
      makeDetectorContext(current, [], undefined, DIAGNOSIS_PRICING)
    )
  ).toMatchObject({
    state: 'finding',
    evidence: {
      kind: 'model-cost',
      switchedFromModelId: 'gpt-source',
      switchedToModelId: 'gpt-expensive',
    },
  });
});

it('does not mutate pricing while comparing effective unit costs', () => {
  const pricing = structuredClone(DIAGNOSIS_PRICING);
  const current = makeDiagnosisObservationWithSlices([
    makeSlice('2026-07-24T10:00:00.000Z', {
      modelId: 'gpt-source',
    }),
  ]);
  detectModelCostDominance(makeDetectorContext(current, [], undefined, pricing));
  expect(pricing).toEqual(DIAGNOSIS_PRICING);
});
```

```ts
it.each([
  { unitCostRatio: 1.49, switchedCostShare: 0.2 },
  { unitCostRatio: 1.5, switchedCostShare: 0.19 },
])(
  'rejects a switch below either boundary',
  ({ unitCostRatio, switchedCostShare }) => {
    expect(isHighCostModelSwitch(unitCostRatio, switchedCostShare)).toBe(false);
  }
);
```

`isHighCostModelSwitch` 是 `sessionDiagnosisModelCost.ts` 导出的纯边界 helper，生产检测器也必须调用它，避免测试复制条件。

- [ ] **Step 3: 写入交互累积失败测试**

```ts
it('reports distributed event accumulation against project history', () => {
  const contributions = Array.from({ length: 30 }, (_, index) =>
    makeContribution({
      id: `current-${index}`,
      occurredAt: `2026-07-24T10:${String(index).padStart(2, '0')}:00.000Z`,
      inputTokens: 10_000,
      outputTokens: 0,
      totalTokens: 10_000,
    })
  );
  const current = makeDiagnosisObservation({
    eventCount: 30,
    startedAt: '2026-07-24T10:00:00.000Z',
    endedAt: '2026-07-24T12:00:00.000Z',
    totalTokens: 300_000,
    contributions,
  });
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      endedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:10:00.000Z`,
      eventCount: 5,
    })
  );

  expect(
    detectInteractionAccumulation(makeDetectorContext(current, history))
  ).toMatchObject({
    state: 'finding',
    cause: 'interaction-accumulation',
    evidence: {
      kind: 'interaction-accumulation',
      eventCount: 30,
      maxSliceShare: expect.any(Number),
    },
  });
});

it('does not call one dominant slice accumulated interaction', () => {
  const current = makeDiagnosisObservation({
    totalTokens: 100_000,
    contributions: [
      makeContribution({ totalTokens: 80_000 }),
      makeContribution({ totalTokens: 20_000 }),
    ],
  });
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      endedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:10:00.000Z`,
      eventCount: 5,
    })
  );
  expect(
    detectInteractionAccumulation(makeDetectorContext(current, history))
  ).toMatchObject({ state: 'not-found' });
});

it('returns insufficient data when event and duration history are unavailable', () => {
  const current = makeDiagnosisObservation({
    eventCount: 30,
    totalTokens: 300_000,
    contributions: Array.from({ length: 30 }, (_, index) =>
      makeContribution({
        id: `current-${index}`,
        totalTokens: 10_000,
      })
    ),
  });
  expect(
    detectInteractionAccumulation(makeDetectorContext(current, []))
  ).toMatchObject({
    state: 'insufficient-data',
    cause: 'interaction-accumulation',
  });
});

it('returns not-applicable when total tokens cannot support a slice share', () => {
  expect(
    detectInteractionAccumulation(
      makeDetectorContext(
        makeDiagnosisObservation({
          inputTokens: 0,
          outputTokens: 0,
          reasoningOutputTokens: 0,
          totalTokens: 0,
          contributions: [],
        }),
        []
      )
    )
  ).toMatchObject({
    state: 'not-applicable',
    reason: 'zero-total',
  });
});

it('uses event-count evidence when the duration is invalid', () => {
  const history = Array.from({ length: 7 }, (_, index) =>
    makeDiagnosisObservation({
      diagnosisId: `history-${index}`,
      sessionId: `history-${index}`,
      startedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:00:00.000Z`,
      endedAt: `2026-07-${String(index + 10).padStart(2, '0')}T10:10:00.000Z`,
      eventCount: 5,
    })
  );
  const current = makeDiagnosisObservation({
    startedAt: 'invalid',
    endedAt: 'invalid',
    eventCount: 30,
    totalTokens: 300_000,
    contributions: Array.from({ length: 30 }, (_, index) =>
      makeContribution({
        id: `current-${index}`,
        totalTokens: 10_000,
      })
    ),
  });
  const result = detectInteractionAccumulation(
    makeDetectorContext(current, history)
  );
  expect(result).toMatchObject({
    state: 'finding',
    cause: 'interaction-accumulation',
  });
  if (
    result.state !== 'finding' ||
    result.evidence.kind !== 'interaction-accumulation'
  ) {
    throw new Error('Expected interaction accumulation evidence.');
  }
  expect(result.evidence.durationMs).toBeUndefined();
});
```

- [ ] **Step 4: 运行测试并确认失败**

```powershell
npm test -- tests/sessionDiagnosisGeneration.test.ts tests/sessionDiagnosisModelCost.test.ts tests/sessionDiagnosisAccumulation.test.ts
```

Expected: FAIL，提示三个检测器导出不存在。

- [ ] **Step 5: 实现生成占比检测**

输出和推理分别计算 `tokens / totalTokens * 100`，使用 `['project-model', 'model', 'global']` 基线。两个指标独立得到严重程度和置信度，再合并 subtype：

```ts
const subtype =
  outputFinding && reasoningFinding
    ? 'both'
    : outputFinding
      ? 'output'
      : 'reasoning';
```

没有足够历史时返回 `insufficient-data`，不设置固定比例 finding。

输出和推理的 warning 阈值均为 `settings.anomalySensitivity`，critical 阈值均为其两倍；任一指标达到 critical 即为 critical。历史与时间数据完整时置信度为 high。`normalizedScore` 取两个指标中较高的有限稳健分数除以 critical 阈值，并限制在 `[0, 1]`。

- [ ] **Step 6: 实现模型成本检测**

使用具名常量：

```ts
const DOMINANT_MODEL_COST_SHARE = 0.5;
const HIGH_UNIT_COST_RATIO = 1.5;
const MODEL_SWITCH_COST_RATIO = 1.5;
const MODEL_SWITCH_MIN_COST_SHARE = 0.2;
const MODEL_COST_CRITICAL_RATIO = 3;

export const isHighCostModelSwitch = (
  unitCostRatio: number,
  switchedCostShare: number
): boolean =>
  unitCostRatio >= MODEL_SWITCH_COST_RATIO &&
  switchedCostShare >= MODEL_SWITCH_MIN_COST_SHARE;
```

对每个价格条目套用同一会话实际普通输入、缓存输入和输出比例，得到可比较的有效单位成本；不得平均三项单价。参与会话的任一模型未计价时返回 `not-applicable`。

有效单位成本使用同一纯函数，返回按实际 Token 构成加权的 USD/百万 Token：

```ts
const getEffectiveUnitCost = (
  usage: TokenUsage,
  pricing: ModelPricingEntry
): number => {
  const boundedCachedInput = Math.min(
    Math.max(usage.cachedInputTokens, 0),
    Math.max(usage.inputTokens, 0)
  );
  const regularInput = Math.max(usage.inputTokens - boundedCachedInput, 0);
  const pricedTokens =
    regularInput + boundedCachedInput + Math.max(usage.outputTokens, 0);
  if (pricedTokens === 0) {
    return 0;
  }
  return (
    (regularInput * pricing.inputUsdPerMillion +
      boundedCachedInput * pricing.cachedInputUsdPerMillion +
      Math.max(usage.outputTokens, 0) * pricing.outputUsdPerMillion) /
    pricedTokens
  );
};
```

当前价格表中位数对每个价格条目调用 `getEffectiveUnitCost(current, entry)`。会话贡献先按 `normalizeModelId(modelId)` 分组，缺失模型使用 `__unknown_model__`；每组费用继续调用 `calculateEstimatedCost`。模型切换只比较时间有效、稳定排序后相邻且规范化模型 ID 不同的边界；`switchedCostShare` 使用该边界之后连续的 switched-to 模型切片费用除以会话已计价费用。若多个边界命中，按 unit-cost ratio、switched cost share、时间和 contribution ID 稳定选择最强边界。

达到任一 finding 条件时置信度为 `medium`（完整价格提供可靠会话内证据，但没有历史基线）。触发条件使用的 `unitCostRatio >= MODEL_COST_CRITICAL_RATIO` 时严重程度为 `critical`，否则为 `warning`；标准化分数为 `clampUnitInterval(unitCostRatio / MODEL_COST_CRITICAL_RATIO)`。

- [ ] **Step 7: 实现交互累积检测**

总 Token 不大于 0 时先返回 `not-applicable/zero-total`。其余情况使用 `SINGLE_SPIKE_MAX_SHARE = 0.5`。事件数和持续时间采用 `['project', 'global']` 基线；两者任一达到异常 warning 阈值即可 finding，任一达到 `anomalySensitivity * 2` 即为 critical，并取较高严重程度。历史充足且数据有效时置信度为 high；无效开始/结束时间只移除持续时间证据，不移除事件数证据。最大切片占比大于 0.5 时返回 `not-found`；两个指标都没有足够历史时返回 `insufficient-data`。`normalizedScore` 取两个可用稳健分数的最大值除以 critical 阈值并限制在 `[0, 1]`。

- [ ] **Step 8: 运行聚焦测试和类型检查**

```powershell
npm test -- tests/sessionDiagnosisGeneration.test.ts tests/sessionDiagnosisModelCost.test.ts tests/sessionDiagnosisAccumulation.test.ts tests/sessionDiagnosisBaselines.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 9: 提交任务**

```powershell
git add src/shared/sessionDiagnosisGeneration.ts src/shared/sessionDiagnosisModelCost.ts src/shared/sessionDiagnosisAccumulation.ts tests/helpers/sessionDiagnosisFixtures.ts tests/sessionDiagnosisGeneration.test.ts tests/sessionDiagnosisModelCost.test.ts tests/sessionDiagnosisAccumulation.test.ts
git commit -m "feat: diagnose generation and model costs"
```

---

### Task 5: 组合检测器并把摘要加入成本优化评估

**Files:**

- Create: `src/shared/sessionDiagnosisEvaluation.ts`
- Create: `tests/sessionDiagnosisEvaluation.test.ts`
- Modify: `src/shared/costOptimizationEvaluation.ts`
- Modify: `tests/costOptimizationEvaluation.test.ts`
- Modify: `tests/helpers/costOptimizationFixtures.ts`

**Interfaces:**

- Produces: `evaluateSessionDiagnostics(input): SessionDiagnosisSummary[]`
- Produces: `evaluateSessionDiagnosisDetail(input): SessionDiagnosisDetailResult`
- Produces: `selectPrimaryFinding(findings): SessionDiagnosisFinding | undefined`
- Extends: `CostOptimizationSnapshot.diagnostics`

- [ ] **Step 1: 写入主原因、完整检测器状态和时间线失败测试**

```ts
it('selects a deterministic primary finding and keeps all detector states', () => {
  const input = makeSessionDiagnosisEvaluationInput();
  const summaries = evaluateSessionDiagnostics(input);
  const summary = summaries.find(({ sessionId }) => sessionId === 'expensive');

  expect(summary).toMatchObject({
    requiresAttention: true,
    primaryFinding: {
      cause: 'input-growth',
      severity: 'critical',
    },
  });
  expect(summary?.additionalFindingCount).toBeGreaterThan(0);

  const detail = evaluateSessionDiagnosisDetail({
    ...input,
    diagnosisId: summary?.diagnosisId ?? '',
  });
  expect(detail).toMatchObject({ kind: 'ready' });
  if (detail.kind === 'ready') {
    expect(detail.detail.detectors).toHaveLength(5);
    expect(detail.detail.timeline.length).toBeGreaterThan(0);
  }
});

it('returns a typed not-found result for a missing diagnosis', () => {
  expect(
    evaluateSessionDiagnosisDetail({
      ...makeSessionDiagnosisEvaluationInput(),
      diagnosisId: 'missing',
    })
  ).toEqual({ kind: 'not-found', diagnosisId: 'missing' });
});

const makeSessionDiagnosisEvaluationInput = (): EvaluateSessionDiagnosticsInput => {
  const history = Array.from({ length: 7 }, (_, index) => {
    const day = String(index + 10).padStart(2, '0');
    return makeDiagnosisSourceChange(
      `history-${index}.jsonl`,
      `history-${index}`,
      `2026-07-${day}T10:00:00.000Z`,
      [
        makeSlice(`2026-07-${day}T10:00:00.000Z`, {
          inputTokens: 4_000,
          cachedInputTokens: 2_000,
          outputTokens: 500,
        }),
      ]
    );
  });
  const expensive = makeDiagnosisSourceChange(
    'expensive.jsonl',
    'expensive',
    '2026-07-24T10:00:00.000Z',
    [
      makeSlice('2026-07-24T10:00:00.000Z', { inputTokens: 4_000 }),
      makeSlice('2026-07-24T10:10:00.000Z', { inputTokens: 8_000 }),
      makeSlice('2026-07-24T10:20:00.000Z', { inputTokens: 20_000 }),
    ]
  );
  const index = rebuildCostOptimizationIndex(
    'C:\\sessions',
    [...history, expensive],
    FIXED_NOW
  );
  return {
    index,
    query: { period: 'total' },
    settings: SETTINGS,
    pricing: PRICING,
    anomalies: [],
    now: FIXED_NOW,
  };
};

const makeSessionDiagnosisEvaluationInputWithoutFindings =
  (): EvaluateSessionDiagnosticsInput => {
    const source = makeDiagnosisSourceChange(
      'normal.jsonl',
      'normal',
      '2026-07-24T10:00:00.000Z',
      [
        makeSlice('2026-07-24T10:00:00.000Z', {
          inputTokens: 1_000,
          cachedInputTokens: 1_000,
          outputTokens: 0,
          totalTokens: 1_000,
        }),
      ]
    );
    return {
      index: rebuildCostOptimizationIndex('C:\\sessions', [source], FIXED_NOW),
      query: { period: 'total' },
      settings: SETTINGS,
      pricing: PRICING,
      anomalies: [],
      now: FIXED_NOW,
    };
  };

const makeSessionDiagnosisEvaluationInputWithInvalidTimestamp =
  (): EvaluateSessionDiagnosticsInput => {
    const input = makeSessionDiagnosisEvaluationInputWithoutFindings();
    const index = structuredClone(input.index);
    const source = Object.values(index.sources)[0];
    source.contributions[0].occurredAt = 'invalid';
    return { ...input, index };
  };
```

增加主原因和安全边界测试：

```ts
const makeFinding = (
  cause: SessionDiagnosisCause,
  severity: SessionDiagnosisSeverity,
  confidence: SessionDiagnosisConfidence,
  normalizedScore: number
): SessionDiagnosisFinding => ({
  state: 'finding',
  cause,
  severity,
  confidence,
  normalizedScore,
  evidence: {
    kind: 'input-growth',
    earlyMedianTokens: 1,
    lateMedianTokens: 2,
    growthRatio: 2,
    absoluteGrowthTokens: 1,
  },
});

it('orders primary findings by severity, score, confidence and cause order', () => {
  expect(
    selectPrimaryFinding([
      makeFinding('cache-degradation', 'warning', 'high', 1),
      makeFinding('model-cost-dominance', 'critical', 'medium', 0.8),
      makeFinding('input-growth', 'critical', 'high', 0.8),
    ])?.cause
  ).toBe('input-growth');
});

it('treats non-finite normalized scores as zero', () => {
  expect(
    selectPrimaryFinding([
      makeFinding('input-growth', 'warning', 'high', Number.NaN),
      makeFinding('cache-degradation', 'warning', 'high', 0.1),
    ])?.cause
  ).toBe('cache-degradation');
});

it('returns a bounded score without mutating an invalid finding', () => {
  const finding = makeFinding(
    'input-growth',
    'warning',
    'high',
    Number.POSITIVE_INFINITY
  );
  expect(selectPrimaryFinding([finding])).toMatchObject({
    normalizedScore: 0,
  });
  expect(finding.normalizedScore).toBe(Number.POSITIVE_INFINITY);
});

it('keeps an unresolved high-impact summary', () => {
  const input = makeSessionDiagnosisEvaluationInputWithoutFindings();
  expect(evaluateSessionDiagnostics(input)[0]).toMatchObject({
    requiresAttention: true,
    primaryFinding: undefined,
    additionalFindingCount: 0,
  });
});

it('omits invalid timeline timestamps without mutating evaluation input', () => {
  const input = makeSessionDiagnosisEvaluationInputWithInvalidTimestamp();
  const original = structuredClone(input);
  const diagnosisId = evaluateSessionDiagnostics(input)[0].diagnosisId;
  const result = evaluateSessionDiagnosisDetail({ ...input, diagnosisId });
  expect(result).toMatchObject({
    kind: 'ready',
    detail: { invalidTimelinePointCount: 1 },
  });
  expect(input).toEqual(original);
});

it('filters the current list by period and project but keeps earlier history', () => {
  const input = makeScopedSessionDiagnosisEvaluationInput();
  const summaries = evaluateSessionDiagnostics(input);
  expect(summaries.map(({ sessionId }) => sessionId)).toEqual(['selected']);

  const detail = evaluateSessionDiagnosisDetail({
    ...input,
    diagnosisId: summaries[0].diagnosisId,
  });
  expect(detail).toMatchObject({
    kind: 'ready',
    detail: {
      detectors: expect.arrayContaining([
        expect.objectContaining({
          cause: 'generation-concentration',
          state: 'finding',
        }),
      ]),
    },
  });
});

const makeScopedSessionDiagnosisEvaluationInput =
  (): EvaluateSessionDiagnosticsInput => {
    const history = Array.from({ length: 7 }, (_, index) => {
      const day = String(index + 10).padStart(2, '0');
      return makeDiagnosisSourceChange(
        `prior-${index}.jsonl`,
        `prior-${index}`,
        `2026-07-${day}T10:00:00.000Z`,
        [
          makeSlice(`2026-07-${day}T10:00:00.000Z`, {
            inputTokens: 90_000,
            cachedInputTokens: 90_000,
            outputTokens: 10_000,
            totalTokens: 100_000,
          }),
        ]
      );
    });
    const selected = makeDiagnosisSourceChange(
      'selected.jsonl',
      'selected',
      '2026-07-25T10:00:00.000Z',
      [
        makeSlice('2026-07-25T10:00:00.000Z', {
          inputTokens: 40_000,
          cachedInputTokens: 40_000,
          outputTokens: 60_000,
          totalTokens: 100_000,
        }),
      ]
    );
    const otherProject = makeDiagnosisSourceChange(
      'other.jsonl',
      'other',
      '2026-07-25T10:00:00.000Z',
      [
        makeSlice('2026-07-25T10:00:00.000Z', {
          inputTokens: 40_000,
          cachedInputTokens: 40_000,
          outputTokens: 60_000,
          totalTokens: 100_000,
        }),
      ],
      'C:\\other'
    );
    return {
      index: rebuildCostOptimizationIndex(
        'C:\\sessions',
        [...history, selected, otherProject],
        FIXED_NOW
      ),
      query: { period: 'today', projectPath: 'C:\\repo' },
      settings: SETTINGS,
      pricing: PRICING,
      anomalies: [],
      now: FIXED_NOW,
    };
  };
```

- [ ] **Step 2: 写入成本优化快照失败测试**

在 `tests/costOptimizationEvaluation.test.ts`：

```ts
it('includes lightweight session diagnosis summaries without timeline data', () => {
  const snapshot = evaluateCostOptimization(makeEvaluationInput());

  expect(snapshot.diagnostics.length).toBeGreaterThan(0);
  expect(snapshot.diagnostics[0]).not.toHaveProperty('timeline');
  expect(snapshot.diagnostics.every(({ diagnosisId }) => diagnosisId.length > 0)).toBe(true);
});
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- tests/sessionDiagnosisEvaluation.test.ts tests/costOptimizationEvaluation.test.ts
```

Expected: FAIL，提示评估函数或 `diagnostics` 不存在。

- [ ] **Step 4: 实现检测器组合和稳定主原因**

`sessionDiagnosisEvaluation.ts`：

```ts
export interface EvaluateSessionDiagnosticsInput {
  index: CostOptimizationIndex;
  query: CostOptimizationQuery;
  settings: CostOptimizationSettings;
  pricing: ModelPricingEntry[];
  anomalies: CostAnomaly[];
  now: Date;
}

export interface EvaluateSessionDiagnosisDetailInput
  extends EvaluateSessionDiagnosticsInput {
  diagnosisId: string;
}

const CAUSE_ORDER: Record<SessionDiagnosisCause, number> = {
  'input-growth': 0,
  'cache-degradation': 1,
  'generation-concentration': 2,
  'model-cost-dominance': 3,
  'interaction-accumulation': 4,
};

const CONFIDENCE_RANK: Record<SessionDiagnosisConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const DETECTORS = [
  detectInputGrowth,
  detectCacheDegradation,
  detectGenerationConcentration,
  detectModelCostDominance,
  detectInteractionAccumulation,
] as const;

const getSafeNormalizedScore = (finding: SessionDiagnosisFinding): number =>
  Number.isFinite(finding.normalizedScore)
    ? Math.min(Math.max(finding.normalizedScore, 0), 1)
    : 0;

export const selectPrimaryFinding = (
  findings: SessionDiagnosisFinding[]
): SessionDiagnosisFinding | undefined =>
  findings
    .map((finding) => ({
      ...finding,
      normalizedScore: getSafeNormalizedScore(finding),
    }))
    .sort(
    (first, second) =>
      Number(second.severity === 'critical') - Number(first.severity === 'critical') ||
      getSafeNormalizedScore(second) - getSafeNormalizedScore(first) ||
      CONFIDENCE_RANK[second.confidence] -
        CONFIDENCE_RANK[first.confidence] ||
      CAUSE_ORDER[first.cause] - CAUSE_ORDER[second.cause]
    )[0];
```

先从索引构建全部会话观测，再使用与 `filterUsageSummary` 相同的 `startedAt` 本地日边界和精确 `projectPath` 过滤当前候选；未进入当前查询的较早观测仍传给检测器作为历史。为每个候选运行五个检测器。`evaluateSessionDiagnostics` 返回所有查询会话的轻量摘要；`requiresAttention` 只控制默认筛选，不删除其他会话。摘要的 `primaryFinding` 必须复制 finding 的可选 `baseline`，供列表显示范围、样本数和稳健偏差。

- [ ] **Step 5: 实现按需详情与时间线**

`evaluateSessionDiagnosisDetail` 使用相同检测路径查找一个诊断 ID。有效时间按 `occurredAt` 和 contribution ID 排序；无效时间点计数但不进入时间线。详情包含五个 detector result，不把缺失状态过滤掉。

- [ ] **Step 6: 接入成本优化评估**

在 `evaluateCostOptimization` 已经得到 `anomalies` 后调用：

```ts
const diagnostics = evaluateSessionDiagnostics({
  index: input.index,
  query: input.query,
  settings: input.settings,
  pricing: input.pricing,
  anomalies,
  now: input.now,
});
```

将 `diagnostics` 加入返回快照。定价覆盖不足不能整体禁用诊断；只有费用百分位和模型成本检测自行降级。

- [ ] **Step 7: 运行评估、建议与异常回归**

```powershell
npm test -- tests/sessionDiagnosisEvaluation.test.ts tests/costOptimizationEvaluation.test.ts tests/costOptimizationSuggestions.test.ts tests/costOptimizationAnomalies.test.ts
npm run typecheck
```

Expected: PASS。

- [ ] **Step 8: 提交任务**

```powershell
git add src/shared/sessionDiagnosisEvaluation.ts src/shared/costOptimizationEvaluation.ts tests/sessionDiagnosisEvaluation.test.ts tests/costOptimizationEvaluation.test.ts tests/helpers/costOptimizationFixtures.ts
git commit -m "feat: evaluate session diagnoses"
```

---

### Task 6: 通过运行时和类型化 IPC 按需提供诊断详情

**Files:**

- Modify: `src/main/costOptimizationRuntime.ts`
- Modify: `src/shared/costOptimizationTypes.ts`
- Modify: `src/shared/ipcChannels.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/global.d.ts`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `tests/costOptimizationRuntime.test.ts`
- Modify: `tests/costOptimizationIpc.test.ts`
- Modify: `tests/i18n.test.ts`

**Interfaces:**

- Produces: `CostOptimizationRuntime.getSessionDiagnosis(request)`
- Produces: `window.codexUsage.costOptimization.getSessionDiagnosis(request)`
- Produces: `COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL`

- [ ] **Step 1: 写入运行时详情失败测试**

```ts
it('evaluates one diagnosis from the latest index without rescanning usage', async () => {
  const dependencies = makeRuntimeDependencies();
  const runtime = createCostOptimizationRuntime(dependencies);
  await runtime.initialize();
  await runtime.applyUsageCycle(makeCycleWithOneSource());
  const snapshot = runtime.getSnapshot({ period: 'total' });
  const diagnosisId = snapshot.diagnostics[0]?.diagnosisId ?? '';

  const result = runtime.getSessionDiagnosis({
    query: { period: 'total' },
    diagnosisId,
  });

  expect(result).toMatchObject({ kind: 'ready' });
  expect(dependencies.cacheStore.load).toHaveBeenCalledTimes(1);
  expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
});

it('returns not-found after the source is removed', async () => {
  const runtime = createCostOptimizationRuntime(makeRuntimeDependencies());
  await runtime.initialize();
  await runtime.applyUsageCycle(makeCycleWithOneSource());
  const diagnosisId = runtime.getSnapshot({ period: 'total' }).diagnostics[0].diagnosisId;
  await runtime.applyUsageCycle(makeEmptyRemovalCycle());

  expect(
    runtime.getSessionDiagnosis({ query: { period: 'total' }, diagnosisId })
  ).toEqual({ kind: 'not-found', diagnosisId });
});

it('revalues detail after pricing changes without rebuilding the index', async () => {
  const dependencies = makeRuntimeDependencies();
  const runtime = createCostOptimizationRuntime(dependencies);
  await runtime.initialize();
  await runtime.applyUsageCycle(makeCycleWithOneSource());
  const diagnosisId = runtime.getSnapshot({ period: 'total' }).diagnostics[0].diagnosisId;

  await runtime.applyBudgetSnapshot(makeBudgetSnapshotWithUpdatedPricing());
  const result = runtime.getSessionDiagnosis({
    query: { period: 'total' },
    diagnosisId,
  });

  expect(result).toMatchObject({
    kind: 'ready',
    detail: { summary: { pricedCostUsd: UPDATED_COST_USD } },
  });
  expect(dependencies.cacheStore.save).toHaveBeenCalledTimes(1);
});

it('rejects a blank diagnosis id with a structured validation issue', async () => {
  const runtime = createCostOptimizationRuntime(makeRuntimeDependencies());
  await runtime.initialize();

  expect(() =>
    runtime.getSessionDiagnosis({
      query: { period: 'total' },
      diagnosisId: '   ',
    })
  ).toThrow('diagnosis-id-empty');
});

const makeEmptyRemovalCycle = (): UsageScanCycle => ({
  result: {
    sessionsDir: 'C:\\sessions',
    scannedAt: FIXED_NOW.toISOString(),
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
    removedSourceFiles: ['usage.jsonl'],
    requiresFullRebuild: false,
  },
});
```

- [ ] **Step 2: 写入 IPC 注册、错误封装和卸载失败测试**

在 `tests/costOptimizationIpc.test.ts` 断言：

```ts
const harness = makeIpcHarness();
const cleanup = registerUsageIpc(harness.dependencies);

expect(electronMocks.handle).toHaveBeenCalledWith(
  COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
  expect.any(Function)
);

await expect(
  invokeHandler(COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL, {
    query: { period: 'total' },
    diagnosisId: 'missing',
  })
).resolves.toEqual({
  ok: true,
  value: { kind: 'not-found', diagnosisId: 'missing' },
});

cleanup();
expect(electronMocks.removeHandler).toHaveBeenCalledWith(
  COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL
);
```

同时把测试 `CostRuntimeMock` 的 Pick 和 `makeIpcHarness` 补齐：

```ts
interface CostRuntimeMock
  extends Pick<
    CostOptimizationRuntime,
    'getSnapshot' | 'getSessionDiagnosis' | 'updateSettings' | 'subscribe'
  > {
  getSnapshot: ReturnType<typeof vi.fn>;
  getSessionDiagnosis: ReturnType<typeof vi.fn>;
  updateSettings: ReturnType<typeof vi.fn>;
}

const costRuntime: CostRuntimeMock = {
  getSnapshot: vi.fn(() => SNAPSHOT),
  getSessionDiagnosis: vi.fn(({ diagnosisId }: SessionDiagnosisRequest) => ({
    kind: 'not-found',
    diagnosisId,
  })),
  updateSettings: vi.fn(async () => SNAPSHOT),
  subscribe: vi.fn((listener) => {
    snapshotListener = listener;
    return () => undefined;
  }),
};
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
npm test -- tests/costOptimizationRuntime.test.ts tests/costOptimizationIpc.test.ts
```

Expected: FAIL，提示运行时方法或 IPC channel 不存在。

- [ ] **Step 4: 实现运行时方法**

在 `CostOptimizationRuntime` 增加：

```ts
getSessionDiagnosis: (
  request: SessionDiagnosisRequest
) => SessionDiagnosisDetailResult;
```

实现先调用现有 `getCostOptimizationQueryIssues` 校验查询，再校验 `diagnosisId.trim()` 非空，最后使用当前 `index`、`settings`、`pricing` 和 `now()` 调用 `evaluateSessionDiagnosisDetail`。不得调用 usage scanner 或 cache load。

在 `CostOptimizationValidationIssue['code']` 联合中加入 `'diagnosis-id-empty'`。空 ID 使用与其他输入相同的结构化异常：

```ts
const diagnosisId = request.diagnosisId.trim();
if (diagnosisId.length === 0) {
  throw new CostOptimizationRuntimeValidationError([
    { field: 'diagnosisId', code: 'diagnosis-id-empty' },
  ]);
}
```

同时增加 `costOptimization.validation.diagnosis-id-empty`：英文为 `Session diagnosis ID is required.`，简体中文为 `必须提供会话诊断 ID。`，保持类型化翻译 key 完整。

- [ ] **Step 5: 增加 IPC、preload 和 Renderer 类型**

`ipcChannels.ts`：

```ts
export const COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL =
  'cost-optimization:get-session-diagnosis';
```

`UsageIpcDependencies.costRuntime` 的 Pick 增加 `getSessionDiagnosis`，并把新 channel 同时加入 `HANDLED_CHANNELS` 和 `ipcMain.handle` 注册表。

`preload.ts`：

```ts
getSessionDiagnosis: (
  request: SessionDiagnosisRequest
): Promise<SessionDiagnosisDetailResult> =>
  invokeCostOptimization(
    COST_OPTIMIZATION_GET_SESSION_DIAGNOSIS_CHANNEL,
    request
  ),
```

扩展 `invokeCostOptimization` 输入联合和 `global.d.ts` 的 `CostOptimizationApi`，不使用类型断言绕过缺失字段。

- [ ] **Step 6: 运行 IPC、preload 相关类型检查和构建**

```powershell
npm test -- tests/costOptimizationRuntime.test.ts tests/costOptimizationIpc.test.ts tests/i18n.test.ts
npm run typecheck
npm run build
```

Expected: PASS；构建确认主进程、preload 和 Renderer 类型一致。

- [ ] **Step 7: 提交任务**

```powershell
git add src/main/costOptimizationRuntime.ts src/shared/costOptimizationTypes.ts src/shared/ipcChannels.ts src/main/ipc.ts src/preload/preload.ts src/renderer/global.d.ts src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts tests/costOptimizationRuntime.test.ts tests/costOptimizationIpc.test.ts tests/i18n.test.ts
git commit -m "feat: expose session diagnosis details"
```

---

### Task 7: 实现可筛选的诊断摘要列表

**Files:**

- Create: `src/renderer/utils/sessionDiagnosisFilters.ts`
- Create: `src/renderer/components/SessionDiagnosisList.tsx`
- Create: `tests/sessionDiagnosisFilters.test.tsx`
- Create: `tests/sessionDiagnosisList.test.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles.css`
- Modify: `tests/i18n.test.ts`

**Interfaces:**

- Produces: `filterSessionDiagnosisSummaries(input)`
- Produces: `<SessionDiagnosisList summaries filters onFiltersChange onOpen />`

- [ ] **Step 1: 扩展 Renderer 诊断测试 fixture**

在 `tests/helpers/sessionDiagnosisFixtures.ts` 增加：

```ts
export const makeFindingSummary = (
  cause: SessionDiagnosisCause,
  severity: SessionDiagnosisSeverity,
  confidence: SessionDiagnosisConfidence,
  baseline?: SessionDiagnosisBaseline
): SessionDiagnosisFindingSummary => ({
  cause,
  severity,
  confidence,
  normalizedScore: severity === 'critical' ? 1 : 0.5,
  ...(baseline ? { baseline } : {}),
});

export const makeDiagnosisSummary = (
  sessionId: string,
  overrides: Partial<SessionDiagnosisSummary> = {}
): SessionDiagnosisSummary => ({
  diagnosisId: overrides.diagnosisId ?? `${sessionId}.jsonl\u001f${sessionId}`,
  sourceFile: overrides.sourceFile ?? `${sessionId}.jsonl`,
  sessionId,
  startedAt: overrides.startedAt ?? '2026-07-24T10:00:00.000Z',
  projectPath: overrides.projectPath ?? 'C:\\repo',
  projectName: overrides.projectName ?? 'repo',
  eventCount: overrides.eventCount ?? 3,
  pricedCostUsd: overrides.pricedCostUsd ?? 1.25,
  coverage: overrides.coverage ?? COVERAGE,
  tokenPercentile: overrides.tokenPercentile ?? 1,
  impactPercentile: overrides.impactPercentile ?? 1,
  requiresAttention: overrides.requiresAttention ?? true,
  primaryFinding:
    'primaryFinding' in overrides
      ? overrides.primaryFinding
      : makeFindingSummary('input-growth', 'critical', 'high'),
  additionalFindingCount: overrides.additionalFindingCount ?? 0,
  inputTokens: overrides.inputTokens ?? 10_000,
  cachedInputTokens: overrides.cachedInputTokens ?? 2_000,
  outputTokens: overrides.outputTokens ?? 1_000,
  reasoningOutputTokens: overrides.reasoningOutputTokens ?? 200,
  totalTokens: overrides.totalTokens ?? 11_000,
  ...(overrides.threadName ? { threadName: overrides.threadName } : {}),
  ...(overrides.pricedCostPercentile !== undefined
    ? { pricedCostPercentile: overrides.pricedCostPercentile }
    : {}),
  ...(overrides.anomalySeverity
    ? { anomalySeverity: overrides.anomalySeverity }
    : {}),
});

export const makeDiagnosisSummaries = (): SessionDiagnosisSummary[] => [
  makeDiagnosisSummary('attention'),
  makeDiagnosisSummary('normal', {
    requiresAttention: false,
    primaryFinding: undefined,
    additionalFindingCount: 0,
    impactPercentile: 0.2,
  }),
];

export const makePartiallyPricedDiagnosisSummary =
  (): SessionDiagnosisSummary =>
    makeDiagnosisSummary('partial', {
      coverage: {
        pricedTokens: 8_000,
        unpricedTokens: 3_000,
        totalTokens: 11_000,
        percentage: 72.7272727273,
        unpricedModelIds: ['unknown-model'],
      },
      pricedCostUsd: 0.75,
      pricedCostPercentile: undefined,
    });
```

- [ ] **Step 2: 写入筛选和稳定排序失败测试**

```ts
it('filters attention, cause, severity and confidence together', () => {
  const summaries = [
    makeDiagnosisSummary('critical-input', {
      requiresAttention: true,
      primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
    }),
    makeDiagnosisSummary('warning-cache', {
      requiresAttention: true,
      primaryFinding: makeFindingSummary('cache-degradation', 'warning', 'medium'),
    }),
    makeDiagnosisSummary('normal', { requiresAttention: false }),
  ];

  expect(
    filterSessionDiagnosisSummaries({
      summaries,
      scope: 'attention',
      cause: 'input-growth',
      severity: 'critical',
      confidence: 'high',
    }).map(({ sessionId }) => sessionId)
  ).toEqual(['critical-input']);
});

it('keeps all sessions available in all scope', () => {
  expect(
    filterSessionDiagnosisSummaries({
      summaries: makeDiagnosisSummaries(),
      scope: 'all',
      cause: 'all',
      severity: 'all',
      confidence: 'all',
    })
  ).toHaveLength(makeDiagnosisSummaries().length);
});

it('sorts by attention, severity, impact, newest start and stable id', () => {
  const summaries = [
    makeDiagnosisSummary('normal', {
      requiresAttention: false,
      primaryFinding: undefined,
      impactPercentile: 1,
    }),
    makeDiagnosisSummary('warning', {
      primaryFinding: makeFindingSummary(
        'cache-degradation',
        'warning',
        'medium'
      ),
      impactPercentile: 1,
    }),
    makeDiagnosisSummary('critical-old', {
      diagnosisId: 'b',
      primaryFinding: makeFindingSummary(
        'input-growth',
        'critical',
        'high'
      ),
      impactPercentile: 0.9,
      startedAt: '2026-07-23T10:00:00.000Z',
    }),
    makeDiagnosisSummary('critical-new-b', {
      diagnosisId: 'd',
      primaryFinding: makeFindingSummary(
        'input-growth',
        'critical',
        'high'
      ),
      impactPercentile: 0.9,
      startedAt: '2026-07-24T10:00:00.000Z',
    }),
    makeDiagnosisSummary('critical-new-a', {
      diagnosisId: 'c',
      primaryFinding: makeFindingSummary(
        'input-growth',
        'critical',
        'high'
      ),
      impactPercentile: 0.9,
      startedAt: '2026-07-24T10:00:00.000Z',
    }),
  ];

  expect(
    filterSessionDiagnosisSummaries({
      summaries,
      scope: 'all',
      cause: 'all',
      severity: 'all',
      confidence: 'all',
    }).map(({ sessionId }) => sessionId)
  ).toEqual([
    'critical-new-a',
    'critical-new-b',
    'critical-old',
    'warning',
    'normal',
  ]);
});
```

- [ ] **Step 3: 写入列表和空状态失败测试**

```tsx
it('renders diagnosis evidence without claiming unpriced cost is complete', () => {
  const markup = renderWithI18n(
    <SessionDiagnosisList
      summaries={[makePartiallyPricedDiagnosisSummary()]}
      filters={DEFAULT_DIAGNOSIS_FILTERS}
      onFiltersChange={vi.fn()}
      onOpen={vi.fn()}
    />
  );

  expect(markup).toContain('Priced cost');
  expect(markup).toContain('Pricing coverage');
  expect(markup).toContain('Input footprint growth');
  expect(markup).toContain('type="button"');
});

it('renders the relative baseline scope and sample count when available', () => {
  const markup = renderWithI18n(
    <SessionDiagnosisList
      summaries={[
        makeDiagnosisSummary('baseline', {
          primaryFinding: makeFindingSummary(
            'input-growth',
            'warning',
            'high',
            {
              scope: 'project-model',
              sampleCount: 7,
              median: 4_000,
              mad: 500,
              score: 3,
            }
          ),
        }),
      ]}
      filters={DEFAULT_DIAGNOSIS_FILTERS}
      onFiltersChange={vi.fn()}
      onOpen={vi.fn()}
    />
  );

  expect(markup).toContain('3.0 robust deviations above baseline');
  expect(markup).toContain('Project and model · 7 samples');
});

it('renders a successful no-attention state with show-all action', () => {
  const markup = renderWithI18n(
    <SessionDiagnosisList
      summaries={[makeDiagnosisSummary('normal', { requiresAttention: false })]}
      filters={DEFAULT_DIAGNOSIS_FILTERS}
      onFiltersChange={vi.fn()}
      onOpen={vi.fn()}
    />
  );
  expect(markup).toContain('No high-impact sessions in this range');
  expect(markup).toContain('Show all sessions');
});
```

- [ ] **Step 4: 运行测试并确认失败**

```powershell
npm test -- tests/sessionDiagnosisFilters.test.tsx tests/sessionDiagnosisList.test.tsx tests/i18n.test.ts
```

Expected: FAIL，提示筛选模块、组件或翻译 key 不存在。

- [ ] **Step 5: 实现纯筛选状态**

```ts
export interface SessionDiagnosisFilters {
  scope: 'attention' | 'all';
  cause: SessionDiagnosisCause | 'all';
  severity: SessionDiagnosisSeverity | 'all';
  confidence: SessionDiagnosisConfidence | 'all';
}

export const DEFAULT_DIAGNOSIS_FILTERS: SessionDiagnosisFilters = {
  scope: 'attention',
  cause: 'all',
  severity: 'all',
  confidence: 'all',
};

export interface FilterSessionDiagnosisSummariesInput
  extends SessionDiagnosisFilters {
  summaries: SessionDiagnosisSummary[];
}

const SEVERITY_RANK: Record<SessionDiagnosisSeverity, number> = {
  warning: 1,
  critical: 2,
};

const getStartedAtTime = (summary: SessionDiagnosisSummary): number => {
  const value = new Date(summary.startedAt).getTime();
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
};

export const filterSessionDiagnosisSummaries = ({
  summaries,
  scope,
  cause,
  severity,
  confidence,
}: FilterSessionDiagnosisSummariesInput): SessionDiagnosisSummary[] =>
  summaries
    .filter(
      (summary) =>
        (scope === 'all' || summary.requiresAttention) &&
        (cause === 'all' || summary.primaryFinding?.cause === cause) &&
        (severity === 'all' ||
          summary.primaryFinding?.severity === severity) &&
        (confidence === 'all' ||
          summary.primaryFinding?.confidence === confidence)
    )
    .sort(
      (first, second) =>
        Number(second.requiresAttention) - Number(first.requiresAttention) ||
        (second.primaryFinding
          ? SEVERITY_RANK[second.primaryFinding.severity]
          : 0) -
          (first.primaryFinding
            ? SEVERITY_RANK[first.primaryFinding.severity]
            : 0) ||
        second.impactPercentile - first.impactPercentile ||
        getStartedAtTime(second) - getStartedAtTime(first) ||
        first.diagnosisId.localeCompare(second.diagnosisId)
    );
```

筛选返回新数组，不修改输入。

- [ ] **Step 6: 实现列表组件和双语文案**

组件使用受控 `filters`，所有 `<select>` 都有可见 `<label>`。会话行使用原生 `<button>`，并按以下顺序显示：会话名称或短 ID、项目、开始时间、Token 总量、已计价费用、coverage、主要 finding 的稳健偏差/基线范围/样本数、主要原因、其他发现数量、严重程度和置信度。没有 `primaryFinding.baseline` 时显示“历史基线不可用”，不得从百分位伪造倍数；无主要原因时显示“未能从现有元数据定位原因”。coverage 为 100% 时可显示“完整费用估算”，否则只显示 `pricedCostUsd` 和 coverage。

会话显示名使用具名常量，不硬编码切片长度：

```ts
const SHORT_SESSION_ID_LENGTH = 8;
const getSessionDisplayName = (summary: SessionDiagnosisSummary): string =>
  summary.threadName?.trim() ||
  summary.sessionId.slice(0, SHORT_SESSION_ID_LENGTH);
```

按钮的 `aria-label` 使用完整显示名；短 ID 只作为无 thread name 时的可见回退。

在 `costOptimization` namespace 增加以下完整 key；英文与简体中文结构必须完全一致：

```ts
// en.ts
tabs: {
  diagnostics: 'Session diagnostics',
},
diagnostics: {
  list: {
    title: 'Session diagnostics',
    description: 'High-impact sessions ranked from local usage metadata.',
    session: 'Session',
    project: 'Project',
    startedAt: 'Started',
    totalTokens: 'Total tokens',
    pricedCost: 'Priced cost',
    fullEstimatedCost: 'Full estimated cost',
    pricingCoverage: 'Pricing coverage',
    relativeBaseline: 'Relative baseline',
    primaryCause: 'Primary cause',
    otherFindings: 'Other findings',
    severity: 'Severity',
    confidence: 'Confidence',
    open: 'Open diagnosis for {{session}}',
  },
  scope: {
    label: 'Session scope',
    attention: 'Needs attention',
    all: 'All sessions',
  },
  cause: {
    label: 'Primary cause',
    all: 'All causes',
    inputGrowth: 'Input footprint growth',
    cacheDegradation: 'Cache reuse signal declined',
    generationConcentration: 'Output or reasoning concentration',
    modelCostDominance: 'Model cost dominance',
    interactionAccumulation: 'Accumulated usage events',
  },
  severity: {
    label: 'Severity',
    all: 'All severities',
    warning: 'Warning',
    critical: 'Critical',
  },
  confidence: {
    label: 'Confidence',
    all: 'All confidence levels',
    low: 'Low confidence',
    medium: 'Medium confidence',
    high: 'High confidence',
  },
  baseline: {
    unavailable: 'Historical baseline unavailable',
    deviation: '{{score}} robust deviations above baseline',
    scopeSamples: '{{scope}} · {{count}} samples',
    scope: {
      session: 'Session history',
      projectModel: 'Project and model',
      model: 'Model',
      project: 'Project',
      global: 'Global',
    },
  },
  state: {
    noAttentionTitle: 'No high-impact sessions in this range',
    noAttentionDescription:
      'No session currently meets the attention threshold.',
    showAll: 'Show all sessions',
    unresolved: 'Could not identify a cause from available metadata',
  },
  sessions: {
    open: 'Open diagnosis: {{cause}}',
  },
  additionalFindings_one: '{{count}} other finding',
  additionalFindings_other: '{{count}} other findings',
},
```

```ts
// zhCN.ts
tabs: {
  diagnostics: '会话诊断',
},
diagnostics: {
  list: {
    title: '会话诊断',
    description: '根据本地用量元数据排列高影响会话。',
    session: '会话',
    project: '项目',
    startedAt: '开始时间',
    totalTokens: 'Token 总量',
    pricedCost: '已计价费用',
    fullEstimatedCost: '完整费用估算',
    pricingCoverage: '定价覆盖率',
    relativeBaseline: '相对基线',
    primaryCause: '主要原因',
    otherFindings: '其他发现',
    severity: '严重程度',
    confidence: '置信度',
    open: '打开 {{session}} 的诊断',
  },
  scope: {
    label: '会话范围',
    attention: '需要关注',
    all: '全部会话',
  },
  cause: {
    label: '主要原因',
    all: '全部原因',
    inputGrowth: '输入 Token 足迹放大',
    cacheDegradation: '缓存复用信号下降',
    generationConcentration: '输出或推理占比集中',
    modelCostDominance: '模型成本主导',
    interactionAccumulation: '用量事件累积',
  },
  severity: {
    label: '严重程度',
    all: '全部严重程度',
    warning: '警告',
    critical: '严重',
  },
  confidence: {
    label: '置信度',
    all: '全部置信度',
    low: '低置信度',
    medium: '中置信度',
    high: '高置信度',
  },
  baseline: {
    unavailable: '历史基线不可用',
    deviation: '高于基线 {{score}} 个稳健偏差',
    scopeSamples: '{{scope}} · {{count}} 个样本',
    scope: {
      session: '会话历史',
      projectModel: '同项目同模型',
      model: '同模型',
      project: '同项目',
      global: '全局',
    },
  },
  state: {
    noAttentionTitle: '此范围内没有高影响会话',
    noAttentionDescription: '当前没有会话达到关注阈值。',
    showAll: '查看全部会话',
    unresolved: '未能从现有元数据定位原因',
  },
  sessions: {
    open: '打开诊断：{{cause}}',
  },
  additionalFindings_one: '其他 {{count}} 项发现',
  additionalFindings_other: '其他 {{count}} 项发现',
},
```

- [ ] **Step 7: 增加列表和移动端样式**

在 `styles.css` 新增 `.session-diagnosis-*` 前缀样式。严重程度同时显示文字标签和图标；窄屏隐藏表头并把每行重排为卡片式按钮，不制造横向页面滚动。

- [ ] **Step 8: 运行列表、i18n 和 lint**

```powershell
npm test -- tests/sessionDiagnosisFilters.test.tsx tests/sessionDiagnosisList.test.tsx tests/i18n.test.ts
npm run typecheck
npm run lint
```

Expected: PASS。

- [ ] **Step 9: 提交任务**

```powershell
git add src/renderer/utils/sessionDiagnosisFilters.ts src/renderer/components/SessionDiagnosisList.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles.css tests/sessionDiagnosisFilters.test.tsx tests/sessionDiagnosisList.test.tsx tests/i18n.test.ts
git commit -m "feat: add session diagnosis list"
```

---

### Task 8: 实现原因优先详情和分轨时间线

**Files:**

- Create: `src/renderer/components/SessionDiagnosisTimeline.tsx`
- Create: `src/renderer/components/SessionDiagnosisDetail.tsx`
- Create: `tests/sessionDiagnosisTimeline.test.tsx`
- Create: `tests/sessionDiagnosisDetail.test.tsx`
- Modify: `src/shared/i18n/locales/en.ts`
- Modify: `src/shared/i18n/locales/zhCN.ts`
- Modify: `src/renderer/styles.css`
- Modify: `tests/i18n.test.ts`

**Interfaces:**

- Produces: `<SessionDiagnosisTimeline points invalidPointCount />`
- Produces: `<SessionDiagnosisDetail detail onBack />`
- Produces: `buildSessionDiagnosisTimelineGeometry(points, width, height)`

- [ ] **Step 1: 扩展详情测试 fixture**

在 `tests/helpers/sessionDiagnosisFixtures.ts` 增加：

```ts
export const makeDiagnosisTimelinePoints =
  (): SessionDiagnosisTimelinePoint[] => [
    {
      contributionId: 'first',
      occurredAt: '2026-07-24T10:00:00.000Z',
      modelId: 'gpt-source',
      inputTokens: 4_000,
      cachedInputTokens: 2_000,
      outputTokens: 500,
      reasoningOutputTokens: 100,
      totalTokens: 4_500,
    },
    {
      contributionId: 'second',
      occurredAt: '2026-07-24T10:10:00.000Z',
      modelId: 'gpt-target',
      inputTokens: 16_000,
      cachedInputTokens: 1_000,
      outputTokens: 2_000,
      reasoningOutputTokens: 800,
      totalTokens: 18_000,
    },
  ];

export const makeDiagnosisDetail = (): SessionDiagnosisDetail => ({
  summary: makeDiagnosisSummary('detail', {
    additionalFindingCount: 1,
  }),
  detectors: [
    {
      state: 'finding',
      cause: 'input-growth',
      severity: 'critical',
      confidence: 'high',
      normalizedScore: 1,
      evidence: {
        kind: 'input-growth',
        earlyMedianTokens: 4_000,
        lateMedianTokens: 16_000,
        growthRatio: 4,
        absoluteGrowthTokens: 12_000,
      },
    },
    {
      state: 'not-found',
      cause: 'cache-degradation',
      reason: 'within-normal-range',
    },
    {
      state: 'insufficient-data',
      cause: 'generation-concentration',
      reason: 'insufficient-history',
    },
    {
      state: 'not-applicable',
      cause: 'model-cost-dominance',
      reason: 'pricing-incomplete',
    },
    {
      state: 'finding',
      cause: 'interaction-accumulation',
      severity: 'warning',
      confidence: 'medium',
      normalizedScore: 0.5,
      evidence: {
        kind: 'interaction-accumulation',
        eventCount: 23,
        durationMs: 5_400_000,
        maxSliceShare: 0.2,
      },
    },
  ],
  timeline: makeDiagnosisTimelinePoints(),
  invalidTimelinePointCount: 0,
});

export const makeReadyDiagnosisResult = (
  diagnosisId = 'detail.jsonl\u001fdetail'
): SessionDiagnosisDetailResult => {
  const detail = makeDiagnosisDetail();
  return {
    kind: 'ready',
    detail: {
      ...detail,
      summary: { ...detail.summary, diagnosisId },
    },
  };
};
```

- [ ] **Step 2: 写入时间线量纲和键盘语义失败测试**

```tsx
it('renders separate token and cache lanes on one time axis', () => {
  const markup = renderWithI18n(
    <SessionDiagnosisTimeline
      points={makeDiagnosisTimelinePoints()}
      invalidPointCount={1}
    />
  );

  expect(markup).toContain('aria-label="Token usage timeline"');
  expect(markup).toContain('data-lane="tokens"');
  expect(markup).toContain('data-series="input"');
  expect(markup).toContain('data-series="output"');
  expect(markup).toContain('data-series="reasoning"');
  expect(markup).toContain('data-lane="cache-rate"');
  expect(markup).toContain('tabindex="0"');
  expect(markup).toContain('1 invalid time point omitted');
});

it.each([
  { name: 'empty', points: [] },
  { name: 'single', points: makeDiagnosisTimelinePoints().slice(0, 1) },
  {
    name: 'same timestamp',
    points: makeDiagnosisTimelinePoints().map((point) => ({
      ...point,
      occurredAt: '2026-07-24T10:00:00.000Z',
    })),
  },
])('produces finite geometry for $name data', ({ points }) => {
  const geometry = buildSessionDiagnosisTimelineGeometry(points, 640, 220);
  const coordinates = geometry.points.flatMap(
    ({ x, inputY, outputY, reasoningY, cacheY }) => [
      x,
      inputY,
      outputY,
      reasoningY,
      cacheY,
    ]
  );
  expect(coordinates.every(Number.isFinite)).toBe(true);
});
```

- [ ] **Step 3: 写入原因优先详情失败测试**

```tsx
it('renders the primary reason before timeline and all detector states', () => {
  const markup = renderWithI18n(
    <SessionDiagnosisDetail detail={makeDiagnosisDetail()} onBack={vi.fn()} />
  );

  expect(markup.indexOf('Primary cause')).toBeLessThan(
    markup.indexOf('Evidence timeline')
  );
  expect(markup).toContain('Input footprint growth');
  expect(markup).toContain('Not detected');
  expect(markup).toContain('Insufficient data');
  expect(markup).toContain('Not applicable');
  expect(markup).toContain('Back to diagnosis list');
});
```

增加降级和中文渲染用例：

```tsx
it('renders unresolved and partial-pricing evidence without a full-cost claim', () => {
  const detail = makeDiagnosisDetail();
  const unresolved: SessionDiagnosisDetail = {
    ...detail,
    summary: {
      ...makePartiallyPricedDiagnosisSummary(),
      primaryFinding: undefined,
    },
    detectors: detail.detectors.map((result) =>
      result.state === 'finding'
        ? {
            state: 'insufficient-data',
            cause: result.cause,
            reason: 'insufficient-history',
          }
        : result
    ),
  };
  const markup = renderWithI18n(
    <SessionDiagnosisDetail detail={unresolved} onBack={vi.fn()} />
  );
  expect(markup).toContain('Could not identify a cause from available metadata');
  expect(markup).toContain('unknown-model');
  expect(markup).toContain('Priced cost');
  expect(markup).not.toContain('Full estimated cost');
});

it('renders baseline samples, omitted points and Chinese state copy', () => {
  const detail = makeDiagnosisDetail();
  const primary = detail.detectors[0];
  if (primary.state !== 'finding') {
    throw new Error('Expected a finding fixture.');
  }
  const markup = renderWithI18n(
    <SessionDiagnosisDetail
      detail={{
        ...detail,
        invalidTimelinePointCount: 1,
        detectors: [
          {
            ...primary,
            baseline: {
              scope: 'project-model',
              sampleCount: 7,
              median: 1,
              mad: 0,
              score: 8,
            },
          },
          ...detail.detectors.slice(1),
        ],
      }}
      onBack={vi.fn()}
    />,
    'zh-CN'
  );
  expect(markup).toContain('7');
  expect(markup).toContain('1');
  expect(markup).toContain('数据不足');
});
```

- [ ] **Step 4: 运行测试并确认失败**

```powershell
npm test -- tests/sessionDiagnosisTimeline.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/i18n.test.ts
```

Expected: FAIL，提示详情和时间线组件不存在。

- [ ] **Step 5: 实现分轨时间线**

使用现有 SVG 方式，不引入依赖。Token 轨道分别绘制输入、输出和推理三条序列，缓存率使用独立纵轴；四条序列共享 x 时间轴。数据点使用：

```tsx
const TOKEN_LANE_SHARE = 0.72;
const POINT_RADIUS = 4;

export interface SessionDiagnosisTimelineGeometry {
  points: Array<{
    point: SessionDiagnosisTimelinePoint;
    x: number;
    inputY: number;
    outputY: number;
    reasoningY: number;
    cacheY: number;
  }>;
  tokenLaneHeight: number;
  cacheLaneHeight: number;
}

export const buildSessionDiagnosisTimelineGeometry = (
  points: SessionDiagnosisTimelinePoint[],
  width: number,
  height: number
): SessionDiagnosisTimelineGeometry => {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const tokenLaneHeight = safeHeight * TOKEN_LANE_SHARE;
  const cacheLaneHeight = safeHeight - tokenLaneHeight;
  const timestamps = points.map(({ occurredAt }) => new Date(occurredAt).getTime());
  const minTime = timestamps.length > 0 ? Math.min(...timestamps) : 0;
  const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : minTime;
  const timeSpan = Math.max(maxTime - minTime, 1);
  const maxTokens = Math.max(
    1,
    ...points.flatMap(
      ({ inputTokens, outputTokens, reasoningOutputTokens }) => [
        inputTokens,
        outputTokens,
        reasoningOutputTokens,
      ]
    )
  );
  const toTokenY = (tokens: number): number =>
    tokenLaneHeight - (Math.max(tokens, 0) / maxTokens) * tokenLaneHeight;
  return {
    points: points.map((point, index) => {
      const boundedCached = Math.min(
        Math.max(point.cachedInputTokens, 0),
        point.inputTokens
      );
      const cacheRate =
        point.inputTokens > 0 ? boundedCached / point.inputTokens : 0;
      return {
        point,
        x: ((timestamps[index] - minTime) / timeSpan) * safeWidth,
        inputY: toTokenY(point.inputTokens),
        outputY: toTokenY(point.outputTokens),
        reasoningY: toTokenY(point.reasoningOutputTokens),
        cacheY:
          tokenLaneHeight +
          (1 - cacheRate) * cacheLaneHeight,
      };
    }),
    tokenLaneHeight,
    cacheLaneHeight,
  };
};

type TokenSeries = 'input' | 'output' | 'reasoning';
type TimelineGeometryPoint = SessionDiagnosisTimelineGeometry['points'][number];

const getSeriesTokens = (
  series: TokenSeries,
  point: SessionDiagnosisTimelinePoint
): number => {
  switch (series) {
    case 'input':
      return point.inputTokens;
    case 'output':
      return point.outputTokens;
    case 'reasoning':
      return point.reasoningOutputTokens;
  }
};

const getSeriesY = (
  series: TokenSeries,
  point: TimelineGeometryPoint
): number => {
  switch (series) {
    case 'input':
      return point.inputY;
    case 'output':
      return point.outputY;
    case 'reasoning':
      return point.reasoningY;
  }
};

const renderTokenSeries = (
  series: TokenSeries,
  points: TimelineGeometryPoint[],
  getPointLabel: (
    series: TokenSeries,
    point: SessionDiagnosisTimelinePoint
  ) => string
): React.ReactNode => (
  <g data-series={series}>
    {points.map((geometryPoint) => (
      <circle
        key={`${series}:${geometryPoint.point.contributionId}`}
        tabIndex={0}
        aria-label={getPointLabel(series, geometryPoint.point)}
        cx={geometryPoint.x}
        cy={getSeriesY(series, geometryPoint)}
        r={POINT_RADIUS}
      />
    ))}
  </g>
);

const getPointLabel = (
  series: TokenSeries,
  point: SessionDiagnosisTimelinePoint
): string =>
  t('diagnostics.timeline.tokenPointLabel', {
    series: t(`diagnostics.timeline.series.${series}`),
    value: formatNumber(getSeriesTokens(series, point), locale),
    time: formatShortDateTime(
      point.occurredAt,
      locale,
      tCommon('value.unknownDate')
    ),
  });

<g data-lane="tokens">
  {(['input', 'output', 'reasoning'] as const).map((series) =>
    renderTokenSeries(series, geometry.points, getPointLabel)
  )}
</g>
```

不把三个 Token 类型相加后画成单线。缓存率组使用 `data-lane="cache-rate"`。模型切换点同时显示竖线、文字和可访问标签。hover 与 `:focus-visible` 展示相同 tooltip 内容。

geometry 内缓存率保持 `[0, 1]`，传给现有 `formatPercent` 前乘以 100；Token、日期和时间分别使用 `formatNumber` 与 `formatShortDateTime`。

- [ ] **Step 6: 实现原因优先详情**

详情顺序严格为：

1. 返回按钮和会话身份。
2. Token、已计价费用、coverage、相对基线、事件数。
3. primary finding 与三个关键证据。
4. `SessionDiagnosisTimeline`。
5. 其他 findings。
6. 五个 detector result。

`state` 映射为 finding、not-found、insufficient-data、not-applicable 的双语文字。不要把 unavailable result 过滤掉。

主要 finding 必须从完整 detector result 中按 cause 找回，不能把摘要当成完整证据：

```ts
const primaryFinding =
  detail.summary.primaryFinding === undefined
    ? undefined
    : detail.detectors.find(
        (result): result is SessionDiagnosisFinding =>
          result.state === 'finding' &&
          result.cause === detail.summary.primaryFinding?.cause
      );
const otherFindings = detail.detectors.filter(
  (result): result is SessionDiagnosisFinding =>
    result.state === 'finding' && result.cause !== primaryFinding?.cause
);
```

首屏恰好选择三项关键证据：

- input-growth：前段输入中位数、后段输入中位数、增长倍数（绝对增长放入完整检测器卡片）。
- cache-reuse：当前缓存率、目标缓存率、前后半段缓存率差。
- generation-share：输出占比、推理占比、subtype。
- model-cost：模型 ID、费用占比、有效单位成本倍数；存在模型切换时用“切换前 → 切换后”替换模型 ID。
- interaction-accumulation：用量事件数、持续时间（不可用时显示状态文字）、最大切片占比。

每项证据都使用 evidence `kind` 的穷尽 `switch`，并在组件文件内定义：

```ts
const assertNever = (value: never): never => {
  throw new Error(`Unhandled session diagnosis evidence: ${JSON.stringify(value)}`);
};
```

switch 的 default 分支返回 `assertNever(evidence)`，使新增 evidence 类型触发编译错误；不得使用 `any` 或静默忽略新增类型。

只要五个结果中存在 `model-cost-dominance` finding，就在对应卡片显示 `diagnostics.detail.modelCostDisclaimer`；不得生成“应替换模型”文案或自动操作。

- [ ] **Step 7: 增加详情文案和响应式样式**

在 Task 7 的 `diagnostics` 对象中合并以下完整双语 key：

```ts
// en.ts
detail: {
  title: 'Session diagnosis',
  back: 'Back to diagnosis list',
  loading: 'Loading session diagnosis…',
  unavailable: 'Session diagnosis unavailable',
  notFound: 'This session is no longer in the current usage data.',
  stale: 'Showing the last successful diagnosis. {{reason}}',
  metrics: 'Session metrics',
  primaryCause: 'Primary cause',
  evidenceTimeline: 'Evidence timeline',
  otherFindings: 'Other findings',
  detectorResults: 'All detector results',
  eventCount: 'Usage events',
  modelCostDisclaimer:
    'Cost composition does not imply equivalent model quality, speed, or capability.',
  invalidTimelinePoints_one: '{{count}} invalid time point omitted',
  invalidTimelinePoints_other: '{{count}} invalid time points omitted',
},
detectorState: {
  finding: 'Finding',
  notFound: 'Not detected',
  insufficientData: 'Insufficient data',
  notApplicable: 'Not applicable',
},
unavailableReason: {
  withinNormalRange: 'The available signal is within the normal range.',
  insufficientHistory: 'There is not enough prior history for this comparison.',
  insufficientSlices: 'There are not enough valid usage slices.',
  pricingIncomplete: 'Model pricing is incomplete.',
  zeroInput: 'No input tokens are available for cache analysis.',
  zeroTotal: 'No total tokens are available for this calculation.',
  invalidTimeRange: 'The session time range is invalid.',
},
evidence: {
  earlyInput: 'Early input median',
  lateInput: 'Late input median',
  inputGrowthRatio: 'Input growth ratio',
  absoluteInputGrowth: 'Absolute input growth',
  currentCacheRate: 'Current cache rate',
  firstHalfCacheRate: 'First-half cache rate',
  secondHalfCacheRate: 'Second-half cache rate',
  targetCacheRate: 'Target cache rate',
  outputShare: 'Output share',
  reasoningShare: 'Reasoning share',
  generationSubtype: 'Affected token type',
  generationSubtypeValue: {
    output: 'Output',
    reasoning: 'Reasoning output',
    both: 'Output and reasoning output',
  },
  dominantModel: 'Cost-driving model',
  costShare: 'Cost share',
  unitCostRatio: 'Effective unit-cost ratio',
  modelSwitch: '{{from}} → {{to}}',
  switchedCostShare: 'Post-switch cost share',
  eventCount: 'Usage events',
  duration: 'Duration',
  maxSliceShare: 'Largest slice share',
  baselineSamples: 'Baseline samples',
  baselineScope: 'Baseline scope',
},
timeline: {
  ariaLabel: 'Token usage timeline',
  summary:
    'Input, output, reasoning, and cache-rate evidence on a shared time axis.',
  tokenLane: 'Token usage',
  cacheLane: 'Cache rate',
  series: {
    input: 'Input tokens',
    output: 'Output tokens',
    reasoning: 'Reasoning output tokens',
  },
  tokenPointLabel: '{{series}}, {{value}}, {{time}}',
  cachePointLabel: 'Cache rate {{value}}, {{time}}',
  modelSwitch: 'Model switched from {{from}} to {{to}}',
},
```

```ts
// zhCN.ts
detail: {
  title: '会话诊断',
  back: '返回诊断列表',
  loading: '正在加载会话诊断…',
  unavailable: '无法加载会话诊断',
  notFound: '此会话已不在当前用量数据中。',
  stale: '正在显示上次成功的诊断。{{reason}}',
  metrics: '会话指标',
  primaryCause: '主要原因',
  evidenceTimeline: '证据时间线',
  otherFindings: '其他发现',
  detectorResults: '全部检测器结果',
  eventCount: '用量事件',
  modelCostDisclaimer: '费用构成不表示模型质量、速度或能力等价。',
  invalidTimelinePoints_one: '已忽略 {{count}} 个无效时间点',
  invalidTimelinePoints_other: '已忽略 {{count}} 个无效时间点',
},
detectorState: {
  finding: '已发现',
  notFound: '未发现',
  insufficientData: '数据不足',
  notApplicable: '不适用',
},
unavailableReason: {
  withinNormalRange: '现有信号位于正常范围内。',
  insufficientHistory: '没有足够的历史样本用于比较。',
  insufficientSlices: '没有足够的有效用量切片。',
  pricingIncomplete: '模型定价不完整。',
  zeroInput: '没有可用于缓存分析的输入 Token。',
  zeroTotal: '没有可用于此项计算的总 Token。',
  invalidTimeRange: '会话时间范围无效。',
},
evidence: {
  earlyInput: '前段输入中位数',
  lateInput: '后段输入中位数',
  inputGrowthRatio: '输入增长倍数',
  absoluteInputGrowth: '输入绝对增长',
  currentCacheRate: '当前缓存率',
  firstHalfCacheRate: '前半段缓存率',
  secondHalfCacheRate: '后半段缓存率',
  targetCacheRate: '目标缓存率',
  outputShare: '输出占比',
  reasoningShare: '推理输出占比',
  generationSubtype: '受影响 Token 类型',
  generationSubtypeValue: {
    output: '输出',
    reasoning: '推理输出',
    both: '输出和推理输出',
  },
  dominantModel: '费用主导模型',
  costShare: '费用占比',
  unitCostRatio: '有效单位成本倍数',
  modelSwitch: '{{from}} → {{to}}',
  switchedCostShare: '切换后费用占比',
  eventCount: '用量事件',
  duration: '持续时间',
  maxSliceShare: '最大单切片占比',
  baselineSamples: '基线样本数',
  baselineScope: '基线范围',
},
timeline: {
  ariaLabel: 'Token 用量时间线',
  summary: '共享时间轴上的输入、输出、推理和缓存率证据。',
  tokenLane: 'Token 用量',
  cacheLane: '缓存率',
  series: {
    input: '输入 Token',
    output: '输出 Token',
    reasoning: '推理输出 Token',
  },
  tokenPointLabel: '{{series}}，{{value}}，{{time}}',
  cachePointLabel: '缓存率 {{value}}，{{time}}',
  modelSwitch: '模型从 {{from}} 切换为 {{to}}',
},
```

CSS 使用 `.session-diagnosis-detail-*` 与 `.session-diagnosis-timeline-*` 前缀；输入、输出、推理和缓存率使用不同线型/标记，并配合可见图例文字。所有证据数值继续调用现有 `formatNumber`、`formatPercent`、`formatUsd` 和 `formatShortDateTime`。

- [ ] **Step 8: 运行详情、i18n、类型和 lint**

```powershell
npm test -- tests/sessionDiagnosisTimeline.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/i18n.test.ts
npm run typecheck
npm run lint
```

Expected: PASS。

- [ ] **Step 9: 提交任务**

```powershell
git add src/renderer/components/SessionDiagnosisTimeline.tsx src/renderer/components/SessionDiagnosisDetail.tsx src/shared/i18n/locales/en.ts src/shared/i18n/locales/zhCN.ts src/renderer/styles.css tests/sessionDiagnosisTimeline.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/i18n.test.ts
git commit -m "feat: add session diagnosis detail"
```

---

### Task 9: 接通双查询、受控标签、详情状态和 Sessions 跨页面导航

**Files:**

- Create: `src/renderer/utils/sessionDiagnosisDetailState.ts`
- Create: `src/renderer/hooks/useSessionDiagnosisDetail.ts`
- Create: `src/renderer/components/SessionDiagnosticsView.tsx`
- Create: `tests/sessionDiagnosisDetailState.test.tsx`
- Create: `tests/sessionDiagnosticsView.test.tsx`
- Modify: `src/renderer/hooks/useCostOptimizationSnapshot.ts`
- Modify: `src/renderer/utils/costOptimizationSnapshotState.ts`
- Modify: `src/shared/costOptimizationTypes.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/AppContent.tsx`
- Modify: `src/renderer/components/CostOptimizationView.tsx`
- Modify: `src/renderer/components/SessionsView.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/costOptimizationSnapshotState.test.tsx`
- Modify: `tests/appNavigation.test.tsx`
- Modify: `tests/costOptimizationView.test.tsx`
- Modify: `tests/appContent.test.tsx`

**Interfaces:**

- Produces: `resolveGlobalDiagnosisQuery(query): CostOptimizationQuery`
- Produces: `shouldRequestSeparateGlobalSnapshot(query): boolean`
- Produces: `useSessionDiagnosisDetail(query, diagnosisId, snapshot)`
- Produces: controlled cost tab and diagnosis navigation actions
- Consumes: list/detail components and `getSessionDiagnosis` preload API

`useSessionDiagnosisDetail` 和 workspace 使用同一个明确模型：

```ts
export type SessionDiagnosisDetailModel =
  | { kind: 'idle' }
  | { kind: 'loading'; diagnosisId: string }
  | { kind: 'error'; diagnosisId: string; message: string }
  | { kind: 'not-found'; diagnosisId: string }
  | {
      kind: 'ready';
      diagnosisId: string;
      detail: SessionDiagnosisDetail;
      isRefreshing: boolean;
      staleReason?: string;
    };

export interface SessionDiagnosisDetailState {
  requestId: number;
  model: SessionDiagnosisDetailModel;
}

export type SessionDiagnosisDetailAction =
  | { type: 'reset' }
  | { type: 'request-started'; requestId: number; diagnosisId: string }
  | {
      type: 'request-succeeded';
      requestId: number;
      result: SessionDiagnosisDetailResult;
    }
  | {
      type: 'request-failed';
      requestId: number;
      diagnosisId: string;
      message: string;
    };

export const createSessionDiagnosisDetailState =
  (): SessionDiagnosisDetailState => ({
    requestId: 0,
    model: { kind: 'idle' },
  });

export interface SessionDiagnosticsViewProps {
  summaries: SessionDiagnosisSummary[];
  diagnosisId: string | null;
  diagnosisDetailModel: SessionDiagnosisDetailModel;
  onDiagnosisOpen: (summary: SessionDiagnosisSummary) => void;
  onDiagnosisClose: () => void;
}
```

- [ ] **Step 1: 写入全局查询复用和详情竞态失败测试**

`tests/costOptimizationSnapshotState.test.tsx`：

```ts
it('reuses a global snapshot when the active query has no project filter', () => {
  expect(resolveGlobalDiagnosisQuery({ period: 'month' })).toEqual({
    period: 'month',
  });
  expect(shouldRequestSeparateGlobalSnapshot({ period: 'month' })).toBe(false);
  expect(
    shouldRequestSeparateGlobalSnapshot({
      period: 'month',
      projectPath: '',
    })
  ).toBe(false);
  expect(
    shouldRequestSeparateGlobalSnapshot({
      period: 'month',
      projectPath: 'C:\\repo',
    })
  ).toBe(true);
});
```

`tests/sessionDiagnosisDetailState.test.tsx`：

```ts
it('ignores an older detail response after a newer diagnosis starts', () => {
  const first = reduceSessionDiagnosisDetailState(
    createSessionDiagnosisDetailState(),
    { type: 'request-started', requestId: 1, diagnosisId: 'first' }
  );
  const second = reduceSessionDiagnosisDetailState(first, {
    type: 'request-started',
    requestId: 2,
    diagnosisId: 'second',
  });
  const stale = reduceSessionDiagnosisDetailState(second, {
    type: 'request-succeeded',
    requestId: 1,
    result: makeReadyDiagnosisResult('first'),
  });
  expect(stale).toBe(second);
});

it('retains the last ready detail when refreshing the same diagnosis fails', () => {
  const started = reduceSessionDiagnosisDetailState(
    createSessionDiagnosisDetailState(),
    { type: 'request-started', requestId: 1, diagnosisId: 'same' }
  );
  const ready = reduceSessionDiagnosisDetailState(started, {
    type: 'request-succeeded',
    requestId: 1,
    result: makeReadyDiagnosisResult('same'),
  });
  const refreshing = reduceSessionDiagnosisDetailState(ready, {
    type: 'request-started',
    requestId: 2,
    diagnosisId: 'same',
  });
  const retained = reduceSessionDiagnosisDetailState(refreshing, {
    type: 'request-failed',
    requestId: 2,
    diagnosisId: 'same',
    message: 'refresh failed',
  });

  expect(retained.model).toMatchObject({
    kind: 'ready',
    diagnosisId: 'same',
    isRefreshing: false,
    staleReason: 'refresh failed',
  });
});
```

- [ ] **Step 2: 写入导航 reducer 失败测试**

扩展 `AppNavigationState` 测试：

```ts
it('opens a diagnosis in the controlled cost optimization tab', () => {
  expect(
    reduceAppNavigationState(INITIAL_APP_NAVIGATION_STATE, {
      type: 'open-diagnosis',
      diagnosisId: 'source\u001fsession',
    })
  ).toEqual({
    activeView: 'costOptimization',
    selectedProjectPath: null,
    activeCostOptimizationTab: 'diagnostics',
    diagnosisId: 'source\u001fsession',
  });
});

it('closes detail without leaving the diagnostics tab', () => {
  const state: AppNavigationState = {
    activeView: 'costOptimization',
    selectedProjectPath: null,
    activeCostOptimizationTab: 'diagnostics',
    diagnosisId: 'source\u001fsession',
  };
  expect(reduceAppNavigationState(state, { type: 'close-diagnosis' }))
    .toMatchObject({
      activeView: 'costOptimization',
      activeCostOptimizationTab: 'diagnostics',
      diagnosisId: null,
    });
});
```

更新现有测试期望对象，显式包含 `activeCostOptimizationTab: 'overview'` 和 `diagnosisId: null`。

- [ ] **Step 3: 写入受控标签、列表/详情保留和 Sessions 徽标失败测试**

`tests/costOptimizationView.test.tsx` 增加：

```tsx
it('renders the controlled diagnostics tab and workspace', () => {
  const markup = renderWithI18n(
    <CostOptimizationView
      model={{ kind: 'ready', snapshot: SNAPSHOT }}
      projectOptions={['C:\\repo']}
      projectPath={undefined}
      activeTab="diagnostics"
      onActiveTabChange={vi.fn()}
      diagnosisId={null}
      diagnosisDetailModel={{ kind: 'idle' }}
      onDiagnosisOpen={vi.fn()}
      onDiagnosisClose={vi.fn()}
      onProjectPathChange={vi.fn()}
      onUpdateSettings={vi.fn()}
    />
  );
  expect(markup).toContain('Session diagnostics');
  expect(markup).toContain('aria-selected="true"');
});
```

`tests/sessionDiagnosticsView.test.tsx` 增加：

```tsx
it('keeps the filtered list mounted while a diagnosis detail is open', () => {
  const result = makeReadyDiagnosisResult();
  if (result.kind !== 'ready') {
    throw new Error('Expected a ready diagnosis fixture.');
  }
  const markup = renderWithI18n(
    <SessionDiagnosticsView
      summaries={makeDiagnosisSummaries()}
      diagnosisId="detail.jsonl\u001fdetail"
      diagnosisDetailModel={{
        kind: 'ready',
        diagnosisId: 'detail.jsonl\u001fdetail',
        detail: result.detail,
        isRefreshing: false,
        staleReason: 'refresh failed',
      }}
      onDiagnosisOpen={vi.fn()}
      onDiagnosisClose={vi.fn()}
    />
  );

  expect(markup).toContain('data-diagnosis-view="list"');
  expect(markup).toContain('data-diagnosis-view="detail"');
  expect(markup).toContain('hidden=""');
  expect(markup).toContain('Session scope');
  expect(markup).toContain('Evidence timeline');
  expect(markup).toContain('Showing the last successful diagnosis. refresh failed');
});

it('renders a typed disappeared-session state with a route back to the list', () => {
  const markup = renderWithI18n(
    <SessionDiagnosticsView
      summaries={makeDiagnosisSummaries()}
      diagnosisId="gone"
      diagnosisDetailModel={{ kind: 'not-found', diagnosisId: 'gone' }}
      onDiagnosisOpen={vi.fn()}
      onDiagnosisClose={vi.fn()}
    />
  );

  expect(markup).toContain('This session is no longer in the current usage data.');
  expect(markup).toContain('Back to diagnosis list');
});
```

`tests/appContent.test.tsx` 增加 Sessions 徽标断言：

```tsx
const markup = renderWithI18n(
  <AppContent
    activeView="sessions"
    model={{ kind: 'ready', result: RESULT, summary: SUMMARY }}
    onProjectSelect={vi.fn()}
    selectedProjectPath={null}
    onClearProjectFilter={vi.fn()}
    globalDiagnostics={[
      makeDiagnosisSummary('session-1', {
        sourceFile: 'session-1.jsonl',
      }),
    ]}
    onDiagnosisOpen={vi.fn()}
  />
);
expect(markup).toContain('Open diagnosis: Input footprint growth');
```

- [ ] **Step 4: 运行测试并确认失败**

```powershell
npm test -- tests/costOptimizationSnapshotState.test.tsx tests/sessionDiagnosisDetailState.test.tsx tests/sessionDiagnosticsView.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/appContent.test.tsx
```

Expected: FAIL，提示全局查询 helper、详情 reducer、导航字段和组件 props 不存在。

- [ ] **Step 5: 实现双快照和详情 Hook**

`resolveGlobalDiagnosisQuery` 只保留 period：

```ts
export const resolveGlobalDiagnosisQuery = (
  query: CostOptimizationQuery
): CostOptimizationQuery => ({ period: query.period });

export const shouldRequestSeparateGlobalSnapshot = (
  query: CostOptimizationQuery
): boolean => Boolean(query.projectPath?.trim());
```

`useCostOptimizationSnapshot` 在有项目筛选时发起第二个全局请求；无项目筛选时令 `globalSnapshot = snapshot`。两个 reducer 使用独立 request ID，push 只应用到匹配 query。

现有返回类型增加明确字段，避免 App 重新推导查询：

```ts
export interface UseCostOptimizationSnapshotResult {
  snapshot: CostOptimizationSnapshot | null;
  globalSnapshot: CostOptimizationSnapshot | null;
  query: CostOptimizationQuery;
  loading: boolean;
  error: string | null;
  projectPath: string | undefined;
  setProjectPath: (projectPath: string | undefined) => void;
  updateSettings: (
    settings: CostOptimizationSettings
  ) => Promise<CostOptimizationSnapshot>;
}
```

有项目筛选时 current/global 分别维护 reducer 和 request ID；没有项目筛选时不启动 global request/effect，直接复用同一个 snapshot 对象。`onUpdated` 的单个订阅按 `shouldApplyCostOptimizationPush` 分别投递到匹配的 reducer，不把项目快照写入全局状态。

`useSessionDiagnosisDetail` 以 `{ query.period, query.projectPath, diagnosisId, snapshot }` 为依赖。这里故意使用最近一次接受的快照对象作为刷新信号：成功扫描、价格变化或设置变化都会产生新快照并重新验证当前详情；来源删除后 IPC 因而返回 typed `not-found`。`diagnosisId === null` 或快照尚未 ready 时返回 idle 且不调用 IPC。

```ts
export const useSessionDiagnosisDetail = (
  query: CostOptimizationQuery,
  diagnosisId: string | null,
  snapshot: CostOptimizationSnapshot | undefined
): SessionDiagnosisDetailModel => {
  const [state, dispatch] = useReducer(
    reduceSessionDiagnosisDetailState,
    undefined,
    createSessionDiagnosisDetailState
  );
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (diagnosisId === null || snapshot === undefined) {
      dispatch({ type: 'reset' });
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    dispatch({ type: 'request-started', requestId, diagnosisId });
    void window.codexUsage.costOptimization
      .getSessionDiagnosis({
        query: {
          period: query.period,
          ...(query.projectPath ? { projectPath: query.projectPath } : {}),
        },
        diagnosisId,
      })
      .then((result) => {
        dispatch({ type: 'request-succeeded', requestId, result });
      })
      .catch((error: unknown) => {
        dispatch({
          type: 'request-failed',
          requestId,
          diagnosisId,
          message: error instanceof Error ? error.message : '',
        });
      });
  }, [diagnosisId, query.period, query.projectPath, snapshot]);

  return state.model;
};
```

reducer 在同一 diagnosis 已 ready 时将 `isRefreshing` 设为 `true` 并保留 detail；同一刷新失败时回到 ready、写入 `staleReason`。切换到不同 diagnosis 才进入 loading/error。所有 response 先比较 request ID，过期 response 原样返回旧 state。

- [ ] **Step 6: 实现受控导航和未知项目行为**

`AppNavigationState` 增加：

```ts
activeCostOptimizationTab: CostOptimizationTab;
diagnosisId: string | null;
```

同时把 `CostOptimizationTab` 扩展为：

```ts
export type CostOptimizationTab =
  | 'overview'
  | 'comparison'
  | 'anomalies'
  | 'forecast'
  | 'savings'
  | 'diagnostics';
```

增加 action：

```ts
| { type: 'select-cost-tab'; tab: CostOptimizationTab }
| { type: 'open-diagnosis'; diagnosisId: string }
| { type: 'close-diagnosis' }
```

从 Sessions 打开时先执行：

```ts
costOptimizationState.setProjectPath(summary.projectPath || undefined);
dispatchNavigation({
  type: 'open-diagnosis',
  diagnosisId: summary.diagnosisId,
});
```

空项目路径不能伪装成项目筛选；保持全局查询并通过稳定 diagnosis ID 打开详情。

- [ ] **Step 7: 组合诊断 workspace 并保持列表状态**

`SessionDiagnosticsView` 自己持有受控列表 filters。列表和详情容器同时保留在 DOM 中，通过原生 `hidden` 属性切换：

```tsx
const [filters, setFilters] = useState<SessionDiagnosisFilters>(
  DEFAULT_DIAGNOSIS_FILTERS
);
const [disappearedDiagnosisId, setDisappearedDiagnosisId] = useState<
  string | null
>(null);
const listContainerRef = useRef<HTMLDivElement>(null);
const listScrollTopRef = useRef(0);

const handleDiagnosisOpen = (summary: SessionDiagnosisSummary): void => {
  listScrollTopRef.current = listContainerRef.current?.scrollTop ?? 0;
  setDisappearedDiagnosisId(null);
  onDiagnosisOpen(summary);
};

useLayoutEffect(() => {
  if (diagnosisId === null && listContainerRef.current) {
    listContainerRef.current.scrollTop = listScrollTopRef.current;
  }
}, [diagnosisId]);

useEffect(() => {
  if (diagnosisDetailModel.kind !== 'not-found') {
    return;
  }
  setDisappearedDiagnosisId(diagnosisDetailModel.diagnosisId);
  onDiagnosisClose();
}, [diagnosisDetailModel, onDiagnosisClose]);

const renderDiagnosisDetailState = (
  model: SessionDiagnosisDetailModel,
  onBack: () => void,
  t: TFunction<'costOptimization'>
): React.ReactNode => {
  switch (model.kind) {
    case 'idle':
      return null;
    case 'loading':
      return <p>{t('diagnostics.detail.loading')}</p>;
    case 'error':
      return (
        <section role="alert">
          <h3>{t('diagnostics.detail.unavailable')}</h3>
          <p>{model.message}</p>
          <button type="button" onClick={onBack}>
            {t('diagnostics.detail.back')}
          </button>
        </section>
      );
    case 'not-found':
      return (
        <section>
          <h3>{t('diagnostics.detail.notFound')}</h3>
          <button type="button" onClick={onBack}>
            {t('diagnostics.detail.back')}
          </button>
        </section>
      );
    case 'ready':
      return (
        <>
          {model.isRefreshing ? (
            <p role="status">{t('diagnostics.detail.loading')}</p>
          ) : null}
          {model.staleReason ? (
            <p role="status">
              {t('diagnostics.detail.stale', {
                reason: model.staleReason,
              })}
            </p>
          ) : null}
          <SessionDiagnosisDetail detail={model.detail} onBack={onBack} />
        </>
      );
  }
};

<div
  ref={listContainerRef}
  className="session-diagnosis-workspace-list"
  data-diagnosis-view="list"
  hidden={diagnosisId !== null}
  tabIndex={0}
  aria-label={t('diagnostics.list.title')}
>
  {disappearedDiagnosisId ? (
    <p role="status">{t('diagnostics.detail.notFound')}</p>
  ) : null}
  <SessionDiagnosisList
    summaries={summaries}
    filters={filters}
    onFiltersChange={setFilters}
    onOpen={handleDiagnosisOpen}
  />
</div>
<div data-diagnosis-view="detail" hidden={diagnosisId === null}>
  {renderDiagnosisDetailState(
    diagnosisDetailModel,
    onDiagnosisClose,
    t
  )}
</div>
```

`.session-diagnosis-workspace-list` 是拥有 `overflow: auto` 的列表滚动容器；显式保存/恢复 `scrollTop`，不能依赖 window 滚动。filters 和列表 DOM 在返回时保留。typed `not-found` 触发 `onDiagnosisClose()` 返回列表，在列表顶部显示会话已消失说明，并且不自动选择其他会话；详情区中的返回按钮只覆盖 effect 执行前的短暂状态。

- [ ] **Step 8: 接入 CostOptimizationView、AppContent 和 Sessions 徽标**

`CostOptimizationView` 的 `activeTab` 与 `onActiveTabChange` 改为必需 props，删除本地 active tab state。`COST_OPTIMIZATION_TABS` 增加 diagnostics，并在 switch 中渲染 `SessionDiagnosticsView`。

```ts
interface CostOptimizationViewProps {
  model: CostOptimizationContentModel;
  projectOptions: string[];
  projectPath: string | null | undefined;
  activeTab: CostOptimizationTab;
  diagnosisId: string | null;
  diagnosisDetailModel: SessionDiagnosisDetailModel;
  onActiveTabChange: (tab: CostOptimizationTab) => void;
  onDiagnosisOpen: (summary: SessionDiagnosisSummary) => void;
  onDiagnosisClose: () => void;
  onProjectPathChange: (projectPath: string | undefined) => void;
  onUpdateSettings: (settings: CostOptimizationSettings) => Promise<unknown>;
}
```

`renderCostOptimizationTab` 的 diagnostics 分支传入 `snapshot.diagnostics` 和上述详情/导航 props；其他五个分支保持现有输入。

`SessionsView` 新增可选 `globalDiagnostics?: SessionDiagnosisSummary[]` 和 `onDiagnosisOpen?: (summary) => void`，默认分别为 `[]` 和空函数，以兼容现有直接组件测试。组件增加 `useTranslation('costOptimization')`，通过 `sourceFile` 建立诊断摘要 Map；只有存在 `primaryFinding` 时显示原生按钮徽标。可见文字使用对应原因翻译，`aria-label` 使用 `diagnostics.sessions.open`，点击调用 `onDiagnosisOpen(summary)`。

`App` 使用同一 current snapshot 驱动详情失效：

```ts
const diagnosisDetailModel = useSessionDiagnosisDetail(
  costOptimizationState.query,
  navigationState.diagnosisId,
  costOptimizationState.snapshot ?? undefined
);
const globalDiagnostics =
  costOptimizationState.globalSnapshot?.diagnostics ?? [];
```

`AppContent` 把 `globalDiagnostics` 只传给 Sessions；成本优化诊断列表始终使用 current snapshot 的 `diagnostics`，不得在 Renderer 合并两个查询结果。

为保持现有独立渲染测试，`AppContentProps` 的新增诊断字段保持可选并提供无副作用默认值：

```ts
costOptimizationTab?: CostOptimizationTab;
diagnosisId?: string | null;
diagnosisDetailModel?: SessionDiagnosisDetailModel;
globalDiagnostics?: SessionDiagnosisSummary[];
onCostOptimizationTabChange?: (tab: CostOptimizationTab) => void;
onDiagnosisOpen?: (summary: SessionDiagnosisSummary) => void;
onDiagnosisClose?: () => void;
```

默认值分别为 `'overview'`、`null`、`{ kind: 'idle' }`、`[]` 和 `() => undefined`；生产 `App` 必须全部传入真实状态与回调。

- [ ] **Step 9: 运行集成测试、完整相关测试和构建**

```powershell
npm test -- tests/costOptimizationSnapshotState.test.tsx tests/sessionDiagnosisDetailState.test.tsx tests/sessionDiagnosticsView.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/appContent.test.tsx tests/projectSessions.test.tsx
npm run typecheck
npm run lint
npm run build
```

Expected: PASS。

- [ ] **Step 10: 提交任务**

```powershell
git add src/renderer/utils/sessionDiagnosisDetailState.ts src/renderer/hooks/useSessionDiagnosisDetail.ts src/renderer/components/SessionDiagnosticsView.tsx src/renderer/hooks/useCostOptimizationSnapshot.ts src/renderer/utils/costOptimizationSnapshotState.ts src/shared/costOptimizationTypes.ts src/renderer/App.tsx src/renderer/components/AppContent.tsx src/renderer/components/CostOptimizationView.tsx src/renderer/components/SessionsView.tsx src/renderer/styles.css tests/sessionDiagnosisDetailState.test.tsx tests/sessionDiagnosticsView.test.tsx tests/costOptimizationSnapshotState.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/appContent.test.tsx
git commit -m "feat: connect session diagnosis navigation"
```

---

### Task 10: 更新产品文档并执行完整验收

**Files:**

- Modify: `README.md`
- Include: `docs/superpowers/specs/2026-07-30-session-cost-diagnosis-design.md`
- Include: `docs/superpowers/plans/2026-07-30-session-cost-diagnosis.md`

**Interfaces:**

- Verifies: 用户流程、隐私边界、定价降级、增量性能、双语和生产构建。

- [ ] **Step 1: 更新 README**

在核心功能和成本优化章节增加：

- “会话诊断”标签与五类原因。
- “需要关注 → 会话详情”的流程。
- 只分析元数据、不读取提示词和回复正文。
- finding、未发现、数据不足和不适用四种检测状态。
- 定价不足时继续保留 Token 诊断，但不生成完整费用或模型成本结论。
- 费用是本地估算，不代表 OpenAI 实际账单。

- [ ] **Step 2: 运行所有新增和直接受影响测试**

```powershell
npm test -- tests/costOptimizationIndex.test.ts tests/costOptimizationCacheStore.test.ts tests/pricing.test.ts tests/robustStatistics.test.ts tests/sessionDiagnosisCandidates.test.ts tests/sessionDiagnosisBaselines.test.ts tests/sessionDiagnosisInput.test.ts tests/sessionDiagnosisCache.test.ts tests/sessionDiagnosisGeneration.test.ts tests/sessionDiagnosisModelCost.test.ts tests/sessionDiagnosisAccumulation.test.ts tests/sessionDiagnosisEvaluation.test.ts tests/costOptimizationAnomalies.test.ts tests/costOptimizationEvaluation.test.ts tests/costOptimizationRuntime.test.ts tests/costOptimizationIpc.test.ts tests/sessionDiagnosisFilters.test.tsx tests/sessionDiagnosisDetailState.test.tsx tests/sessionDiagnosticsView.test.tsx tests/sessionDiagnosisList.test.tsx tests/sessionDiagnosisTimeline.test.tsx tests/sessionDiagnosisDetail.test.tsx tests/costOptimizationSnapshotState.test.tsx tests/appNavigation.test.tsx tests/costOptimizationView.test.tsx tests/appContent.test.tsx tests/i18n.test.ts
```

Expected: PASS。

- [ ] **Step 3: 运行完整项目验证**

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: 四条命令全部退出码为 0。若任一失败，停止文档提交，定位根因并在对应任务文件中补回归测试和修复，然后重新运行本步骤的四条命令。

- [ ] **Step 4: 检查变更边界和工作区**

```powershell
git diff --check
git status --short
git diff -- README.md docs/superpowers/specs/2026-07-30-session-cost-diagnosis-design.md docs/superpowers/plans/2026-07-30-session-cost-diagnosis.md
```

Expected:

- `git diff --check` 无输出。
- 没有 Codex 会话目录变更。
- 没有无关格式化或用户文件变更。
- README、设计文档和实施计划与已实现行为一致。

- [ ] **Step 5: 提交文档**

```powershell
git add README.md docs/superpowers/specs/2026-07-30-session-cost-diagnosis-design.md docs/superpowers/plans/2026-07-30-session-cost-diagnosis.md
git commit -m "docs: document session cost diagnosis"
```

- [ ] **Step 6: 最终提交审计**

```powershell
git status --short
git log -10 --oneline
```

Expected: 工作区不包含本计划遗留变更；最近提交按任务 1–10 展示单一职责的 Conventional Commits。不得 push、创建 Pull Request 或变基。
