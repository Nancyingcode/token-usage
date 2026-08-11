/**
 * @file Renderer application orchestration
 * @description Coordinates scan state, budget state, navigation, period selection, and view data.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { CostOptimizationTab, SessionDiagnosisSummary } from '../shared/costOptimizationTypes';
import { filterUsageSummary } from '../shared/usageMath';
import type { UsagePeriod, UsageScanResult } from '../shared/usageTypes';
import type {
  UsageDataPathSettings,
  UsageDataPathUpdateResult,
} from '../shared/usageDataPathTypes';
import AppContent from './components/AppContent';
import type { BudgetTab } from './components/BudgetsView';
import Sidebar, { type ViewKey } from './components/Sidebar';
import Toolbar from './components/Toolbar';
import TitleBar from './components/TitleBar';
import { useBudgetSnapshot } from './hooks/useBudgetSnapshot';
import { useCostOptimizationSnapshot } from './hooks/useCostOptimizationSnapshot';
import { useSessionDiagnosisDetail } from './hooks/useSessionDiagnosisDetail';
import { resolveAppContentModel } from './utils/appContentModel';
import {
  loadUsagePeriodPreference,
  saveUsagePeriodPreference,
} from './utils/usagePeriodPreference';

export interface AppNavigationState {
  activeView: ViewKey;
  selectedProjectPath: string | null;
  activeBudgetTab: BudgetTab;
  activeCostOptimizationTab: CostOptimizationTab;
  diagnosisId: string | null;
}

export type AppNavigationAction =
  | { type: 'select-view'; view: ViewKey }
  | { type: 'select-project'; projectPath: string }
  | { type: 'clear-project' }
  | { type: 'select-budget-tab'; tab: BudgetTab }
  | { type: 'open-budget-policy' }
  | { type: 'select-cost-tab'; tab: CostOptimizationTab }
  | { type: 'open-diagnosis'; diagnosisId: string }
  | { type: 'close-diagnosis' };

export const INITIAL_APP_NAVIGATION_STATE: AppNavigationState = {
  activeView: 'overview',
  selectedProjectPath: null,
  activeBudgetTab: 'overview',
  activeCostOptimizationTab: 'overview',
  diagnosisId: null,
};

interface ViewTransitionStates {
  usage: string;
  budget: string;
  costOptimization: string;
}

export const getViewTransitionKey = (activeView: ViewKey, states: ViewTransitionStates): string => {
  switch (activeView) {
    case 'budgets':
      return `${activeView}:${states.budget}`;
    case 'costOptimization':
      return `${activeView}:${states.costOptimization}`;
    default:
      return `${activeView}:${states.usage}`;
  }
};

export const reduceAppNavigationState = (
  state: AppNavigationState,
  action: AppNavigationAction
): AppNavigationState => {
  switch (action.type) {
    case 'select-view':
      return {
        ...state,
        activeView: action.view,
        selectedProjectPath: action.view === 'sessions' ? null : state.selectedProjectPath,
      };
    case 'select-project':
      return {
        ...state,
        activeView: 'sessions',
        selectedProjectPath: action.projectPath,
      };
    case 'clear-project':
      return {
        ...state,
        selectedProjectPath: null,
      };
    case 'select-budget-tab':
      return {
        ...state,
        activeBudgetTab: action.tab,
      };
    case 'open-budget-policy':
      return {
        ...state,
        activeView: 'budgets',
        activeBudgetTab: 'policies',
      };
    case 'select-cost-tab':
      return {
        ...state,
        activeCostOptimizationTab: action.tab,
      };
    case 'open-diagnosis':
      return {
        ...state,
        activeView: 'costOptimization',
        selectedProjectPath: null,
        activeCostOptimizationTab: 'diagnostics',
        diagnosisId: action.diagnosisId,
      };
    case 'close-diagnosis':
      return {
        ...state,
        diagnosisId: null,
      };
  }
};

const App: React.FC = () => {
  const [navigation, dispatchNavigation] = useReducer(
    reduceAppNavigationState,
    INITIAL_APP_NAVIGATION_STATE
  );
  const {
    activeView,
    selectedProjectPath,
    activeBudgetTab,
    activeCostOptimizationTab,
    diagnosisId,
  } = navigation;
  const [period, setPeriod] = useState<UsagePeriod>(() =>
    loadUsagePeriodPreference(window.localStorage)
  );
  const [result, setResult] = useState<UsageScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataPathSettings, setDataPathSettings] = useState<UsageDataPathSettings | null>(null);
  const [focusedPolicyId, setFocusedPolicyId] = useState<string | null>(null);
  const budgetState = useBudgetSnapshot();
  const costOptimizationState = useCostOptimizationSnapshot(period);
  const setCostOptimizationProjectPath = costOptimizationState.setProjectPath;
  const diagnosisDetailModel = useSessionDiagnosisDetail(
    costOptimizationState.query,
    diagnosisId,
    costOptimizationState.snapshot ?? undefined
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const nextResult = await window.codexUsage.scan();
      setResult(nextResult);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : String(scanError));
    } finally {
      setLoading(false);
    }
  }, []);
  const clearFocusedPolicy = useCallback(() => setFocusedPolicyId(null), []);
  const applyDataPathUpdate = useCallback((update: UsageDataPathUpdateResult): void => {
    setDataPathSettings(update.settings);
    setResult(update.result);
    setError(null);
    setLoading(false);
  }, []);
  const handleDataPathUpdate = useCallback(
    async (sessionsDir: string): Promise<void> => {
      applyDataPathUpdate(await window.codexUsage.dataPath.update(sessionsDir));
    },
    [applyDataPathUpdate]
  );
  const handleDataPathSelect = useCallback(
    async (): Promise<string | null> => window.codexUsage.dataPath.select(),
    []
  );
  const handleDataPathReset = useCallback(async (): Promise<void> => {
    applyDataPathUpdate(await window.codexUsage.dataPath.reset());
  }, [applyDataPathUpdate]);
  const handlePeriodChange = useCallback((nextPeriod: UsagePeriod): void => {
    setPeriod(nextPeriod);
    saveUsagePeriodPreference(nextPeriod, window.localStorage);
  }, []);
  const handleViewChange = useCallback((view: ViewKey): void => {
    dispatchNavigation({ type: 'select-view', view });
  }, []);
  const handleProjectSelect = useCallback((projectPath: string): void => {
    dispatchNavigation({ type: 'select-project', projectPath });
  }, []);
  const clearProjectFilter = useCallback((): void => {
    dispatchNavigation({ type: 'clear-project' });
  }, []);
  const handleBudgetTabChange = useCallback((tab: BudgetTab): void => {
    dispatchNavigation({ type: 'select-budget-tab', tab });
  }, []);
  const handleCostOptimizationTabChange = useCallback((tab: CostOptimizationTab): void => {
    dispatchNavigation({ type: 'select-cost-tab', tab });
  }, []);
  const handleDiagnosisOpen = useCallback(
    (summary: SessionDiagnosisSummary): void => {
      if (activeView === 'sessions') {
        setCostOptimizationProjectPath(summary.projectPath || undefined);
      }
      dispatchNavigation({ type: 'open-diagnosis', diagnosisId: summary.diagnosisId });
    },
    [activeView, setCostOptimizationProjectPath]
  );
  const handleDiagnosisClose = useCallback((): void => {
    dispatchNavigation({ type: 'close-diagnosis' });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    void window.codexUsage.dataPath
      .get()
      .then(setDataPathSettings)
      .catch(() => undefined);
  }, []);

  useEffect(
    () =>
      window.codexUsage.onUsageUpdated((nextResult) => {
        setResult(nextResult);
        setError(null);
        setLoading(false);
      }),
    []
  );

  useEffect(
    () =>
      window.codexUsage.budgets.onNavigate((policyId) => {
        dispatchNavigation({ type: 'open-budget-policy' });
        setFocusedPolicyId(policyId);
      }),
    []
  );

  const filteredSummary = useMemo(
    () => (result ? filterUsageSummary(result.summary, period) : null),
    [period, result]
  );
  const costProjectOptions = useMemo(
    () => result?.summary.byProject.map(({ projectPath }) => projectPath) ?? [],
    [result]
  );
  const warningCount = result?.warnings.length ?? 0;
  const budgetAlertCount =
    (budgetState.snapshot?.summary.warningCount ?? 0) +
    (budgetState.snapshot?.summary.overCount ?? 0);
  const budgetModel = budgetState.loading
    ? { kind: 'loading' as const }
    : budgetState.error
      ? { kind: 'error' as const, message: budgetState.error }
      : budgetState.snapshot
        ? { kind: 'ready' as const, snapshot: budgetState.snapshot }
        : { kind: 'loading' as const };
  const costOptimizationModel = costOptimizationState.loading
    ? { kind: 'loading' as const }
    : costOptimizationState.error
      ? { kind: 'error' as const, message: costOptimizationState.error }
      : costOptimizationState.snapshot
        ? { kind: 'ready' as const, snapshot: costOptimizationState.snapshot }
        : { kind: 'loading' as const };
  const globalDiagnostics = costOptimizationState.globalSnapshot?.diagnostics ?? [];
  const contentModel = resolveAppContentModel({
    error,
    loading,
    result,
    filteredSummary,
    period,
  });
  const viewTransitionKey = getViewTransitionKey(activeView, {
    usage: contentModel.kind,
    budget: budgetModel.kind,
    costOptimization: costOptimizationModel.kind,
  });

  return (
    <div className="app-frame">
      <Sidebar
        activeView={activeView}
        onChange={handleViewChange}
        warningCount={warningCount}
        budgetAlertCount={budgetAlertCount}
      />
      <TitleBar />
      <main
        className={activeView === 'overview' ? 'main-panel main-panel--overview' : 'main-panel'}
      >
        <Toolbar
          activeView={activeView}
          loading={loading}
          error={error}
          scannedAt={result?.scannedAt}
          onRefresh={refresh}
          period={period}
          onPeriodChange={handlePeriodChange}
        />

        <div key={viewTransitionKey} className="view-transition">
          <AppContent
            activeView={activeView}
            period={period}
            model={contentModel}
            onRefresh={refresh}
            budgetModel={budgetModel}
            budgetActions={budgetState.actions}
            budgetTab={activeBudgetTab}
            onBudgetTabChange={handleBudgetTabChange}
            focusedPolicyId={focusedPolicyId}
            onFocusedPolicyConsumed={clearFocusedPolicy}
            onProjectSelect={handleProjectSelect}
            selectedProjectPath={selectedProjectPath}
            onClearProjectFilter={clearProjectFilter}
            costOptimizationModel={costOptimizationModel}
            costProjectOptions={costProjectOptions}
            costProjectPath={costOptimizationState.projectPath}
            costOptimizationTab={activeCostOptimizationTab}
            diagnosisId={diagnosisId}
            diagnosisDetailModel={diagnosisDetailModel}
            globalDiagnostics={globalDiagnostics}
            onCostOptimizationTabChange={handleCostOptimizationTabChange}
            onDiagnosisOpen={handleDiagnosisOpen}
            onDiagnosisClose={handleDiagnosisClose}
            onCostProjectPathChange={costOptimizationState.setProjectPath}
            onCostSettingsUpdate={costOptimizationState.updateSettings}
            dataPathSettings={dataPathSettings ?? undefined}
            onSelectDataPath={handleDataPathSelect}
            onUpdateDataPath={handleDataPathUpdate}
            onResetDataPath={handleDataPathReset}
          />
        </div>
      </main>
    </div>
  );
};

export default App;
