/**
 * @file 成本优化工作台
 * @description 提供独立成本分析入口、项目筛选、告警降级和分析设置抽屉。
 */
import React, { useMemo, useState } from 'react';
import { AlertCircle, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  CostOptimizationTab,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { getLatestModelSeriesIds } from '../../shared/latestModelSeries';
import { ICON_SIZE_LARGE, ICON_SIZE_SMALL } from '../constants/ui';
import type { SessionDiagnosisDetailModel } from '../utils/sessionDiagnosisDetailState';
import AccessibleTabs, { getTabId, getTabPanelId } from './AccessibleTabs';
import CostAnomalies from './CostAnomalies';
import CostForecast from './CostForecast';
import CostOptimizationOverview from './CostOptimizationOverview';
import CostOptimizationSettingsDrawer from './CostOptimizationSettingsDrawer';
import LoadingSkeleton from './LoadingSkeleton';
import ModelCostComparison from './ModelCostComparison';
import PageHeader from './PageHeader';
import SavingsRecommendations from './SavingsRecommendations';
import SessionDiagnosticsView from './SessionDiagnosticsView';
import StatusBanner from './StatusBanner';
import ToastNotice from './ToastNotice';

export type CostOptimizationContentModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: CostOptimizationSnapshot };

interface CostOptimizationViewProps {
  model: CostOptimizationContentModel;
  projectOptions: string[];
  projectPath: string | null | undefined;
  activeTab: CostOptimizationTab;
  diagnosisId: string | null;
  diagnosisDetailModel: SessionDiagnosisDetailModel;
  onActiveTabChange: (tab: CostOptimizationTab) => void;
  onDiagnosisOpen: (summary: SessionDiagnosisSummary) => void;
  onDiagnosisClose: () => void;
  onProjectPathChange: (projectPath: string | undefined) => void;
  onUpdateSettings: (settings: CostOptimizationSettings) => Promise<unknown>;
}

const COST_OPTIMIZATION_TABS = [
  { key: 'overview', labelKey: 'tabs.overview' },
  { key: 'comparison', labelKey: 'tabs.comparison' },
  { key: 'anomalies', labelKey: 'tabs.anomalies' },
  { key: 'forecast', labelKey: 'tabs.forecast' },
  { key: 'savings', labelKey: 'tabs.savings' },
  { key: 'diagnostics', labelKey: 'tabs.diagnostics' },
] as const satisfies ReadonlyArray<{
  key: CostOptimizationTab;
  labelKey: string;
}>;

const renderCostOptimizationTab = (
  tab: CostOptimizationTab,
  snapshot: CostOptimizationSnapshot,
  diagnosisId: string | null,
  diagnosisDetailModel: SessionDiagnosisDetailModel,
  onDiagnosisOpen: (summary: SessionDiagnosisSummary) => void,
  onDiagnosisClose: () => void
): React.ReactNode => {
  switch (tab) {
    case 'overview':
      return <CostOptimizationOverview snapshot={snapshot} />;
    case 'comparison':
      return (
        <ModelCostComparison rows={snapshot.modelRows} scenarios={snapshot.substitutionScenarios} />
      );
    case 'anomalies':
      return <CostAnomalies anomalies={snapshot.anomalies} />;
    case 'forecast':
      return (
        <CostForecast
          forecast={snapshot.forecast}
          budgets={snapshot.budgets}
          query={snapshot.query}
        />
      );
    case 'savings':
      return (
        <SavingsRecommendations
          recommendations={snapshot.recommendations}
          conservativeSavingsUsd={snapshot.conservativeSavingsUsd}
        />
      );
    case 'diagnostics':
      return (
        <SessionDiagnosticsView
          summaries={snapshot.diagnostics}
          diagnosisId={diagnosisId}
          diagnosisDetailModel={diagnosisDetailModel}
          onDiagnosisOpen={onDiagnosisOpen}
          onDiagnosisClose={onDiagnosisClose}
        />
      );
  }
};

const CostOptimizationView: React.FC<CostOptimizationViewProps> = ({
  model,
  projectOptions,
  projectPath,
  activeTab,
  diagnosisId,
  diagnosisDetailModel,
  onActiveTabChange,
  onDiagnosisOpen,
  onDiagnosisClose,
  onProjectPathChange,
  onUpdateSettings,
}) => {
  const { t } = useTranslation('costOptimization');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const availableCandidateModelIds =
    model.kind === 'ready' ? getLatestModelSeriesIds(model.snapshot.pricing) : [];
  const visibleWarnings = useMemo(
    () =>
      model.kind === 'ready'
        ? model.snapshot.warnings.filter((warning) => !dismissedWarnings.includes(warning))
        : [],
    [dismissedWarnings, model]
  );
  const tabs = COST_OPTIMIZATION_TABS.map((tab) => ({
    value: tab.key,
    label: t(tab.labelKey),
  }));
  const closeSettings = React.useCallback((): void => setSettingsOpen(false), []);
  const dismissToast = React.useCallback((): void => setToastMessage(null), []);
  const handleSettingsSaved = React.useCallback(
    (): void => setToastMessage(t('toast.settingsSaved')),
    [t]
  );
  const headingActions = (
    <div className="cost-optimization-toolbar">
      <label>
        <span>{t('page.project')}</span>
        <select
          value={projectPath ?? ''}
          onChange={(event) => onProjectPathChange(event.target.value || undefined)}
        >
          <option value="">{t('page.allProjects')}</option>
          {projectOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="secondary-button"
        onClick={() => setSettingsOpen(true)}
        disabled={model.kind !== 'ready'}
      >
        <Settings2 size={ICON_SIZE_SMALL} />
        {t('page.analysisSettings')}
      </button>
    </div>
  );

  return (
    <section className="cost-optimization-workspace">
      <PageHeader
        eyebrow={t('page.eyebrow')}
        title={t('page.title')}
        description={t('page.description')}
        actions={headingActions}
      />

      {model.kind === 'loading' ? <LoadingSkeleton label={t('state.loadingTitle')} /> : null}

      {model.kind === 'error' ? (
        <section className="state-panel">
          <AlertCircle size={ICON_SIZE_LARGE} />
          <div>
            <h2>{t('state.unavailable')}</h2>
            <p>{model.message}</p>
          </div>
        </section>
      ) : null}

      {model.kind === 'ready' ? (
        <>
          {model.snapshot.dataState === 'stale' ? (
            <StatusBanner
              tone="warning"
              title={t('page.staleDefault')}
              description={t('page.stale', {
                reason: model.snapshot.staleReason ?? t('page.staleDefault'),
              })}
            />
          ) : null}
          {visibleWarnings.map((warning) => (
            <StatusBanner
              key={warning}
              tone="warning"
              title={t('page.analysisWarning')}
              description={warning}
              actionLabel={t('page.dismissWarning')}
              onAction={() => setDismissedWarnings((current) => [...current, warning])}
            />
          ))}
          <AccessibleTabs
            groupId="cost-optimization"
            label={t('tabs.label')}
            value={activeTab}
            tabs={tabs}
            onChange={onActiveTabChange}
          />
          <div
            id={getTabPanelId('cost-optimization', activeTab)}
            role="tabpanel"
            aria-labelledby={getTabId('cost-optimization', activeTab)}
          >
            {renderCostOptimizationTab(
              activeTab,
              model.snapshot,
              diagnosisId,
              diagnosisDetailModel,
              onDiagnosisOpen,
              onDiagnosisClose
            )}
          </div>
          {settingsOpen ? (
            <CostOptimizationSettingsDrawer
              settings={model.snapshot.settings}
              availableCandidateModelIds={availableCandidateModelIds}
              onClose={closeSettings}
              onSave={onUpdateSettings}
              onSaved={handleSettingsSaved}
            />
          ) : null}
        </>
      ) : null}
      {toastMessage ? <ToastNotice message={toastMessage} onDismiss={dismissToast} /> : null}
    </section>
  );
};

export default CostOptimizationView;
