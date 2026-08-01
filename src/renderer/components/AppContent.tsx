import React from 'react';
import type { TFunction } from 'i18next';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CostOptimizationSettings,
  CostOptimizationSnapshot,
  CostOptimizationTab,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { ICON_SIZE_LARGE } from '../constants/ui';
import type { BudgetSnapshot } from '../../shared/budgetTypes';
import type { BudgetActions } from '../hooks/useBudgetSnapshot';
import type { AppContentModel } from '../utils/appContentModel';
import type { SessionDiagnosisDetailModel } from '../utils/sessionDiagnosisDetailState';
import BudgetsView from './BudgetsView';
import CostOptimizationView, { type CostOptimizationContentModel } from './CostOptimizationView';
import EmptyState from './EmptyState';
import Overview from './Overview';
import PeriodEmptyState from './PeriodEmptyState';
import PerformanceView from './PerformanceView';
import ProjectsView from './ProjectsView';
import SessionsView from './SessionsView';
import SettingsView from './SettingsView';
import type { ViewKey } from './Sidebar';

interface AppContentProps {
  activeView: ViewKey;
  model: AppContentModel;
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
}

export type BudgetContentModel =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snapshot: BudgetSnapshot };

const IDLE_DIAGNOSIS_DETAIL_MODEL: SessionDiagnosisDetailModel = { kind: 'idle' };
const EMPTY_DIAGNOSTICS: SessionDiagnosisSummary[] = [];
const ignoreCostOptimizationTab = (): void => undefined;
const ignoreDiagnosis = (): void => undefined;

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
  model,
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
}) => {
  const { t } = useTranslation('common');

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

  const pricing = budgetModel?.kind === 'ready' ? budgetModel.snapshot.pricing : [];

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
      return (
        <section className="state-panel">
          <div className="loader" />
          <div>
            <h2>{t('state.scanningTitle')}</h2>
            <p>{t('state.scanningDescription')}</p>
          </div>
        </section>
      );
    case 'empty':
      return <EmptyState sessionsDir={model.result.sessionsDir} warnings={model.result.warnings} />;
    case 'period-empty':
      return <PeriodEmptyState period={model.period} />;
    case 'ready':
      return (
        <>
          {activeView === 'overview' ? (
            <Overview summary={model.summary} pricing={pricing} />
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
            <PerformanceView summary={model.summary} pricing={pricing} />
          ) : null}
          {activeView === 'wrapped' ? <SettingsView result={model.result} /> : null}
        </>
      );
    case 'idle':
      return null;
  }
};

export default AppContent;
