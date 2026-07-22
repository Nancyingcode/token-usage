import React, { useEffect, useMemo, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import type { BudgetPolicy, BudgetSnapshot } from '../../shared/budgetTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { buildBudgetViewModel, type BudgetFilters } from '../utils/budgetViewModel';
import BudgetAlertBanner from './BudgetAlertBanner';
import BudgetDrawer, { type BudgetDrawerModel } from './BudgetDrawer';
import BudgetList from './BudgetList';
import BudgetSummary from './BudgetSummary';
import ConfirmDialog from './ConfirmDialog';

interface BudgetsViewProps {
  snapshot: BudgetSnapshot;
  actions: BudgetActions;
  focusedPolicyId?: string | null;
  onFocusedPolicyConsumed?: () => void;
}

const DEFAULT_FILTERS: BudgetFilters = { scope: 'all', period: 'all' };

type BudgetEditorModel = { kind: 'closed' } | BudgetDrawerModel;

const BudgetsView: React.FC<BudgetsViewProps> = ({
  snapshot,
  actions,
  focusedPolicyId,
  onFocusedPolicyConsumed,
}) => {
  const [filters, setFilters] = useState<BudgetFilters>(DEFAULT_FILTERS);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() => new Set());
  const [editorModel, setEditorModel] = useState<BudgetEditorModel>({ kind: 'closed' });
  const [deletePolicy, setDeletePolicy] = useState<BudgetPolicy | null>(null);
  const model = useMemo(() => buildBudgetViewModel(snapshot, filters), [filters, snapshot]);
  const visibleAlerts = model.alerts.filter(({ id }) => !dismissedAlertIds.has(id));
  const showStaleWarning = snapshot.dataState === 'stale';

  useEffect(() => {
    const activeAlertIds = new Set(snapshot.alerts.map(({ id }) => id));
    setDismissedAlertIds(
      (current) => new Set([...current].filter((alertId) => activeAlertIds.has(alertId)))
    );
  }, [snapshot.alerts]);

  useEffect(() => {
    if (!focusedPolicyId) {
      return;
    }

    const focusedStatus = snapshot.statuses.find(({ policy }) => policy.id === focusedPolicyId);

    if (focusedStatus) {
      setEditorModel({ kind: 'policy', policy: focusedStatus.policy });
    }

    onFocusedPolicyConsumed?.();
  }, [focusedPolicyId, onFocusedPolicyConsumed, snapshot.statuses]);

  const handleDismissAlert = (alertId: string): void => {
    setDismissedAlertIds((current) => new Set([...current, alertId]));
  };

  const closeEditor = (): void => setEditorModel({ kind: 'closed' });

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deletePolicy) {
      return;
    }

    await actions.deletePolicy(deletePolicy.id);
    setDeletePolicy(null);
  };

  const drawer =
    editorModel.kind === 'closed' ? null : (
      <BudgetDrawer
        model={editorModel}
        thresholds={snapshot.thresholds}
        actions={actions}
        onClose={closeEditor}
      />
    );
  const deleteDialog = deletePolicy ? (
    <ConfirmDialog
      title="Delete budget?"
      message="The policy and its notification history will be removed."
      confirmLabel="Delete"
      onConfirm={() => void handleDeleteConfirm()}
      onCancel={() => setDeletePolicy(null)}
    />
  ) : null;

  return (
    <section className="budgets-page">
      <header className="budget-page-heading">
        <div>
          <h2>Budget center</h2>
          <p>Natural-period controls for tokens and estimated cost.</p>
        </div>
        <div className="budget-heading-actions">
          <div className="budget-thresholds" aria-label="Alert thresholds">
            <span>Warning {snapshot.thresholds.warningPercent}%</span>
            <span>Critical {snapshot.thresholds.criticalPercent}%</span>
          </div>
          <button
            type="button"
            className="secondary-button icon-command"
            onClick={() => setEditorModel({ kind: 'thresholds' })}
          >
            <SlidersHorizontal size={ICON_SIZE_SMALL} />
            Thresholds
          </button>
          <button
            type="button"
            className="primary-button icon-command"
            onClick={() => setEditorModel({ kind: 'policy' })}
          >
            <Plus size={ICON_SIZE_SMALL} />
            Add budget
          </button>
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

      <BudgetList
        groups={model.groups}
        onEdit={(policy) => setEditorModel({ kind: 'policy', policy })}
        onDelete={setDeletePolicy}
      />
      {drawer}
      {deleteDialog}
    </section>
  );
};

export default BudgetsView;
