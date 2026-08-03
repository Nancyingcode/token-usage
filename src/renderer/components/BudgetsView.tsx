/**
 * @file 预算管理视图
 * @description
 * 协调预算概览、筛选、价格设置和编辑器状态，业务数据与写操作由外部模型提供。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BudgetPolicy, BudgetSnapshot } from '../../shared/budgetTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { buildBudgetViewModel, type BudgetFilters } from '../utils/budgetViewModel';
import AccessibleTabs, { getTabId, getTabPanelId } from './AccessibleTabs';
import BudgetAlertBanner from './BudgetAlertBanner';
import BudgetDrawer, { type BudgetDrawerModel } from './BudgetDrawer';
import BudgetList from './BudgetList';
import BudgetSummary from './BudgetSummary';
import ConfirmDialog from './ConfirmDialog';
import ModelPricingView from './ModelPricingView';

interface BudgetsViewProps {
  snapshot: BudgetSnapshot;
  actions: BudgetActions;
  focusedPolicyId?: string | null;
  onFocusedPolicyConsumed?: () => void;
}

const DEFAULT_FILTERS: BudgetFilters = { scope: 'all', period: 'all' };

type BudgetEditorModel = { kind: 'closed' } | BudgetDrawerModel;
type BudgetTab = 'overview' | 'pricing';

const BudgetsView: React.FC<BudgetsViewProps> = ({
  snapshot,
  actions,
  focusedPolicyId,
  onFocusedPolicyConsumed,
}) => {
  const { t } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const [filters, setFilters] = useState<BudgetFilters>(DEFAULT_FILTERS);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() => new Set());
  const [editorModel, setEditorModel] = useState<BudgetEditorModel>({ kind: 'closed' });
  const [deletePolicy, setDeletePolicy] = useState<BudgetPolicy | null>(null);
  const [activeTab, setActiveTab] = useState<BudgetTab>('overview');
  const [pricingTarget, setPricingTarget] = useState<string | null>(null);
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
  const clearPricingTarget = useCallback(() => setPricingTarget(null), []);

  const handleAddPrice = (modelId: string): void => {
    setActiveTab('pricing');
    setPricingTarget(modelId);
  };

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
      title={t('confirm.deleteTitle')}
      message={t('confirm.deleteMessage')}
      confirmLabel={tCommon('action.delete')}
      onConfirm={() => void handleDeleteConfirm()}
      onCancel={() => setDeletePolicy(null)}
    />
  ) : null;
  const overviewContent = (
    <>
      <BudgetSummary summary={model.summary} />
      <BudgetAlertBanner
        alerts={visibleAlerts}
        unpricedModels={snapshot.unpricedModels}
        onDismiss={handleDismissAlert}
        onAddPrice={handleAddPrice}
      />

      <div className="budget-filter-bar">
        <label>
          <span>{t('filter.scope')}</span>
          <select
            value={filters.scope}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                scope: event.target.value as BudgetFilters['scope'],
              }))
            }
          >
            <option value="all">{t('filter.allScopes')}</option>
            <option value="global">{t('scope.global')}</option>
            <option value="project">{t('scope.project')}</option>
          </select>
        </label>
        <label>
          <span>{t('filter.period')}</span>
          <select
            value={filters.period}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                period: event.target.value as BudgetFilters['period'],
              }))
            }
          >
            <option value="all">{t('filter.allPeriods')}</option>
            <option value="day">{t('period.day')}</option>
            <option value="week">{t('period.week')}</option>
            <option value="month">{t('period.month')}</option>
          </select>
        </label>
      </div>

      <BudgetList
        groups={model.groups}
        onEdit={(policy) => setEditorModel({ kind: 'policy', policy })}
        onDelete={setDeletePolicy}
      />
    </>
  );
  const pricingContent = (
    <ModelPricingView
      pricing={snapshot.pricing}
      unpricedModels={snapshot.unpricedModels}
      actions={actions}
      initialModelId={pricingTarget}
      onInitialModelConsumed={clearPricingTarget}
    />
  );
  const budgetTabs = [
    { value: 'overview', label: t('page.overview') },
    { value: 'pricing', label: t('page.pricing') },
  ] as const;
  const pageContent = activeTab === 'overview' ? overviewContent : pricingContent;
  const showOverviewActions = activeTab === 'overview';
  const headingActions = showOverviewActions ? (
    <>
      <div className="budget-thresholds" aria-label={t('page.alertThresholds')}>
        <span>{t('page.warningThreshold', { percent: snapshot.thresholds.warningPercent })}</span>
        <span>{t('page.criticalThreshold', { percent: snapshot.thresholds.criticalPercent })}</span>
      </div>
      <button
        type="button"
        className="secondary-button icon-command"
        onClick={() => setEditorModel({ kind: 'thresholds' })}
      >
        <SlidersHorizontal size={ICON_SIZE_SMALL} />
        {t('page.thresholds')}
      </button>
      <button
        type="button"
        className="primary-button icon-command"
        onClick={() => setEditorModel({ kind: 'policy' })}
      >
        <Plus size={ICON_SIZE_SMALL} />
        {t('page.addBudget')}
      </button>
    </>
  ) : null;

  return (
    <section className="budgets-page">
      <header className="budget-page-heading">
        <div>
          <h2>{t('page.title')}</h2>
          <p>{t('page.description')}</p>
        </div>
        <div className="budget-heading-actions">{headingActions}</div>
      </header>

      {showStaleWarning ? (
        <div className="budget-stale-banner">
          {t('page.stale', {
            reason: snapshot.staleReason ?? t('page.staleDefault'),
          })}
        </div>
      ) : null}

      <AccessibleTabs
        groupId="budget"
        label={t('page.views')}
        value={activeTab}
        tabs={budgetTabs}
        onChange={setActiveTab}
      />
      <div
        id={getTabPanelId('budget', activeTab)}
        role="tabpanel"
        aria-labelledby={getTabId('budget', activeTab)}
      >
        {pageContent}
      </div>
      {drawer}
      {deleteDialog}
    </section>
  );
};

export default BudgetsView;
