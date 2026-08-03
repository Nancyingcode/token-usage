import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import AppContent from '../src/renderer/components/AppContent';
import type { AppContentModel } from '../src/renderer/utils/appContentModel';
import type { BudgetSnapshot } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult, UsageSession } from '../src/shared/usageTypes';
import { makeDiagnosisSummary } from './helpers/sessionDiagnosisFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

const SESSION: UsageSession = {
  sessionId: 'session-1',
  startedAt: '2026-07-19T08:00:00.000Z',
  endedAt: '2026-07-19T08:10:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  inputTokens: 10,
  cachedInputTokens: 2,
  outputTokens: 4,
  reasoningOutputTokens: 1,
  totalTokens: 15,
  eventCount: 1,
  sourceFile: 'session-1.jsonl',
  warnings: [],
};

const SUMMARY = buildUsageSummary([SESSION]);
const RESULT: UsageScanResult = {
  sessionsDir: 'C:\\Users\\tester\\.codex\\sessions',
  scannedAt: '2026-07-19T08:15:00.000Z',
  summary: SUMMARY,
  warnings: [],
};
const FRESHNESS = { refreshing: false, staleReason: null };

const makeBudgetSnapshot = (
  unknownModelPricing?: BudgetSnapshot['unknownModelPricing']
): BudgetSnapshot => ({
  generatedAt: '2026-08-03T00:00:00.000Z',
  dataState: 'fresh',
  thresholds: { warningPercent: 80, criticalPercent: 100 },
  statuses: [],
  alerts: [],
  summary: { warningCount: 0, overCount: 0, unpricedModelCount: 0 },
  pricing: [],
  ...(unknownModelPricing ? { unknownModelPricing } : {}),
  unpricedModels: [],
});

const STATE_CASES: Array<{ model: AppContentModel; expectedText: string }> = [
  { model: { kind: 'error', message: 'Disk unavailable' }, expectedText: 'Scan failed' },
  { model: { kind: 'loading' }, expectedText: 'Scanning local Codex sessions' },
  {
    model: { kind: 'empty', result: RESULT, freshness: FRESHNESS },
    expectedText: 'No Codex sessions found',
  },
  {
    model: { kind: 'period-empty', period: 'week', result: RESULT, freshness: FRESHNESS },
    expectedText: 'No sessions in this period',
  },
];

const renderAppContent = (model: AppContentModel): string =>
  renderWithI18n(
    <AppContent
      activeView="overview"
      period="month"
      model={model}
      onRefresh={vi.fn()}
      onProjectSelect={vi.fn()}
      selectedProjectPath={null}
      onClearProjectFilter={vi.fn()}
    />
  );

describe('AppContent', () => {
  it.each(STATE_CASES)('renders the $model.kind model', ({ model, expectedText }) => {
    const markup = renderWithI18n(
      <AppContent
        activeView="overview"
        period="month"
        model={model}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toContain(expectedText);
  });

  it('renders the selected page for a ready model', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="overview"
        period="month"
        model={{ kind: 'ready', result: RESULT, summary: SUMMARY, freshness: FRESHNESS }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toContain('Token Usage Trend');
  });

  it('updates the overview total cost after unknown-model fallback pricing is configured', () => {
    const sessionWithoutModelId: UsageSession = {
      ...SESSION,
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 1_000_000,
    };
    const summary = buildUsageSummary([sessionWithoutModelId]);
    const result = { ...RESULT, summary };
    const renderOverview = (snapshot: BudgetSnapshot): string =>
      renderWithI18n(
        <AppContent
          activeView="overview"
          period="month"
          model={{ kind: 'ready', result, summary, freshness: FRESHNESS }}
          onRefresh={vi.fn()}
          onProjectSelect={vi.fn()}
          selectedProjectPath={null}
          onClearProjectFilter={vi.fn()}
          budgetModel={{ kind: 'ready', snapshot }}
        />
      );

    const beforePricing = renderOverview(makeBudgetSnapshot());
    const afterPricing = renderOverview(
      makeBudgetSnapshot({
        inputUsdPerMillion: 2,
        cachedInputUsdPerMillion: 0.5,
        outputUsdPerMillion: 10,
        updatedAt: '2026-08-03T00:00:00.000Z',
      })
    );

    expect(beforePricing).toContain('$0.00');
    expect(beforePricing).toContain('Pricing incomplete');
    expect(afterPricing).toContain('$2.00');
    expect(afterPricing).toContain('Fallback pricing applied');

    const afterPricingInChinese = renderWithI18n(
      <AppContent
        activeView="overview"
        period="month"
        model={{ kind: 'ready', result, summary, freshness: FRESHNESS }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
        budgetModel={{
          kind: 'ready',
          snapshot: makeBudgetSnapshot({
            inputUsdPerMillion: 2,
            cachedInputUsdPerMillion: 0.5,
            outputUsdPerMillion: 10,
            updatedAt: '2026-08-03T00:00:00.000Z',
          }),
        }}
      />,
      'zh-CN'
    );

    expect(afterPricingInChinese).toContain('已使用兜底价格');
  });

  it('renders no markup for idle', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="overview"
        period="month"
        model={{ kind: 'idle' }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toBe('');
  });

  it('renders budget state before usage scan errors', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="budgets"
        period="month"
        model={{ kind: 'error', message: 'Disk unavailable' }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
        budgetModel={{
          kind: 'ready',
          snapshot: {
            generatedAt: '2026-07-20T00:00:00.000Z',
            dataState: 'fresh',
            thresholds: { warningPercent: 80, criticalPercent: 100 },
            statuses: [],
            alerts: [],
            summary: { warningCount: 0, overCount: 0, unpricedModelCount: 0 },
            pricing: [],
            unpricedModels: [],
          },
        }}
      />
    );

    expect(markup).toContain('Budget center');
    expect(markup).not.toContain('Scan failed');
  });

  it('renders state copy in Chinese', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="overview"
        period="month"
        model={{ kind: 'loading' }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
      />,
      'zh-CN'
    );

    expect(markup).toContain('正在扫描本地 Codex 会话');
    expect(markup).toContain('aria-label="正在扫描本地 Codex 会话"');
  });

  it('renders interactive project rows in the Tools view', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="tools"
        period="month"
        model={{ kind: 'ready', result: RESULT, summary: SUMMARY, freshness: FRESHNESS }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={null}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toContain('project-table-row');
    expect(markup).toContain('type="button"');
  });

  it('passes the active project filter to Sessions', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="sessions"
        period="month"
        model={{ kind: 'ready', result: RESULT, summary: SUMMARY, freshness: FRESHNESS }}
        onRefresh={vi.fn()}
        onProjectSelect={vi.fn()}
        selectedProjectPath={'C:\\repo'}
        onClearProjectFilter={vi.fn()}
      />
    );

    expect(markup).toContain('Project: repo');
  });

  it('renders a diagnosis entry for a matching session source', () => {
    const markup = renderWithI18n(
      <AppContent
        activeView="sessions"
        period="month"
        model={{ kind: 'ready', result: RESULT, summary: SUMMARY, freshness: FRESHNESS }}
        onRefresh={vi.fn()}
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
  });

  it('renders a structural skeleton only for the initial load', () => {
    const markup = renderAppContent({ kind: 'loading' });

    expect(markup).toContain('class="loading-skeleton"');
    expect(markup).toContain('aria-busy="true"');
  });

  it('keeps ready content visible with a retry action when data is stale', () => {
    const markup = renderAppContent({
      kind: 'ready',
      result: RESULT,
      summary: SUMMARY,
      freshness: { refreshing: false, staleReason: 'Disk unavailable' },
    });

    expect(markup).toContain('Token Usage Trend');
    expect(markup).toContain('Showing previous data');
    expect(markup).toContain('Disk unavailable');
    expect(markup).toContain('Retry scan');
  });
});
