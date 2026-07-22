import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { filterUsageSummary } from '../shared/usageMath';
import type { UsagePeriod, UsageScanResult } from '../shared/usageTypes';
import AppContent from './components/AppContent';
import Sidebar, { type ViewKey } from './components/Sidebar';
import Toolbar from './components/Toolbar';
import { useBudgetSnapshot } from './hooks/useBudgetSnapshot';
import { resolveAppContentModel } from './utils/appContentModel';

const DEFAULT_USAGE_PERIOD: UsagePeriod = 'month';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [period, setPeriod] = useState<UsagePeriod>(DEFAULT_USAGE_PERIOD);
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
        setActiveView('budgets');
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
        onChange={setActiveView}
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
          onPeriodChange={setPeriod}
        />

        <AppContent
          activeView={activeView}
          model={contentModel}
          budgetModel={budgetModel}
          focusedPolicyId={focusedPolicyId}
        />
      </main>
    </div>
  );
};

export default App;
