/**
 * @file Session usage list
 * @description Displays session token details and the transient project drilldown filter.
 */
import React from 'react';
import { AlertTriangle, CircleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  SessionDiagnosisCause,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { getProjectName } from '../../shared/usageMath';
import type { UsageSession } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';
import { getStaggeredMotionStyle } from '../utils/motion';
import { selectProjectSessions } from '../utils/projectSessions';
import PageHeader from './PageHeader';

interface SessionsViewProps {
  sessions: UsageSession[];
  selectedProjectPath: string | null;
  onClearProjectFilter: () => void;
  globalDiagnostics?: SessionDiagnosisSummary[];
  onDiagnosisOpen?: (summary: SessionDiagnosisSummary) => void;
}

interface ProjectFilterChipProps {
  projectPath: string;
  label: string;
  clearLabel: string;
  onClear: () => void;
}

const SHORT_ID_MAX_LENGTH = 12;
const SHORT_ID_PREFIX_LENGTH = 8;
const SHORT_ID_SUFFIX_LENGTH = 4;

const CAUSE_KEYS: Record<
  SessionDiagnosisCause,
  | 'diagnostics.cause.inputGrowth'
  | 'diagnostics.cause.cacheDegradation'
  | 'diagnostics.cause.generationConcentration'
  | 'diagnostics.cause.modelCostDominance'
  | 'diagnostics.cause.interactionAccumulation'
> = {
  'input-growth': 'diagnostics.cause.inputGrowth',
  'cache-degradation': 'diagnostics.cause.cacheDegradation',
  'generation-concentration': 'diagnostics.cause.generationConcentration',
  'model-cost-dominance': 'diagnostics.cause.modelCostDominance',
  'interaction-accumulation': 'diagnostics.cause.interactionAccumulation',
};

export const ProjectFilterChip: React.FC<ProjectFilterChipProps> = ({
  projectPath,
  label,
  clearLabel,
  onClear,
}) => (
  <button
    type="button"
    className="project-filter-chip"
    title={projectPath}
    aria-label={clearLabel}
    onClick={onClear}
  >
    <span>{label}</span>
    <X size={ICON_SIZE_SMALL} aria-hidden="true" />
  </button>
);

const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  selectedProjectPath,
  onClearProjectFilter,
  globalDiagnostics = [],
  onDiagnosisOpen = () => undefined,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const { t: tCostOptimization } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const filteredSessions = React.useMemo(
    () => selectProjectSessions(sessions, selectedProjectPath),
    [selectedProjectPath, sessions]
  );
  const diagnosisBySource = React.useMemo(
    () => new Map(globalDiagnostics.map((summary) => [summary.sourceFile, summary])),
    [globalDiagnostics]
  );
  const hasProjectFilter = selectedProjectPath !== null;
  const projectName = hasProjectFilter ? getProjectName(selectedProjectPath) : '';
  const showFilteredEmpty = hasProjectFilter && filteredSessions.length === 0;
  const sessionCountLabel = hasProjectFilter
    ? t('sessions.filteredCount', { count: filteredSessions.length })
    : t('sessions.count', { count: filteredSessions.length });
  const motionKey = selectedProjectPath ?? 'all-sessions';

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t('sessions.eyebrow')}
        title={t('sessions.title')}
        description={t('sessions.description')}
        actions={
          <>
            <span>{sessionCountLabel}</span>
            {hasProjectFilter ? (
              <ProjectFilterChip
                projectPath={selectedProjectPath}
                label={t('sessions.projectFilter', { project: projectName })}
                clearLabel={t('sessions.clearProjectFilter', { project: projectName })}
                onClear={onClearProjectFilter}
              />
            ) : null}
          </>
        }
      />
      <div
        key={motionKey}
        className="panel table-panel data-table session-table"
        data-motion-key={motionKey}
      >
        <div className="table-row table-head">
          <span>{t('sessions.session')}</span>
          <span>{t('sessions.project')}</span>
          <span>{t('sessions.date')}</span>
          <span className="table-cell--numeric">{t('sessions.input')}</span>
          <span className="table-cell--numeric">{t('sessions.cached')}</span>
          <span className="table-cell--numeric">{t('sessions.output')}</span>
          <span className="table-cell--numeric">{t('sessions.total')}</span>
          <span>{t('sessions.status')}</span>
        </div>
        {showFilteredEmpty ? (
          <div className="session-filter-empty">
            <h4>{t('sessions.filteredEmptyTitle')}</h4>
            <p>{t('sessions.filteredEmptyDescription')}</p>
            <button type="button" onClick={onClearProjectFilter}>
              {t('sessions.showAll')}
            </button>
          </div>
        ) : (
          filteredSessions.map((session, index) => {
            const diagnosis = diagnosisBySource.get(session.sourceFile);
            const finding = diagnosis?.primaryFinding;
            const diagnosisAction =
              diagnosis && finding
                ? {
                    diagnosis,
                    finding,
                    cause: tCostOptimization(CAUSE_KEYS[finding.cause]),
                    Icon: finding.severity === 'critical' ? CircleAlert : AlertTriangle,
                  }
                : undefined;

            return (
              <div
                className="table-row motion-list-item"
                key={session.sourceFile}
                style={getStaggeredMotionStyle(index)}
              >
                <span className="primary-cell session-primary-cell" title={session.sessionId}>
                  <span>{session.threadName || shortId(session.sessionId)}</span>
                  {diagnosisAction ? (
                    <button
                      type="button"
                      className={`session-diagnosis-badge ${diagnosisAction.finding.severity}`}
                      aria-label={tCostOptimization('diagnostics.sessions.open', {
                        cause: diagnosisAction.cause,
                      })}
                      onClick={() => onDiagnosisOpen(diagnosisAction.diagnosis)}
                    >
                      <diagnosisAction.Icon size={ICON_SIZE_SMALL} aria-hidden="true" />
                      <span>{diagnosisAction.cause}</span>
                    </button>
                  ) : null}
                </span>
                <span title={session.projectPath}>{session.projectName}</span>
                <span>
                  {formatShortDateTime(session.startedAt, locale, tCommon('value.unknownDate'))}
                </span>
                <span className="table-cell--numeric">
                  {formatNumber(session.inputTokens, locale)}
                </span>
                <span className="table-cell--numeric">
                  {formatNumber(session.cachedInputTokens, locale)}
                </span>
                <span className="table-cell--numeric">
                  {formatNumber(session.outputTokens, locale)}
                </span>
                <span className="table-cell--numeric">
                  {formatNumber(session.totalTokens, locale)}
                </span>
                <span className={session.warnings.length ? 'warning-cell' : 'ok-cell'}>
                  {session.warnings.length ? <AlertTriangle size={ICON_SIZE_SMALL} /> : null}
                  {session.warnings.length
                    ? tCommon('item.warnings', { count: session.warnings.length })
                    : tCommon('value.ok')}
                </span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

const shortId = (id: string): string => {
  return id.length > SHORT_ID_MAX_LENGTH
    ? `${id.slice(0, SHORT_ID_PREFIX_LENGTH)}...${id.slice(-SHORT_ID_SUFFIX_LENGTH)}`
    : id;
};

export default SessionsView;
