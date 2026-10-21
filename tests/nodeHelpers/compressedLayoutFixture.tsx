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
const SYNTHETIC_PRICING: ModelPricingEntry[] = [
  {
    modelId: 'layout-fixture',
    aliases: [],
    inputUsdPerMillion: 5,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 30,
    effectiveAt: '2026-10-01',
    sourceKind: 'built-in',
    rulesStatus: 'unavailable',
  },
];
const sessions: UsageSession[] = Array.from({ length: 24 }, (_, index) => {
  const date = `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00Z`;
  const usage = {
    inputTokens: 120_000 + (index % 5) * 60_000,
    outputTokens: 20_000,
    cachedInputTokens: 80_000,
    reasoningOutputTokens: 4_000,
    totalTokens: 140_000 + (index % 5) * 60_000,
  };
  return {
    ...usage,
    sessionId: String(index),
    sourceFile: `synthetic/${index}.jsonl`,
    startedAt: date,
    endedAt: date,
    projectPath: 'synthetic',
    projectName: 'Synthetic project',
    eventCount: 1,
    turnOutcomes: [],
    warnings: [],
    usageSlices: [{ ...usage, occurredAt: date, modelId: 'layout-fixture' }],
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
            pricing={SYNTHETIC_PRICING}
            period="total"
            scannedAt="2026-10-24T00:24:00Z"
          />
        </div>
      </main>
    </div>
  </I18nextProvider>
);
