/**
 * @file 预算工作台
 * @description
 * 统一承载预算加载状态、健康总览、策略管理、模型价格和工作台级设置。
 * 预算数据与写操作由外部内容模型提供，标签选择由应用顶层导航控制。
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Plus, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BudgetPolicy, BudgetSnapshot, BudgetThresholds } from '../../shared/budgetTypes';
import { ICON_SIZE_LARGE, ICON_SIZE_SMALL } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { buildBudgetModelOptions } from '../utils/budgetModelOptions';
import { buildBudgetViewModel, type BudgetFilters } from '../utils/budgetViewModel';
import AccessibleTabs, { getTabId, getTabPanelId } from './AccessibleTabs';
import BudgetAlertBanner from './BudgetAlertBanner';
import BudgetDrawer, { type BudgetDrawerModel } from './BudgetDrawer';
import BudgetList from './BudgetList';
import BudgetSummary from './BudgetSummary';
import ConfirmDialog from './ConfirmDialog';
import LoadingSkeleton from './LoadingSkeleton';
import ModelPricingView from './ModelPricingView';
import PageHeader from './PageHeader';
import StatusBanner from './StatusBanner';
import ToastNotice from './ToastNotice';

export type BudgetTab = 'overview' | 'policies' | 'pricing';

export type BudgetContentModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: BudgetSnapshot };

interface BudgetsViewProps {
  model: BudgetContentModel;
  actions?: BudgetActions;
  activeTab: BudgetTab;
  onActiveTabChange: (tab: BudgetTab) => void;
  focusedPolicyId?: string | null;
  onFocusedPolicyConsumed?: () => void;
}

interface BudgetWorkspaceHeaderProps {
  thresholds?: BudgetThresholds;
  disabled: boolean;
  onOpenSettings?: () => void;
  onAddBudget?: () => void;
}

interface ReadyBudgetWorkspaceProps {
  snapshot: BudgetSnapshot;
  actions: BudgetActions;
  activeTab: BudgetTab;
  onActiveTabChange: (tab: BudgetTab) => void;
  focusedPolicyId?: string | null;
  onFocusedPolicyConsumed?: () => void;
}

const DEFAULT_FILTERS: BudgetFilters = { scope: 'all', period: 'all' };

type BudgetEditorModel = { kind: 'closed' } | BudgetDrawerModel;

const BUDGET_TABS = [
  { key: 'overview', labelKey: 'page.overview' },
  { key: 'policies', labelKey: 'page.policies' },
  { key: 'pricing', labelKey: 'page.pricing' },
] as const satisfies ReadonlyArray<{
  key: BudgetTab;
  labelKey: string;
}>;

const BudgetWorkspaceHeader: React.FC<BudgetWorkspaceHeaderProps> = ({
  thresholds,
  disabled,
  onOpenSettings,
  onAddBudget,
}) => {
  const { t } = useTranslation('budgets');
  const thresholdSummary = thresholds ? (
    <div className="budget-thresholds" aria-label={t('page.alertThresholds')}>
      <span>{t('page.warningThreshold', { percent: thresholds.warningPercent })}</span>
      <span>{t('page.criticalThreshold', { percent: thresholds.criticalPercent })}</span>
    </div>
  ) : null;
  const actions = (
    <div className="budget-workspace-toolbar">
      {thresholdSummary}
      <button
        type="button"
        className="secondary-button icon-command"
        onClick={onOpenSettings}
        disabled={disabled}
      >
        <Settings2 size={ICON_SIZE_SMALL} />
        {t('page.settings')}
      </button>
      <button
        type="button"
        className="primary-button icon-command"
        onClick={onAddBudget}
        disabled={disabled}
      >
        <Plus size={ICON_SIZE_SMALL} />
        {t('page.addBudget')}
      </button>
    </div>
  );

  return (
    <PageHeader
      eyebrow={t('page.eyebrow')}
      title={t('page.title')}
      description={t('page.description')}
      actions={actions}
    />
  );
};

const ReadyBudgetWorkspace: React.FC<ReadyBudgetWorkspaceProps> = ({
  snapshot,
  actions,
  activeTab,
  onActiveTabChange,
  focusedPolicyId,
  onFocusedPolicyConsumed,
}) => {
  const { t } = useTranslation('budgets');
  const { t: tCommon } = useTranslation('common');
  const [filters, setFilters] = useState<BudgetFilters>(DEFAULT_FILTERS);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(() => new Set());
  const [editorModel, setEditorModel] = useState<BudgetEditorModel>({ kind: 'closed' });
  const [deletePolicy, setDeletePolicy] = useState<BudgetPolicy | null>(null);
  const [pricingTarget, setPricingTarget] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const viewModel = useMemo(() => buildBudgetViewModel(snapshot, filters), [filters, snapshot]);
  const modelOptions = useMemo(
    () => buildBudgetModelOptions(snapshot.pricing, snapshot.unpricedModels),
    [snapshot.pricing, snapshot.unpricedModels]
  );
  const visibleAlerts = viewModel.alerts.filter(({ id }) => !dismissedAlertIds.has(id));
  const showStaleWarning = snapshot.dataState === 'stale';
  const tabs = BUDGET_TABS.map((tab) => ({
    value: tab.key,
    label: t(tab.labelKey),
  }));

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

    onActiveTabChange('policies');
    const focusedStatus = snapshot.statuses.find(({ policy }) => policy.id === focusedPolicyId);

    if (focusedStatus) {
      setEditorModel({ kind: 'policy', policy: focusedStatus.policy });
    }

    onFocusedPolicyConsumed?.();
  }, [focusedPolicyId, onActiveTabChange, onFocusedPolicyConsumed, snapshot.statuses]);

  const closeEditor = useCallback((): void => setEditorModel({ kind: 'closed' }), []);
  const dismissToast = useCallback((): void => setToastMessage(null), []);
  const handleSaved = useCallback((): void => setToastMessage(t('toast.saved')), [t]);
  const clearPricingTarget = useCallback((): void => setPricingTarget(null), []);

  const handleDismissAlert = (alertId: string): void => {
    setDismissedAlertIds((current) => new Set([...current, alertId]));
  };

  const handleAddBudget = (): void => {
    onActiveTabChange('policies');
    setEditorModel({ kind: 'policy' });
  };

  const handleAddPrice = (modelId: string): void => {
    onActiveTabChange('pricing');
    setPricingTarget(modelId);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!deletePolicy) {
      return;
    }

    await actions.deletePolicy(deletePolicy.id);
    setDeletePolicy(null);
  };

  const overviewContent = (
    <div className="budget-overview-workspace">
      <BudgetSummary summary={viewModel.summary} policyCount={snapshot.statuses.length} />
      <BudgetAlertBanner
        alerts={visibleAlerts}
        unpricedModels={snapshot.unpricedModels}
        onDismiss={handleDismissAlert}
        onAddPrice={handleAddPrice}
      />
    </div>
  );
  const policiesContent = (
    <div className="budget-policies-workspace">
      <div className="filter-bar budget-filter-bar">
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
        groups={viewModel.groups}
        onEdit={(policy) => setEditorModel({ kind: 'policy', policy })}
        onDelete={setDeletePolicy}
      />
    </div>
  );
  const pricingContent = (
    <ModelPricingView
      pricing={snapshot.pricing}
      unpricedModels={snapshot.unpricedModels}
      unknownModelPricing={snapshot.unknownModelPricing}
      actions={actions}
      initialModelId={pricingTarget}
      onInitialModelConsumed={clearPricingTarget}
    />
  );

  const renderActiveTab = (): React.ReactNode => {
    switch (activeTab) {
      case 'overview':
        return overviewContent;
      case 'policies':
        return policiesContent;
      case 'pricing':
        return pricingContent;
    }
  };

  const drawer =
    editorModel.kind === 'closed' ? null : (
      <BudgetDrawer
        model={editorModel}
        modelOptions={modelOptions}
        thresholds={snapshot.thresholds}
        actions={actions}
        onClose={closeEditor}
        onSaved={handleSaved}
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

  return (
    <>
      <BudgetWorkspaceHeader
        thresholds={snapshot.thresholds}
        disabled={false}
        onOpenSettings={() => setEditorModel({ kind: 'thresholds' })}
        onAddBudget={handleAddBudget}
      />

      {showStaleWarning ? (
        <StatusBanner
          tone="warning"
          title={tCommon('state.showingPreviousData')}
          description={t('page.stale', {
            reason: snapshot.staleReason ?? t('page.staleDefault'),
          })}
        />
      ) : null}

      <AccessibleTabs
        groupId="budget"
        label={t('page.views')}
        value={activeTab}
        tabs={tabs}
        onChange={onActiveTabChange}
      />
      <div
        id={getTabPanelId('budget', activeTab)}
        role="tabpanel"
        aria-labelledby={getTabId('budget', activeTab)}
      >
        {renderActiveTab()}
      </div>
      {drawer}
      {deleteDialog}
      {toastMessage ? <ToastNotice message={toastMessage} onDismiss={dismissToast} /> : null}
    </>
  );
};

const BudgetsView: React.FC<BudgetsViewProps> = ({
  model,
  actions,
  activeTab,
  onActiveTabChange,
  focusedPolicyId,
  onFocusedPolicyConsumed,
}) => {
  const { t } = useTranslation('budgets');

  if (model.kind === 'loading') {
    return (
      <section className="budgets-page budget-workspace">
        <BudgetWorkspaceHeader disabled />
        <LoadingSkeleton label={t('state.loadingTitle')} />
      </section>
    );
  }

  if (model.kind === 'error' || !actions) {
    const message = model.kind === 'error' ? model.message : t('state.actionsUnavailable');

    return (
      <section className="budgets-page budget-workspace">
        <BudgetWorkspaceHeader disabled />
        <section className="state-panel">
          <AlertCircle size={ICON_SIZE_LARGE} />
          <div>
            <h2>{t('state.unavailable')}</h2>
            <p>{message}</p>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="budgets-page budget-workspace">
      <ReadyBudgetWorkspace
        snapshot={model.snapshot}
        actions={actions}
        activeTab={activeTab}
        onActiveTabChange={onActiveTabChange}
        focusedPolicyId={focusedPolicyId}
        onFocusedPolicyConsumed={onFocusedPolicyConsumed}
      />
    </section>
  );
};

export default BudgetsView;
