/**
 * @file 会话用量列表
 * @description 展示可组合筛选、分页和主要诊断入口，同时保留项目下钻状态。
 */
import React from 'react';
import { AlertTriangle, CircleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  SessionDiagnosisCause,
  SessionDiagnosisSeverity,
  SessionDiagnosisSummary,
} from '../../shared/costOptimizationTypes';
import { getProjectName, UNKNOWN_PROJECT_KEY } from '../../shared/usageMath';
import type { UsageSession } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';
import { getStaggeredMotionStyle } from '../utils/motion';
import {
  filterSessionList,
  getSessionProjectOptions,
  paginateSessionList,
  type SessionDiagnosisCauseFilter,
} from '../utils/sessionListFilters';
import {
  DEFAULT_SESSION_PAGE_SIZE,
  isSessionPageSize,
  loadSessionPageSizePreference,
  saveSessionPageSizePreference,
  SESSION_PAGE_SIZE_OPTIONS,
  type SessionPageSize,
} from '../utils/sessionPageSizePreference';
import PageHeader from './PageHeader';

interface SessionsViewProps {
  sessions: UsageSession[];
  selectedProjectPath: string | null;
  onProjectFilterChange?: (projectPath: string) => void;
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

const CAUSES: SessionDiagnosisCause[] = [
  'input-growth',
  'cache-degradation',
  'generation-concentration',
  'model-cost-dominance',
  'interaction-accumulation',
];
const SEVERITIES: SessionDiagnosisSeverity[] = ['warning', 'critical'];

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

const loadInitialPageSize = (): SessionPageSize =>
  typeof window === 'undefined'
    ? DEFAULT_SESSION_PAGE_SIZE
    : loadSessionPageSizePreference(window.localStorage);

const SessionsView: React.FC<SessionsViewProps> = ({
  sessions,
  selectedProjectPath,
  onProjectFilterChange = () => undefined,
  onClearProjectFilter,
  globalDiagnostics = [],
  onDiagnosisOpen = () => undefined,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const { t: tCostOptimization } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [query, setQuery] = React.useState('');
  const [cause, setCause] = React.useState<SessionDiagnosisCauseFilter>('all');
  const [severity, setSeverity] = React.useState<SessionDiagnosisSeverity | 'all'>('all');
  const [pageSize, setPageSize] = React.useState<SessionPageSize>(loadInitialPageSize);
  const [currentPage, setCurrentPage] = React.useState(1);
  const diagnosisBySource = React.useMemo(
    () => new Map(globalDiagnostics.map((summary) => [summary.sourceFile, summary])),
    [globalDiagnostics]
  );
  const projectOptions = React.useMemo(() => {
    const options = getSessionProjectOptions(sessions);

    if (
      selectedProjectPath !== null &&
      !options.some(({ projectPath }) => projectPath === selectedProjectPath)
    ) {
      return [
        ...options,
        { projectPath: selectedProjectPath, projectName: getProjectName(selectedProjectPath) },
      ];
    }

    return options;
  }, [selectedProjectPath, sessions]);
  const filteredSessions = React.useMemo(
    () =>
      filterSessionList({
        sessions,
        diagnostics: globalDiagnostics,
        filters: { query, projectPath: selectedProjectPath, cause, severity },
      }),
    [cause, globalDiagnostics, query, selectedProjectPath, sessions, severity]
  );
  const pagination = React.useMemo(
    () => paginateSessionList(filteredSessions, currentPage, pageSize),
    [currentPage, filteredSessions, pageSize]
  );
  const hasProjectFilter = selectedProjectPath !== null;
  const hasLocalFilters = query.trim() !== '' || cause !== 'all' || severity !== 'all';
  const hasAnyFilter = hasProjectFilter || hasLocalFilters;
  const projectName = hasProjectFilter ? getProjectName(selectedProjectPath) : '';
  const showFilteredEmpty = filteredSessions.length === 0;
  const showProjectEmpty = hasProjectFilter && !hasLocalFilters;
  const baseMotionKey = selectedProjectPath ?? 'all-sessions';
  const motionKey =
    hasLocalFilters || pagination.currentPage > 1 || pageSize !== DEFAULT_SESSION_PAGE_SIZE
      ? [baseMotionKey, query, cause, severity, pagination.currentPage, pageSize].join(':')
      : baseMotionKey;

  React.useEffect(() => {
    if (pagination.currentPage !== currentPage) {
      setCurrentPage(pagination.currentPage);
    }
  }, [currentPage, pagination.currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedProjectPath]);

  const handleProjectChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const projectPath = event.target.value || null;
    setCurrentPage(1);

    if (projectPath === null) {
      onClearProjectFilter();
      return;
    }

    onProjectFilterChange(projectPath);
  };

  const handleCauseChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    setCause(event.target.value as SessionDiagnosisCauseFilter);
    setCurrentPage(1);
  };

  const handleSeverityChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    setSeverity(event.target.value as SessionDiagnosisSeverity | 'all');
    setCurrentPage(1);
  };

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const nextPageSize = Number(event.target.value);

    if (!isSessionPageSize(nextPageSize)) {
      return;
    }

    setPageSize(nextPageSize);
    setCurrentPage(1);

    if (typeof window !== 'undefined') {
      saveSessionPageSizePreference(nextPageSize, window.localStorage);
    }
  };

  const handleClearFilters = (): void => {
    setQuery('');
    setCause('all');
    setSeverity('all');
    setCurrentPage(1);
    onClearProjectFilter();
  };

  const getProjectLabel = (projectPath: string, fallbackName: string): string =>
    projectPath === UNKNOWN_PROJECT_KEY ? t('projects.unknownProject') : fallbackName;

  return (
    <section className="page-stack">
      <PageHeader
        eyebrow={t('sessions.eyebrow')}
        title={t('sessions.title')}
        description={t('sessions.description')}
        actions={
          <>
            <span>
              {t('sessions.resultCount', {
                filtered: filteredSessions.length,
                total: sessions.length,
              })}
            </span>
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

      <div className="panel session-filter-panel">
        <div className="session-filter-controls">
          <label className="session-filter-search">
            <span>{t('sessions.filters.searchLabel')}</span>
            <input
              type="search"
              value={query}
              placeholder={t('sessions.filters.searchPlaceholder')}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
            />
          </label>
          <label>
            <span>{t('sessions.filters.projectLabel')}</span>
            <select value={selectedProjectPath ?? ''} onChange={handleProjectChange}>
              <option value="">{t('sessions.filters.allProjects')}</option>
              {projectOptions.map((option) => (
                <option key={option.projectPath} value={option.projectPath}>
                  {getProjectLabel(option.projectPath, option.projectName)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('sessions.filters.causeLabel')}</span>
            <select value={cause} onChange={handleCauseChange}>
              <option value="all">{t('sessions.filters.allCauses')}</option>
              {CAUSES.map((diagnosisCause) => (
                <option key={diagnosisCause} value={diagnosisCause}>
                  {tCostOptimization(CAUSE_KEYS[diagnosisCause])}
                </option>
              ))}
              <option value="none">{t('sessions.filters.noDiagnosis')}</option>
            </select>
          </label>
          <label>
            <span>{t('sessions.filters.severityLabel')}</span>
            <select value={severity} onChange={handleSeverityChange}>
              <option value="all">{t('sessions.filters.allSeverities')}</option>
              {SEVERITIES.map((diagnosisSeverity) => (
                <option key={diagnosisSeverity} value={diagnosisSeverity}>
                  {tCostOptimization(`diagnostics.severity.${diagnosisSeverity}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {hasAnyFilter ? (
          <button type="button" className="session-filter-clear" onClick={handleClearFilters}>
            {t('sessions.filters.clear')}
          </button>
        ) : null}
      </div>

      <div className="panel table-panel session-list-panel">
        <div className="data-table session-table">
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
              <h4>
                {showProjectEmpty
                  ? t('sessions.filteredEmptyTitle')
                  : t('sessions.filters.emptyTitle')}
              </h4>
              <p>
                {showProjectEmpty
                  ? t('sessions.filteredEmptyDescription')
                  : t('sessions.filters.emptyDescription')}
              </p>
              <button type="button" onClick={handleClearFilters}>
                {showProjectEmpty ? t('sessions.showAll') : t('sessions.filters.clear')}
              </button>
            </div>
          ) : (
            <div key={motionKey} data-motion-key={motionKey}>
              {pagination.items.map((session, index) => {
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
                      {session.warnings.length ? (
                        <AlertTriangle size={ICON_SIZE_SMALL} aria-hidden="true" />
                      ) : null}
                      {session.warnings.length
                        ? tCommon('item.warnings', { count: session.warnings.length })
                        : tCommon('value.ok')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="session-pagination">
          <label>
            <span>{t('sessions.pagination.pageSize')}</span>
            <select value={pageSize} onChange={handlePageSizeChange}>
              {SESSION_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <span>
            {t('sessions.pagination.range', {
              start: pagination.rangeStart,
              end: pagination.rangeEnd,
              total: pagination.totalItems,
            })}
          </span>
          <div className="session-pagination-navigation">
            <button
              type="button"
              aria-label={t('sessions.pagination.previous')}
              disabled={pagination.currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              {t('sessions.pagination.previous')}
            </button>
            <span role="status">
              {t('sessions.pagination.page', {
                current: pagination.currentPage,
                total: pagination.totalPages,
              })}
            </span>
            <button
              type="button"
              aria-label={t('sessions.pagination.next')}
              disabled={pagination.currentPage === pagination.totalPages}
              onClick={() => setCurrentPage((page) => Math.min(pagination.totalPages, page + 1))}
            >
              {t('sessions.pagination.next')}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
};

const shortId = (id: string): string =>
  id.length > SHORT_ID_MAX_LENGTH
    ? `${id.slice(0, SHORT_ID_PREFIX_LENGTH)}...${id.slice(-SHORT_ID_SUFFIX_LENGTH)}`
    : id;

export default SessionsView;
