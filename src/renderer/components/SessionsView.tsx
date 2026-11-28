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
import { useResultEntrance } from '../hooks/useResultEntrance';
import { useUsageTableFocus } from '../hooks/useUsageTableFocus';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';
import {
  filterSessionList,
  getSessionProjectOptions,
  paginateSessionList,
  type SessionDiagnosisCauseFilter,
} from '../utils/sessionListFilters';
import {
  DEFAULT_SESSION_PAGE_SIZE,
  loadSessionPageSizePreference,
  saveSessionPageSizePreference,
  SESSION_PAGE_SIZE_OPTIONS,
  type SessionPageSize,
} from '../utils/sessionPageSizePreference';
import PageHeader from './PageHeader';
import SelectMenu, { type SelectMenuOption } from './SelectMenu';
import UsageRowDetails from './UsageRowDetails';

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
const PAGE_SIZE_SELECT_OPTIONS: readonly SelectMenuOption<SessionPageSize>[] =
  SESSION_PAGE_SIZE_OPTIONS.map((value) => ({ value, label: String(value) }));

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
  const [resultGroup, advanceResultGroup] = React.useReducer((group: number) => group + 1, 0);
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
  const projectSelectOptions = React.useMemo<SelectMenuOption<string>[]>(
    () => [
      { value: '', label: t('sessions.filters.allProjects') },
      ...projectOptions.map(({ projectPath, projectName: fallbackName }) => ({
        value: projectPath,
        label: projectPath === UNKNOWN_PROJECT_KEY ? t('projects.unknownProject') : fallbackName,
      })),
    ],
    [projectOptions, t]
  );
  const causeSelectOptions = React.useMemo<SelectMenuOption<SessionDiagnosisCauseFilter>[]>(
    () => [
      { value: 'all', label: t('sessions.filters.allCauses') },
      ...CAUSES.map((diagnosisCause) => ({
        value: diagnosisCause,
        label: tCostOptimization(CAUSE_KEYS[diagnosisCause]),
      })),
      { value: 'none', label: t('sessions.filters.noDiagnosis') },
    ],
    [t, tCostOptimization]
  );
  const severitySelectOptions = React.useMemo<SelectMenuOption<SessionDiagnosisSeverity | 'all'>[]>(
    () => [
      { value: 'all', label: t('sessions.filters.allSeverities') },
      ...SEVERITIES.map((diagnosisSeverity) => ({
        value: diagnosisSeverity,
        label: tCostOptimization(`diagnostics.severity.${diagnosisSeverity}`),
      })),
    ],
    [t, tCostOptimization]
  );
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
  const { searchRef, onRowFocus, onRowBlur } = useUsageTableFocus(pagination.items);
  const hasProjectFilter = selectedProjectPath !== null;
  const hasDiagnosisFilter = cause !== 'all' || severity !== 'all';
  const hasLocalFilters = query.trim() !== '' || hasDiagnosisFilter;
  const hasAnyFilter = hasProjectFilter || hasLocalFilters;
  const projectName = hasProjectFilter ? getProjectName(selectedProjectPath) : '';
  const showFilteredEmpty = filteredSessions.length === 0;
  const showProjectEmpty = hasProjectFilter && !hasLocalFilters;
  const resultGroupKey = `${resultGroup}:${selectedProjectPath ?? ''}`;
  const { resultsRef, cancel: cancelEntrance } = useResultEntrance<HTMLDivElement>(
    resultGroupKey,
    showFilteredEmpty ? 'skipped' : 'ready'
  );

  React.useEffect(() => {
    if (pagination.currentPage !== currentPage) {
      setCurrentPage(pagination.currentPage);
    }
  }, [currentPage, pagination.currentPage]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedProjectPath]);

  const handleProjectChange = (value: string): void => {
    const projectPath = value || null;
    setCurrentPage(1);

    if (projectPath === null) {
      onClearProjectFilter();
      return;
    }

    onProjectFilterChange(projectPath);
  };

  const handleCauseChange = (nextCause: SessionDiagnosisCauseFilter): void => {
    if (nextCause !== cause) {
      advanceResultGroup();
    }
    setCause(nextCause);
    setCurrentPage(1);
  };

  const handleSeverityChange = (nextSeverity: SessionDiagnosisSeverity | 'all'): void => {
    if (nextSeverity !== severity) {
      advanceResultGroup();
    }
    setSeverity(nextSeverity);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (nextPageSize: SessionPageSize): void => {
    if (nextPageSize !== pageSize) {
      advanceResultGroup();
    }
    setPageSize(nextPageSize);
    setCurrentPage(1);

    if (typeof window !== 'undefined') {
      saveSessionPageSizePreference(nextPageSize, window.localStorage);
    }
  };

  const handleClearFilters = (): void => {
    if (hasDiagnosisFilter) {
      advanceResultGroup();
    } else if (!hasProjectFilter) {
      cancelEntrance();
    }
    setQuery('');
    setCause('all');
    setSeverity('all');
    setCurrentPage(1);
    onClearProjectFilter();
  };

  const handlePageChange = (nextPage: number): void => {
    advanceResultGroup();
    setCurrentPage(nextPage);
  };

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
                onClear={() => handleProjectChange('')}
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
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t('sessions.filters.searchPlaceholder')}
              onChange={(event) => {
                cancelEntrance();
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
            />
          </label>
          <label>
            <span>{t('sessions.filters.projectLabel')}</span>
            <SelectMenu
              value={selectedProjectPath ?? ''}
              options={projectSelectOptions}
              ariaLabel={t('sessions.filters.projectLabel')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
              onChange={handleProjectChange}
            />
          </label>
          <label>
            <span>{t('sessions.filters.causeLabel')}</span>
            <SelectMenu
              value={cause}
              options={causeSelectOptions}
              ariaLabel={t('sessions.filters.causeLabel')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
              onChange={handleCauseChange}
            />
          </label>
          <label>
            <span>{t('sessions.filters.severityLabel')}</span>
            <SelectMenu
              value={severity}
              options={severitySelectOptions}
              ariaLabel={t('sessions.filters.severityLabel')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
              onChange={handleSeverityChange}
            />
          </label>
        </div>
        {hasAnyFilter ? (
          <button type="button" className="session-filter-clear" onClick={handleClearFilters}>
            {t('sessions.filters.clear')}
          </button>
        ) : null}
      </div>

      <div className="panel table-panel session-list-panel">
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
          <div
            className="data-table session-table usage-table-container"
            role="table"
            aria-label={t('sessions.title')}
          >
            <div className="table-row table-head" role="row">
              <span role="columnheader">{t('sessions.session')}</span>
              <span role="columnheader" className="usage-table-secondary-column">
                {t('sessions.project')}
              </span>
              <span role="columnheader" className="usage-table-secondary-column">
                {t('sessions.date')}
              </span>
              <span
                role="columnheader"
                className="table-cell--numeric usage-table-secondary-column"
              >
                {t('sessions.input')}
              </span>
              <span
                role="columnheader"
                className="table-cell--numeric usage-table-secondary-column"
              >
                {t('sessions.cached')}
              </span>
              <span
                role="columnheader"
                className="table-cell--numeric usage-table-secondary-column"
              >
                {t('sessions.output')}
              </span>
              <span role="columnheader" className="table-cell--numeric usage-table-total">
                {t('sessions.total')}
              </span>
              <span role="columnheader">{t('sessions.status')}</span>
            </div>
            <div
              key={resultGroupKey}
              ref={resultsRef}
              role="rowgroup"
              onFocus={onRowFocus}
              onBlur={onRowBlur}
            >
              {pagination.items.map((session) => {
                const name = session.threadName || shortId(session.sessionId);
                const secondaryColumns = [
                  {
                    label: t('sessions.project'),
                    value: session.projectName,
                    title: session.projectPath,
                    fullWidth: true,
                  },
                  {
                    label: t('sessions.date'),
                    value: formatShortDateTime(
                      session.startedAt,
                      locale,
                      tCommon('value.unknownDate')
                    ),
                  },
                  {
                    label: t('sessions.input'),
                    value: formatNumber(session.inputTokens, locale),
                    numeric: true,
                  },
                  {
                    label: t('sessions.cached'),
                    value: formatNumber(session.cachedInputTokens, locale),
                    numeric: true,
                  },
                  {
                    label: t('sessions.output'),
                    value: formatNumber(session.outputTokens, locale),
                    numeric: true,
                  },
                ];
                const [projectDetails, dateDetails, ...tokenDetails] = secondaryColumns;
                const details = [...tokenDetails, dateDetails, projectDetails];
                const detailFields = session.projectPath
                  ? [
                      ...details,
                      {
                        label: t('projects.path'),
                        value: session.projectPath,
                        fullWidth: true,
                      },
                    ]
                  : details;
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
                  <div className="table-row" key={session.sourceFile} role="row">
                    <div
                      className="primary-cell session-primary-cell"
                      role="rowheader"
                      aria-label={name}
                      title={session.sessionId}
                    >
                      <span title={session.threadName}>{name}</span>
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
                      <UsageRowDetails name={name} fields={detailFields} />
                    </div>
                    {secondaryColumns.map(({ label, value, numeric, title }) => (
                      <span
                        key={label}
                        role="cell"
                        className={`usage-table-secondary-column${numeric ? ' table-cell--numeric' : ''}`}
                        title={title}
                      >
                        {value}
                      </span>
                    ))}
                    <span role="cell" className="table-cell--numeric usage-table-total">
                      {formatNumber(session.totalTokens, locale)}
                    </span>
                    <span
                      role="cell"
                      className={session.warnings.length ? 'warning-cell' : 'ok-cell'}
                    >
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
          </div>
        )}

        <footer className="session-pagination">
          <label>
            <span>{t('sessions.pagination.pageSize')}</span>
            <SelectMenu
              value={pageSize}
              options={PAGE_SIZE_SELECT_OPTIONS}
              ariaLabel={t('sessions.pagination.pageSize')}
              loadingLabel={tCommon('state.loadingOptions')}
              emptyLabel={tCommon('state.noOptions')}
              onChange={handlePageSizeChange}
            />
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
              onClick={() => handlePageChange(pagination.currentPage - 1)}
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
              onClick={() => handlePageChange(pagination.currentPage + 1)}
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
