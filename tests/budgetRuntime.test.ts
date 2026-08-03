import { describe, expect, it, vi } from 'vitest';
import {
  createBudgetRuntime,
  BudgetRuntimeValidationError,
  type BudgetRuntimeDependencies,
} from '../src/main/budgetRuntime';
import { DEFAULT_BUDGET_CONFIG, type BudgetStore } from '../src/main/budgetStore';
import type { ModelPricingEntry, PersistedBudgetConfig } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult, UsageSession } from '../src/shared/usageTypes';

const FIXED_NOW = new Date(2026, 6, 20, 12, 0);
const TEST_PRICING: ModelPricingEntry = {
  modelId: 'gpt-test',
  aliases: [],
  inputUsdPerMillion: 1,
  cachedInputUsdPerMillion: 0.1,
  outputUsdPerMillion: 5,
  effectiveAt: '2026-07-20',
  sourceKind: 'built-in',
};

describe('budget runtime', () => {
  it('persists a policy, reevaluates, and notifies only once per reached level', async () => {
    const notify = vi.fn();
    const dependencies = makeRuntimeDependencies({ notify });
    const runtime = createBudgetRuntime(dependencies);
    await runtime.initialize();
    await runtime.savePolicy({
      scope: 'global',
      period: 'day',
      modelTarget: { kind: 'all' },
      tokenLimit: 100,
    });
    await runtime.applyUsageResult(makeScanResult(150));
    await runtime.applyUsageResult(makeScanResult(150));

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toEqual(expect.objectContaining({ thresholdPercent: 100 }));
    expect(runtime.getSnapshot().statuses[0].token?.severity).toBe('over');
    expect(dependencies.store.save).toHaveBeenCalled();
  });

  it('keeps the last successful snapshot stale after a scan error', async () => {
    const dependencies = makeRuntimeDependencies();
    const runtime = createBudgetRuntime(dependencies);
    await runtime.initialize();
    await runtime.savePolicy({
      scope: 'global',
      period: 'day',
      modelTarget: { kind: 'all' },
      tokenLimit: 100,
    });
    await runtime.applyUsageResult(makeScanResult(150));

    runtime.markUsageStale(new Error('disk unavailable'));
    expect(runtime.getSnapshot()).toEqual(
      expect.objectContaining({
        dataState: 'stale',
        staleReason: 'disk unavailable',
      })
    );
    expect(runtime.getSnapshot().statuses[0].token?.used).toBe(150);
  });

  it('publishes updates and allows listeners to unsubscribe', async () => {
    const runtime = createBudgetRuntime(makeRuntimeDependencies());
    const listener = vi.fn();
    await runtime.initialize();
    const unsubscribe = runtime.subscribe(listener);

    await runtime.updateThresholds({ warningPercent: 70, criticalPercent: 95 });
    await runtime.applyUsageResult(makeScanResult(150));
    unsubscribe();
    await runtime.updateThresholds({ warningPercent: 75, criticalPercent: 95 });
    await runtime.applyUsageResult(makeScanResult(150));

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate scope, project, and period business keys', async () => {
    const runtime = createBudgetRuntime(makeRuntimeDependencies());
    await runtime.initialize();
    await runtime.savePolicy({
      scope: 'project',
      projectPath: 'C:\\repo',
      period: 'week',
      modelTarget: { kind: 'all' },
      tokenLimit: 1_000,
    });

    const duplicate = runtime.savePolicy({
      scope: 'project',
      projectPath: 'c:/REPO/',
      period: 'week',
      modelTarget: { kind: 'all' },
      costLimitUsd: 10,
    });

    await expect(duplicate).rejects.toBeInstanceOf(BudgetRuntimeValidationError);
    await expect(duplicate).rejects.toMatchObject({
      issues: [
        {
          field: 'businessKey',
          code: 'budget-duplicate',
        },
      ],
    });
  });
});

interface RuntimeDependencyOverrides {
  notify?: BudgetRuntimeDependencies['notify'];
}

const makeRuntimeDependencies = (
  overrides: RuntimeDependencyOverrides = {}
): BudgetRuntimeDependencies & {
  store: BudgetStore & { save: ReturnType<typeof vi.fn> };
} => {
  let config = cloneConfig(DEFAULT_BUDGET_CONFIG);
  const save = vi.fn(async (nextConfig: PersistedBudgetConfig) => {
    config = cloneConfig(nextConfig);
  });
  const store = {
    load: vi.fn(async () => ({ config: cloneConfig(config), warnings: [] })),
    save,
  };

  return {
    store,
    defaultPricing: [TEST_PRICING],
    notify: overrides.notify ?? vi.fn(),
    now: () => new Date(FIXED_NOW),
    createId: () => 'policy-generated',
  };
};

const makeScanResult = (totalTokens: number): UsageScanResult => {
  const timestamp = new Date(2026, 6, 20, 10, 0).toISOString();
  const session: UsageSession = {
    sessionId: 'runtime-session',
    startedAt: timestamp,
    endedAt: timestamp,
    projectPath: 'C:\\repo',
    projectName: 'repo',
    usageSlices: [
      {
        occurredAt: timestamp,
        modelId: 'gpt-test',
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
    sourceFile: 'runtime-session.jsonl',
    warnings: [],
  };

  return {
    sessionsDir: 'C:\\codex\\sessions',
    scannedAt: timestamp,
    summary: buildUsageSummary([session]),
    warnings: [],
  };
};

const cloneConfig = (config: PersistedBudgetConfig): PersistedBudgetConfig => ({
  ...config,
  thresholds: { ...config.thresholds },
  policies: config.policies.map((policy) => ({ ...policy })),
  pricingOverrides: config.pricingOverrides.map((override) => ({
    ...override,
    aliases: [...override.aliases],
  })),
  notificationReceipts: config.notificationReceipts.map((receipt) => ({ ...receipt })),
});
