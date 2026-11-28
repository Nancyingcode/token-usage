/**
 * @file Electron 动效测试数据
 * @description 从合成快照启动真实应用，提供可控的后台更新和预算确认。
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import App from '../../src/renderer/App';
import { saveUsagePeriodPreference } from '../../src/renderer/utils/usagePeriodPreference';
import { evaluateBudgets } from '../../src/shared/budgetEvaluation';
import type { BudgetPolicy, ModelPricingEntry } from '../../src/shared/budgetTypes';
import { formatLocalDateKey } from '../../src/shared/calendarDate';
import type {
  CostOptimizationQuery,
  CostOptimizationSnapshot,
} from '../../src/shared/costOptimizationTypes';
import { resolveRendererLocale } from '../../src/renderer/i18n';
import { isThemeId } from '../../src/shared/theme';
import { buildUsageSummary } from '../../src/shared/usageMath';
import type { UsagePeriod, UsageScanResult, UsageSession } from '../../src/shared/usageTypes';
import { createTestI18n } from '../helpers/renderWithI18n';
import { SNAPSHOT as COST_SNAPSHOT } from '../helpers/costOptimizationFixtures';

const params = new URLSearchParams(window.location.search);
const resultsScenario = params.get('scenario') === 'results';
const locale = resolveRendererLocale(params.get('locale') ?? undefined);
const requestedTheme = params.get('theme');
const theme = isThemeId(requestedTheme) ? requestedTheme : 'mint-light';
const i18n = createTestI18n(locale);
document.documentElement.lang = locale;
document.documentElement.dataset.theme = theme;
saveUsagePeriodPreference('week', window.localStorage);

const now = new Date();
const today = formatLocalDateKey(now);
const dateBefore = (days: number): Date => {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
};
const modelId = 'motion-test';
const sessionsDir = 'C:\\synthetic-motion-fixture';
const defaultProjectName = 'Synthetic project';
const resultProjectNames = Array.from(
  { length: 8 },
  (_, index) => `Fixture project ${String.fromCharCode('A'.charCodeAt(0) + index)}`
);
const projectPath = (name: string): string => `${sessionsDir}\\${name}`;
const makeSession = (
  id: string,
  daysAgo: number,
  tokens: number,
  projectName = defaultProjectName
): UsageSession => {
  const startedAt = dateBefore(daysAgo).toISOString();
  const usage = {
    inputTokens: tokens,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: tokens,
  };
  return {
    ...usage,
    sessionId: id,
    threadName: id,
    startedAt,
    endedAt: startedAt,
    projectPath: projectName === defaultProjectName ? sessionsDir : projectPath(projectName),
    projectName,
    usageSlices: [{ ...usage, occurredAt: startedAt, modelId }],
    turnOutcomes: [],
    reasoningEfforts: [
      { effort: 'ultra', turnCount: 1, totalTokens: tokens, reasoningOutputTokens: 0 },
    ],
    speedHistory: [
      { serviceTier: 'default', occurredAt: startedAt },
      { serviceTier: 'priority', occurredAt: startedAt },
    ],
    sourceFile: `${id}.jsonl`,
    eventCount: 1,
    warnings: [],
  };
};
const makeResult = (sessions: UsageSession[]): UsageScanResult => ({
  sessionsDir,
  scannedAt: `${today}T12:00:00.000Z`,
  summary: buildUsageSummary(sessions),
  warnings: [],
});
const standardSessions = [
  makeSession('recent', 0, 800),
  makeSession('week', 3, 240),
  makeSession('month', 12, 1_800),
];
const resultSessions = Array.from({ length: 30 }, (_, index) => {
  const projectIndex = index % resultProjectNames.length;
  const label = String(index + 1).padStart(2, '0');
  return makeSession(
    `Fixture session ${label}`,
    0,
    (resultProjectNames.length - projectIndex) * 100,
    resultProjectNames[projectIndex]
  );
});
const sessions = resultsScenario ? resultSessions : standardSessions;
const policy: BudgetPolicy = {
  id: 'synthetic-policy',
  scope: 'global',
  period: 'month',
  modelTarget: { kind: 'all' },
  tokenLimit: 10_000,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const pricing: ModelPricingEntry[] = [
  {
    modelId,
    aliases: [],
    inputUsdPerMillion: 10,
    cachedInputUsdPerMillion: 5,
    outputUsdPerMillion: 20,
    effectiveAt: '2026-01-01',
    sourceKind: 'built-in',
  },
];
const budgetSnapshot = (policies: BudgetPolicy[]) =>
  evaluateBudgets({
    sessions,
    dataState: 'fresh',
    policies,
    pricing,
    thresholds: { warningPercent: 80, criticalPercent: 90 },
    now,
  });

let result = makeResult(sessions);
let usageListener: ((next: UsageScanResult) => void) | undefined;
let costListener: ((next: CostOptimizationSnapshot) => void) | undefined;
let deletedPolicies = 0;
const subscribeToNothing = () => () => undefined;
const requests: Array<{
  query: CostOptimizationQuery;
  resolve: (snapshot: CostOptimizationSnapshot) => void;
  reject: (error: Error) => void;
}> = [];
const findCostRequest = (name: string, period: UsagePeriod) =>
  requests.findIndex(
    ({ query }) => query.projectPath === projectPath(name) && query.period === period
  );

Object.defineProperty(window, 'codexUsage', {
  value: {
    getInitialUsage: async () => result,
    scan: async () => result,
    onUsageUpdated: (listener: (next: UsageScanResult) => void) => {
      usageListener = listener;
      return () => {
        usageListener = undefined;
      };
    },
    window: { getState: async () => ({ isMaximized: false }), onStateChanged: subscribeToNothing },
    compressedData: {
      getStatus: async () => ({
        sessionsDir,
        phase: 'idle',
        unimportedCount: 0,
        discoveredCount: 0,
      }),
      onUpdated: subscribeToNothing,
    },
    theme: {
      get: async () => ({ preference: theme, resolvedTheme: theme }),
      onUpdated: subscribeToNothing,
    },
    budgets: {
      getSnapshot: async () => budgetSnapshot([policy]),
      onUpdated: subscribeToNothing,
      onNavigate: subscribeToNothing,
      deletePolicy: async () => {
        deletedPolicies += 1;
        return budgetSnapshot([]);
      },
    },
    costOptimization: {
      getSnapshot: (query: CostOptimizationQuery): Promise<CostOptimizationSnapshot> => {
        if (!resultsScenario || !query.projectPath) {
          return Promise.resolve({ ...COST_SNAPSHOT, query });
        }
        return new Promise((resolve, reject) => requests.push({ query, resolve, reject }));
      },
      onUpdated: (listener: typeof costListener) => {
        costListener = listener;
        return () => {
          costListener = undefined;
        };
      },
    },
  },
});

const motionStarts: Array<{
  name: string;
  target: string | null;
  pseudoElement: string;
  duration: string;
  delay: string;
}> = [];
document.addEventListener('animationstart', (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }
  const style = getComputedStyle(event.target, event.pseudoElement || null);
  motionStarts.push({
    name: event.animationName,
    target: event.target.getAttribute('class'),
    pseudoElement: event.pseudoElement,
    duration: style.animationDuration,
    delay: style.animationDelay,
  });
});
document.addEventListener('transitionrun', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const isTrendOpacity =
    event.propertyName === 'opacity' && target.classList.contains('trend-range-enter');
  if (!isTrendOpacity) {
    return;
  }
  const style = getComputedStyle(target);
  motionStarts.push({
    name: 'trend-range-enter',
    target: target.getAttribute('class'),
    pseudoElement: event.pseudoElement,
    duration: style.transitionDuration,
    delay: style.transitionDelay,
  });
});

Object.defineProperty(window, 'motionFixture', {
  value: {
    today,
    yesterday: formatLocalDateKey(dateBefore(1)),
    motionStarts,
    labels: {
      overview: i18n.t('navigation.overview'),
      sessions: i18n.t('navigation.sessions'),
      projects: i18n.t('navigation.tools'),
      budgets: i18n.t('navigation.budgets'),
      costOptimization: i18n.t('navigation.costOptimization'),
    },
    getDeletedPolicies: () => deletedPolicies,
    publishUsage: () => {
      result = makeResult([...sessions, makeSession('pushed', 0, 2_400)]);
      usageListener?.(result);
    },
    resultProjectNames,
    publishProjectChange: (change: 'add' | 'reorder' | 'remove') => {
      const firstProject = resultProjectNames[0];
      const existing = result.summary.sessions;
      const next =
        change === 'add'
          ? [...existing, makeSession('Fixture added session', 0, 20, 'Fixture project I')]
          : existing.flatMap((session) => {
              if (session.projectName !== firstProject) {
                return [session];
              }
              return change === 'reorder'
                ? [makeSession(session.sessionId, 0, 1, firstProject)]
                : [];
            });
      result = makeResult(next);
      usageListener?.(result);
    },
    hasCostRequest: (name: string, period: UsagePeriod) => findCostRequest(name, period) >= 0,
    settleCostRequest: (name: string, period: UsagePeriod, outcome: number | string) => {
      const index = findCostRequest(name, period);
      if (index < 0) {
        throw new Error('No matching synthetic cost request.');
      }
      const [request] = requests.splice(index, 1);
      if (typeof outcome === 'string') {
        request.reject(new Error(outcome));
      } else {
        request.resolve({ ...COST_SNAPSHOT, query: request.query, currentCostUsd: outcome });
      }
    },
    publishCost: (name: string, period: UsagePeriod, currentCostUsd: number) => {
      const query = { period, projectPath: projectPath(name) };
      costListener?.({ ...COST_SNAPSHOT, query, currentCostUsd });
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Missing motion fixture root.');
}
createRoot(container).render(
  <I18nextProvider i18n={i18n}>
    <App />
  </I18nextProvider>
);
