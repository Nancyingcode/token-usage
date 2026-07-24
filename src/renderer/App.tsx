/**
 * @file Renderer application orchestration
 * @description Coordinates scan state, budget state, navigation, period selection, and view data.
 */
import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { filterUsageSummary } from '../shared/usageMath';
import type { UsagePeriod, UsageScanResult } from '../shared/usageTypes';
import AppContent from './components/AppContent';
import Sidebar, { type ViewKey } from './components/Sidebar';
import Toolbar from './components/Toolbar';
import { useBudgetSnapshot } from './hooks/useBudgetSnapshot';
import { resolveAppContentModel } from './utils/appContentModel';
import {
  loadUsagePeriodPreference,
  saveUsagePeriodPreference,
} from './utils/usagePeriodPreference';

export interface AppNavigationState {
  activeView: ViewKey;
  selectedProjectPath: string | null;
}

export type AppNavigationAction =
  | { type: 'select-view'; view: ViewKey }
  | { type: 'select-project'; projectPath: string }
  | { type: 'clear-project' };

export const INITIAL_APP_NAVIGATION_STATE: AppNavigationState = {
  activeView: 'overview',
  selectedProjectPath: null,
};

export const reduceAppNavigationState = (
  state: AppNavigationState,
  action: AppNavigationAction
): AppNavigationState => {
  switch (action.type) {
    case 'select-view':
      return {
        activeView: action.view,
        selectedProjectPath: action.view === 'sessions' ? null : state.selectedProjectPath,
      };
    case 'select-project':
      return {
        activeView: 'sessions',
        selectedProjectPath: action.projectPath,
      };
    case 'clear-project':
      return {
        ...state,
        selectedProjectPath: null,
      };
  }
};

const App: React.FC = () => {
  const [navigation, dispatchNavigation] = useReducer(
    reduceAppNavigationState,
    INITIAL_APP_NAVIGATION_STATE
  );
  const { activeView } = navigation;
  const [period, setPeriod] = useState<UsagePeriod>(() =>
    loadUsagePeriodPreference(window.localStorage)
  );
  const [result, setResult] = useState<UsageScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusedPolicyId, setFocusedPolicyId] = useState<string | null>(null);
  const budgetState = useBudgetSnapshot();

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

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        dispatchNavigation({ type: 'select-view', view: 'budgets' });
        setFocusedPolicyId(policyId);
      }),
    []
  );

  const filteredSummary = useMemo(
    () => (result ? filterUsageSummary(result.summary, period) : null),
    [period, result]
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
  const contentModel = resolveAppContentModel({
    error,
    loading,
    result,
    filteredSummary,
    period,
  });

  return (
    <div className="app-frame">
      <Sidebar
        activeView={activeView}
        onChange={handleViewChange}
        warningCount={warningCount}
        budgetAlertCount={budgetAlertCount}
      />
      <main className="main-panel">
        <Toolbar
          activeView={activeView}
          loading={loading}
          scannedAt={result?.scannedAt}
          onRefresh={refresh}
          period={period}
          onPeriodChange={handlePeriodChange}
        />

        <AppContent
          activeView={activeView}
          model={contentModel}
          budgetModel={budgetModel}
          budgetActions={budgetState.actions}
          focusedPolicyId={focusedPolicyId}
          onFocusedPolicyConsumed={clearFocusedPolicy}
          onProjectSelect={handleProjectSelect}
        />
      </main>
    </div>
  );
};

export default App;
