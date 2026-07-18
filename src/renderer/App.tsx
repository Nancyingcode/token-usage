import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { filterUsageSummary } from '../shared/usageMath';
import type { UsagePeriod, UsageScanResult } from '../shared/usageTypes';
import EmptyState from './components/EmptyState';
import Overview from './components/Overview';
import PeriodEmptyState from './components/PeriodEmptyState';
import PerformanceView from './components/PerformanceView';
import ProjectsView from './components/ProjectsView';
import SessionsView from './components/SessionsView';
import SettingsView from './components/SettingsView';
import Sidebar, { type ViewKey } from './components/Sidebar';
import Toolbar from './components/Toolbar';
import { ICON_SIZE_LARGE } from './constants/ui';

const DEFAULT_USAGE_PERIOD: UsagePeriod = 'month';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [period, setPeriod] = useState<UsagePeriod>(DEFAULT_USAGE_PERIOD);
  const [result, setResult] = useState<UsageScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  const filteredSummary = useMemo(
    () => (result ? filterUsageSummary(result.summary, period) : null),
    [period, result]
  );
  const warningCount = result?.warnings.length ?? 0;

  return (
    <div className="app-frame">
      <Sidebar activeView={activeView} onChange={setActiveView} warningCount={warningCount} />
      <main className="main-panel">
        <Toolbar
          activeView={activeView}
          loading={loading}
          scannedAt={result?.scannedAt}
          onRefresh={refresh}
          period={period}
          onPeriodChange={setPeriod}
        />

        {error ? (
          <section className="state-panel">
            <AlertCircle size={ICON_SIZE_LARGE} />
            <div>
              <h2>Scan failed</h2>
              <p>{error}</p>
            </div>
          </section>
        ) : null}

        {!error && loading ? (
          <section className="state-panel">
            <div className="loader" />
            <div>
              <h2>Scanning local Codex sessions</h2>
              <p>Read-only JSONL parsing. No edits, no uploads.</p>
            </div>
          </section>
        ) : null}

        {!error && !loading && result && result.summary.sessions.length === 0 ? (
          <EmptyState sessionsDir={result.sessionsDir} warnings={result.warnings} />
        ) : null}

        {!error &&
        !loading &&
        result &&
        result.summary.sessions.length > 0 &&
        filteredSummary?.sessions.length === 0 ? (
          <PeriodEmptyState period={period} />
        ) : null}

        {!error && !loading && result && filteredSummary && filteredSummary.sessions.length > 0 ? (
          <>
            {activeView === 'overview' ? <Overview summary={filteredSummary} /> : null}
            {activeView === 'sessions' ? (
              <SessionsView sessions={filteredSummary.sessions} />
            ) : null}
            {activeView === 'tools' ? <ProjectsView projects={filteredSummary.byProject} /> : null}
            {activeView === 'performance' ? <PerformanceView summary={filteredSummary} /> : null}
            {activeView === 'wrapped' ? <SettingsView result={result} /> : null}
          </>
        ) : null}
      </main>
    </div>
  );
};

export default App;
