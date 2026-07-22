import React, { useEffect, useMemo, useState } from 'react';
import type { BudgetSnapshot } from '../../shared/budgetTypes';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { buildBudgetViewModel, type BudgetFilters } from '../utils/budgetViewModel';
import BudgetAlertBanner from './BudgetAlertBanner';
import BudgetList from './BudgetList';
import BudgetSummary from './BudgetSummary';

interface BudgetsViewProps {
  snapshot: BudgetSnapshot;
  actions: BudgetActions;
  focusedPolicyId?: string | null;
}

const DEFAULT_FILTERS: BudgetFilters = { scope: 'all', period: 'all' };

const BudgetsView: React.FC<BudgetsViewProps> = ({ snapshot }) => {
  const [filters, setFilters] = useState<BudgetFilters>(DEFAULT_FILTERS);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() => new Set());
  const model = useMemo(() => buildBudgetViewModel(snapshot, filters), [filters, snapshot]);
  const visibleAlerts = model.alerts.filter(({ id }) => !dismissedAlertIds.has(id));
  const showStaleWarning = snapshot.dataState === 'stale';

  useEffect(() => {
    const activeAlertIds = new Set(snapshot.alerts.map(({ id }) => id));
    setDismissedAlertIds(
      (current) => new Set([...current].filter((alertId) => activeAlertIds.has(alertId)))
    );
  }, [snapshot.alerts]);

  const handleDismissAlert = (alertId: string): void => {
    setDismissedAlertIds((current) => new Set([...current, alertId]));
  };

  return (
    <section className="budgets-page">
      <header className="budget-page-heading">
        <div>
          <h2>Budget center</h2>
          <p>Natural-period controls for tokens and estimated cost.</p>
        </div>
        <div className="budget-thresholds" aria-label="Alert thresholds">
          <span>Warning {snapshot.thresholds.warningPercent}%</span>
          <span>Critical {snapshot.thresholds.criticalPercent}%</span>
        </div>
      </header>

      {showStaleWarning ? (
        <div className="budget-stale-banner">
          Showing the last successful scan. {snapshot.staleReason ?? 'Usage data is stale.'}
        </div>
      ) : null}

      <BudgetSummary summary={model.summary} />
      <BudgetAlertBanner
        alerts={visibleAlerts}
        unpricedModels={snapshot.unpricedModels}
        onDismiss={handleDismissAlert}
      />

      <div className="budget-filter-bar">
        <label>
          <span>Scope</span>
          <select
            value={filters.scope}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                scope: event.target.value as BudgetFilters['scope'],
              }))
            }
          >
            <option value="all">All scopes</option>
            <option value="global">Global</option>
            <option value="project">Project</option>
          </select>
        </label>
        <label>
          <span>Period</span>
          <select
            value={filters.period}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                period: event.target.value as BudgetFilters['period'],
              }))
            }
          >
            <option value="all">All periods</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
      </div>

      <BudgetList groups={model.groups} />
    </section>
  );
};

export default BudgetsView;
