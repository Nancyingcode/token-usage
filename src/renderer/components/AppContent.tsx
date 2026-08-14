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
import type { ThemePreference, ThemeSnapshot } from '../../shared/theme';
import type { ThemeFeedback } from '../hooks/useTheme';
import type {
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  CostOptimizationTab,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_LARGE } from '../constants/ui';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import { resolveRendererLocale } from '../i18n';
import type { AppContentModel, AppFreshness } from '../utils/appContentModel';
import { formatShortDateTime } from '../utils/formatters';
import type { SessionDiagnosisDetailModel } from '../utils/sessionDiagnosisDetailState';
import type BudgetsViewComponent from './BudgetsView';
import type { BudgetContentModel, BudgetTab } from './BudgetsView';
import type CostOptimizationViewComponent from './CostOptimizationView';
import type { CostOptimizationContentModel } from './CostOptimizationView';
import EmptyState from './EmptyState';
import LazyPageBoundary from './LazyPageBoundary';
import LoadingSkeleton from './LoadingSkeleton';
import Overview from './Overview';
import type PerformanceViewComponent from './PerformanceView';
import PeriodEmptyState from './PeriodEmptyState';
import type ProjectsViewComponent from './ProjectsView';
import type SessionsViewComponent from './SessionsView';
import type SettingsViewComponent from './SettingsView';
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
  budgetTab?: BudgetTab;
  onBudgetTabChange?: (tab: BudgetTab) => void;
  focusedPolicyId?: string | null;
  onFocusedPolicyConsumed?: () => void;
  costOptimizationModel?: CostOptimizationContentModel;
  costProjectOptions?: string[];
  costProjectOptionsLoading?: boolean;
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
  themeSnapshot?: ThemeSnapshot;
  themePending?: boolean;
  themeFeedback?: ThemeFeedback;
  onThemeChange?: (preference: ThemePreference) => Promise<void>;
  views?: AppContentViews;
}

export interface AppContentViews {
  BudgetsView: typeof BudgetsViewComponent;
  CostOptimizationView: typeof CostOptimizationViewComponent;
  SessionsView: typeof SessionsViewComponent;
  ProjectsView: typeof ProjectsViewComponent;
  PerformanceView: typeof PerformanceViewComponent;
  SettingsView: typeof SettingsViewComponent;
}

const IDLE_DIAGNOSIS_DETAIL_MODEL: SessionDiagnosisDetailModel = { kind: 'idle' };
const EMPTY_DIAGNOSTICS: SessionDiagnosisSummary[] = [];
const ignoreBudgetTab = (): void => undefined;
const ignoreCostOptimizationTab = (): void => undefined;
const ignoreDiagnosis = (): void => undefined;
const ignoreDataPathUpdate = async (): Promise<void> => undefined;
const ignoreDataPathSelect = async (): Promise<null> => null;
const ignoreThemeChange = async (): Promise<void> => undefined;
const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
  preference: 'system',
  resolvedTheme: 'mint-light',
};

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
  budgetTab = 'overview',
  onBudgetTabChange = ignoreBudgetTab,
  focusedPolicyId,
  onFocusedPolicyConsumed,
  costOptimizationModel,
  costProjectOptions = [],
  costProjectOptionsLoading = false,
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
  themeSnapshot = DEFAULT_THEME_SNAPSHOT,
  themePending = false,
  themeFeedback = null,
  onThemeChange = ignoreThemeChange,
  views,
}) => {
  const { t, i18n } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const pageFallback = <LoadingSkeleton label={t('state.scanningTitle')} />;

  if (activeView === 'budgets') {
    if (!views) {
      return pageFallback;
    }

    const { BudgetsView } = views;
    return (
      <LazyPageBoundary fallback={pageFallback}>
        <BudgetsView
          model={budgetModel ?? { kind: 'loading' }}
          actions={budgetActions}
          activeTab={budgetTab}
          onActiveTabChange={onBudgetTabChange}
          focusedPolicyId={focusedPolicyId}
          onFocusedPolicyConsumed={onFocusedPolicyConsumed}
        />
      </LazyPageBoundary>
    );
  }

  if (activeView === 'costOptimization') {
    if (!views) {
      return pageFallback;
    }

    const { CostOptimizationView } = views;
    return (
      <LazyPageBoundary fallback={pageFallback}>
        <CostOptimizationView
          model={costOptimizationModel ?? { kind: 'loading' }}
          projectOptions={costProjectOptions}
          projectOptionsLoading={costProjectOptionsLoading}
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
      </LazyPageBoundary>
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

    if (!views) {
      return pageFallback;
    }

    const scanError =
      model.kind === 'error'
        ? model.message
        : 'freshness' in model
          ? (model.freshness.staleReason ?? undefined)
          : undefined;

    const { SettingsView } = views;
    return (
      <LazyPageBoundary fallback={pageFallback}>
        <SettingsView
          result={result}
          dataPathSettings={effectiveDataPathSettings}
          scanError={scanError}
          onSelectDataPath={onSelectDataPath}
          onUpdateDataPath={onUpdateDataPath}
          onResetDataPath={onResetDataPath}
          themeSnapshot={themeSnapshot}
          themePending={themePending}
          themeFeedback={themeFeedback}
          onThemeChange={onThemeChange}
        />
      </LazyPageBoundary>
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
    case 'ready': {
      const SessionsView = views?.SessionsView;
      const ProjectsView = views?.ProjectsView;
      const PerformanceView = views?.PerformanceView;
      const showSessions = activeView === 'sessions' && SessionsView !== undefined;
      const showProjects = activeView === 'tools' && ProjectsView !== undefined;
      const showPerformance = activeView === 'performance' && PerformanceView !== undefined;
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
          {showSessions ? (
            <LazyPageBoundary fallback={pageFallback}>
              <SessionsView
                sessions={model.summary.sessions}
                selectedProjectPath={selectedProjectPath}
                onProjectFilterChange={onProjectSelect}
                onClearProjectFilter={onClearProjectFilter}
                globalDiagnostics={globalDiagnostics}
                onDiagnosisOpen={onDiagnosisOpen}
              />
            </LazyPageBoundary>
          ) : null}
          {showProjects ? (
            <LazyPageBoundary fallback={pageFallback}>
              <ProjectsView projects={model.summary.byProject} onProjectSelect={onProjectSelect} />
            </LazyPageBoundary>
          ) : null}
          {showPerformance ? (
            <LazyPageBoundary fallback={pageFallback}>
              <PerformanceView
                summary={model.summary}
                pricing={pricing}
                unknownModelPricing={unknownModelPricing}
              />
            </LazyPageBoundary>
          ) : null}
        </>
      );
    }
    case 'idle':
      return null;
  }
};

export default AppContent;
