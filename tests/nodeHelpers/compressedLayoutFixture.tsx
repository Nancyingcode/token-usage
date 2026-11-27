import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import CompressedDataPanel from '../../src/renderer/components/CompressedDataPanel';
import Overview from '../../src/renderer/components/Overview';
import Sidebar from '../../src/renderer/components/Sidebar';
import type { ModelPricingEntry } from '../../src/shared/budgetTypes';
import type { CompressedDataStatus } from '../../src/shared/compressedDataTypes';
import { buildUsageSummary } from '../../src/shared/usageMath';
import type { UsageSession } from '../../src/shared/usageTypes';
import { createTestI18n } from '../helpers/renderWithI18n';

const params = new URLSearchParams(window.location.search);
const locale = params.get('locale') === 'en' ? 'en' : 'zh-CN';
const scenario = params.get('scenario');
const partialPricing = params.get('pricing') === 'partial';
const shortRange =
  params.get('range') === 'short'
    ? { range: { startDate: '2026-10-31', endDate: '2026-11-12' }, today: '2026-11-13' }
    : undefined;
const modelId = partialPricing
  ? `layout-fixture-${'extendedmodelid'.repeat(16)}`
  : 'layout-fixture';
const syntheticPricing: ModelPricingEntry[] = [
  {
    modelId,
    aliases: [],
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: partialPricing ? null : 0.5,
    outputUsdPerMillion: 30,
    effectiveAt: '2026-10-01',
    sourceKind: 'built-in',
    ...(partialPricing ? {} : { rulesStatus: 'unavailable' }),
  },
];
const samples = shortRange
  ? [
      { date: '2026-10-31', input: 1_860_000 },
      { date: '2026-11-01', input: 3_100_000 },
      { date: '2026-11-03', input: 2_600_000 },
      { date: '2026-11-04', input: 4_300_000 },
      { date: '2026-11-06', input: 1_720_000 },
      { date: '2026-11-07', input: 4_720_000 },
      { date: '2026-11-08', input: 3_340_000 },
      { date: '2026-11-09', input: 8_140_000 },
      { date: '2026-11-10', input: 5_410_000 },
      { date: '2026-11-11', input: 4_260_000 },
      { date: '2026-11-12', input: 5_830_000 },
    ]
  : Array.from({ length: 24 }, (_, index) => ({
      date: `2026-10-${String(index + 1).padStart(2, '0')}`,
      input: 120_000 + (index % 5) * 60_000,
    }));
const sessions: UsageSession[] = samples.map(({ date, input }, index) => {
  const timestamp = new Date(`${date}T12:00:00`).toISOString();
  const output = shortRange ? Math.round(input * 0.04) : 20_000;
  const usage = {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: shortRange ? Math.round(input * 0.67) : 80_000,
    reasoningOutputTokens: shortRange ? Math.round(output * 0.3) : 4_000,
    totalTokens: input + output,
  };
  return {
    ...usage,
    sessionId: String(index),
    sourceFile: `synthetic/${index}.jsonl`,
    startedAt: timestamp,
    endedAt: timestamp,
    projectPath: 'synthetic',
    projectName: 'Synthetic project',
    eventCount: 1,
    turnOutcomes: [],
    warnings: [],
    usageSlices: [{ ...usage, occurredAt: timestamp, modelId }],
  };
});
const status: CompressedDataStatus = {
  sessionsDir: 'synthetic',
  phase: scenario === 'partial' ? 'partial' : 'idle',
  discoveredCount: 527,
  unimportedCount: 527,
  importedCount: 0,
  processedCount: 0,
  totalCount: 0,
  ...(scenario === 'partial'
    ? {
        report: {
          added: 2,
          updated: 0,
          unchanged: 0,
          failures: [
            {
              sourceFile: `synthetic/${'long-source-'.repeat(16)}.jsonl.zst`,
              message: 'Synthetic truncated frame',
            },
          ],
        },
      }
    : {}),
};

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing layout fixture root.');
}
createRoot(container).render(
  <I18nextProvider i18n={createTestI18n(locale)}>
    <div className="app-frame">
      <Sidebar activeView="overview" warningCount={0} onChange={() => undefined} />
      <header className="title-bar">
        <span>
          Codex Token · {locale === 'en' ? 'Synthetic layout preview' : '合成数据布局预览'}
        </span>
      </header>
      <main className="main-panel main-panel--overview">
        {scenario !== 'none' ? (
          <CompressedDataPanel
            status={status}
            pending={false}
            scannedAt="2026-10-24T00:24:00Z"
            onRefresh={() => undefined}
          />
        ) : null}
        <div className="view-transition">
          <Overview
            summary={buildUsageSummary(sessions)}
            pricing={syntheticPricing}
            period="total"
            scannedAt={shortRange ? '2026-11-13T00:24:00Z' : '2026-10-24T00:24:00Z'}
            overviewDateFilter={shortRange}
          />
        </div>
      </main>
    </div>
  </I18nextProvider>
);
