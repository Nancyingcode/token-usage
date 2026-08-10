/**
 * @file 应用内容编排
 * @description 根据扫描、预算和成本优化状态组织顶层页面模型及互斥内容分支。
 */
import React from 'react';
import type { TFunction } from 'i18next';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import type { UsagePeriod } from '../../shared/usageTypes';
import type { UsageDataPathSettings } from '../../shared/usageDataPathTypes';
import type {
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  CostOptimizationTab,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_LARGE } from '../constants/ui';
import type { BudgetSnapshot } from '../../shared/budgetTypes';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { resolveRendererLocale } from '../i18n';
import type { AppContentModel, AppFreshness } from '../utils/appContentModel';
import { formatShortDateTime } from '../utils/formatters';
import type { SessionDiagnosisDetailModel } from '../utils/sessionDiagnosisDetailState';
import BudgetsView from './BudgetsView';
import CostOptimizationView, { type CostOptimizationContentModel } from './CostOptimizationView';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';
import Overview from './Overview';
import PeriodEmptyState from './PeriodEmptyState';
import PerformanceView from './PerformanceView';
import ProjectsView from './ProjectsView';
import SessionsView from './SessionsView';
import SettingsView from './SettingsView';
import type { ViewKey } from './Sidebar';
import StatusBanner from './StatusBanner';

interface AppContentProps {
  activeView: ViewKey;
  period: UsagePeriod;
  model: AppContentModel;
  onRefresh: () => void;
  onProjectSelect: (projectPath: string) => void;
  selectedProjectPath: string | null;
  onClearProjectFilter: () => void;
  budgetModel?: BudgetContentModel;
  budgetActions?: BudgetActions;
  focusedPolicyId?: string | null;
  onFocusedPolicyConsumed?: () => void;
  costOptimizationModel?: CostOptimizationContentModel;
  costProjectOptions?: string[];
  costProjectPath?: string | null;
  costOptimizationTab?: CostOptimizationTab;
  diagnosisId?: string | null;
  diagnosisDetailModel?: SessionDiagnosisDetailModel;
  globalDiagnostics?: SessionDiagnosisSummary[];
  onCostOptimizationTabChange?: (tab: CostOptimizationTab) => void;
  onDiagnosisOpen?: (summary: SessionDiagnosisSummary) => void;
  onDiagnosisClose?: () => void;
  onCostProjectPathChange?: (projectPath: string | undefined) => void;
  onCostSettingsUpdate?: (settings: CostOptimizationSettings) => Promise<CostOptimizationSnapshot>;
  dataPathSettings?: UsageDataPathSettings;
  onSelectDataPath?: () => Promise<string | null>;
  onUpdateDataPath?: (sessionsDir: string) => Promise<unknown>;
  onResetDataPath?: () => Promise<unknown>;
}

export type BudgetContentModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: BudgetSnapshot };

const IDLE_DIAGNOSIS_DETAIL_MODEL: SessionDiagnosisDetailModel = { kind: 'idle' };
const EMPTY_DIAGNOSTICS: SessionDiagnosisSummary[] = [];
const ignoreCostOptimizationTab = (): void => undefined;
const ignoreDiagnosis = (): void => undefined;
const ignoreDataPathUpdate = async (): Promise<void> => undefined;
const ignoreDataPathSelect = async (): Promise<null> => null;

const renderFreshnessBanner = (
  freshness: AppFreshness,
  scannedAt: string,
  onRefresh: () => void,
  t: TFunction<'common'>,
  locale: SupportedLocale
): React.ReactNode => {
  if (freshness.refreshing) {
    return (
      <StatusBanner
        tone="info"
        title={t('toolbar.scanState.scanning')}
        description={t('state.refreshingData')}
      />
    );
  }

  if (freshness.staleReason === null) {
    return null;
  }

  const scannedAtLabel = formatShortDateTime(scannedAt, locale, t('value.unknownDate'));

  return (
    <StatusBanner
      tone="warning"
      title={t('state.showingPreviousData')}
      description={t('state.previousDataDescription', {
        scannedAt: scannedAtLabel,
        reason: freshness.staleReason,
      })}
      actionLabel={t('state.retryScan')}
      onAction={onRefresh}
    />
  );
};

const renderBudgetContent = (
  model: BudgetContentModel | undefined,
  actions: BudgetActions | undefined,
  focusedPolicyId: string | null | undefined,
  onFocusedPolicyConsumed: (() => void) | undefined,
  t: TFunction<'common'>
): React.ReactNode => {
  if (!model || model.kind === 'loading') {
    return (
      <section className="state-panel">
        <div className="loader" />
        <div>
          <h2>{t('state.budgetLoadingTitle')}</h2>
          <p>{t('state.budgetLoadingDescription')}</p>
        </div>
      </section>
    );
  }

  if (model.kind === 'error') {
    return (
      <section className="state-panel">
        <AlertCircle size={ICON_SIZE_LARGE} />
        <div>
          <h2>{t('state.budgetUnavailable')}</h2>
          <p>{model.message}</p>
        </div>
      </section>
    );
  }

  return actions ? (
    <BudgetsView
      snapshot={model.snapshot}
      actions={actions}
      focusedPolicyId={focusedPolicyId}
      onFocusedPolicyConsumed={onFocusedPolicyConsumed}
    />
  ) : (
    <section className="panel budget-placeholder">
      <h3>{t('state.budgetCenter')}</h3>
      <p>{t('item.budgetPolicies', { count: model.snapshot.statuses.length })}</p>
    </section>
  );
};

const AppContent: React.FC<AppContentProps> = ({
  activeView,
  period,
  model,
  onRefresh,
  onProjectSelect,
  selectedProjectPath,
  onClearProjectFilter,
  budgetModel,
  budgetActions,
  focusedPolicyId,
  onFocusedPolicyConsumed,
  costOptimizationModel,
  costProjectOptions = [],
  costProjectPath,
  costOptimizationTab = 'overview',
  diagnosisId = null,
  diagnosisDetailModel = IDLE_DIAGNOSIS_DETAIL_MODEL,
  globalDiagnostics = EMPTY_DIAGNOSTICS,
  onCostOptimizationTabChange = ignoreCostOptimizationTab,
  onDiagnosisOpen = ignoreDiagnosis,
  onDiagnosisClose = ignoreDiagnosis,
  onCostProjectPathChange,
  onCostSettingsUpdate,
  dataPathSettings,
  onSelectDataPath = ignoreDataPathSelect,
  onUpdateDataPath = ignoreDataPathUpdate,
  onResetDataPath = ignoreDataPathUpdate,
}) => {
  const { t, i18n } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);

  if (activeView === 'budgets') {
    return renderBudgetContent(
      budgetModel,
      budgetActions,
      focusedPolicyId,
      onFocusedPolicyConsumed,
      t
    );
  }

  if (activeView === 'costOptimization') {
    return (
      <CostOptimizationView
        model={costOptimizationModel ?? { kind: 'loading' }}
        projectOptions={costProjectOptions}
        projectPath={costProjectPath}
        activeTab={costOptimizationTab}
        onActiveTabChange={onCostOptimizationTabChange}
        diagnosisId={diagnosisId}
        diagnosisDetailModel={diagnosisDetailModel}
        onDiagnosisOpen={onDiagnosisOpen}
        onDiagnosisClose={onDiagnosisClose}
        onProjectPathChange={onCostProjectPathChange ?? (() => undefined)}
        onUpdateSettings={onCostSettingsUpdate ?? (async () => undefined)}
      />
    );
  }

  if (activeView === 'wrapped') {
    const result = 'result' in model ? model.result : undefined;
    const effectiveDataPathSettings =
      dataPathSettings ??
      (result
        ? {
            sessionsDir: result.sessionsDir,
            defaultSessionsDir: result.sessionsDir,
            usingDefault: true,
          }
        : undefined);

    if (!effectiveDataPathSettings) {
      return <LoadingSkeleton label={t('state.scanningTitle')} />;
    }

    const scanError =
      model.kind === 'error'
        ? model.message
        : 'freshness' in model
          ? (model.freshness.staleReason ?? undefined)
          : undefined;

    return (
      <SettingsView
        result={result}
        dataPathSettings={effectiveDataPathSettings}
        scanError={scanError}
        onSelectDataPath={onSelectDataPath}
        onUpdateDataPath={onUpdateDataPath}
        onResetDataPath={onResetDataPath}
      />
    );
  }

  const pricing = budgetModel?.kind === 'ready' ? budgetModel.snapshot.pricing : [];
  const unknownModelPricing =
    budgetModel?.kind === 'ready' ? budgetModel.snapshot.unknownModelPricing : undefined;

  switch (model.kind) {
    case 'error':
      return (
        <section className="state-panel">
          <AlertCircle size={ICON_SIZE_LARGE} />
          <div>
            <h2>{t('state.scanFailed')}</h2>
            <p>{model.message}</p>
          </div>
        </section>
      );
    case 'loading':
      return <LoadingSkeleton label={t('state.scanningTitle')} />;
    case 'empty':
      return (
        <>
          {renderFreshnessBanner(model.freshness, model.result.scannedAt, onRefresh, t, locale)}
          <EmptyState sessionsDir={model.result.sessionsDir} warnings={model.result.warnings} />
        </>
      );
    case 'period-empty':
      return (
        <>
          {renderFreshnessBanner(model.freshness, model.result.scannedAt, onRefresh, t, locale)}
          <PeriodEmptyState period={model.period} />
        </>
      );
    case 'ready':
      return (
        <>
          {renderFreshnessBanner(model.freshness, model.result.scannedAt, onRefresh, t, locale)}
          {activeView === 'overview' ? (
            <Overview
              summary={model.summary}
              pricing={pricing}
              unknownModelPricing={unknownModelPricing}
              period={period}
              scannedAt={model.result.scannedAt}
            />
          ) : null}
          {activeView === 'sessions' ? (
            <SessionsView
              sessions={model.summary.sessions}
              selectedProjectPath={selectedProjectPath}
              onClearProjectFilter={onClearProjectFilter}
              globalDiagnostics={globalDiagnostics}
              onDiagnosisOpen={onDiagnosisOpen}
            />
          ) : null}
          {activeView === 'tools' ? (
            <ProjectsView projects={model.summary.byProject} onProjectSelect={onProjectSelect} />
          ) : null}
          {activeView === 'performance' ? (
            <PerformanceView
              summary={model.summary}
              pricing={pricing}
              unknownModelPricing={unknownModelPricing}
            />
          ) : null}
        </>
      );
    case 'idle':
      return null;
  }
};

export default AppContent;
