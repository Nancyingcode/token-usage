/**
 * @file Session usage list
 * @description Displays session token details and the transient project drilldown filter.
 */
import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getProjectName } from '../../shared/usageMath';
import type { UsageSession } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';
import { selectProjectSessions } from '../utils/projectSessions';

interface SessionsViewProps {
  sessions: UsageSession[];
  selectedProjectPath: string | null;
  onClearProjectFilter: () => void;
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
}) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const filteredSessions = React.useMemo(
    () => selectProjectSessions(sessions, selectedProjectPath),
    [selectedProjectPath, sessions]
  );
  const hasProjectFilter = selectedProjectPath !== null;
  const projectName = hasProjectFilter ? getProjectName(selectedProjectPath) : '';
  const showFilteredEmpty = hasProjectFilter && filteredSessions.length === 0;
  const sessionCountLabel = hasProjectFilter
    ? t('sessions.filteredCount', { count: filteredSessions.length })
    : t('sessions.count', { count: filteredSessions.length });

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('sessions.eyebrow')}</p>
          <h3>{t('sessions.title')}</h3>
          {hasProjectFilter ? (
            <ProjectFilterChip
              projectPath={selectedProjectPath}
              label={t('sessions.projectFilter', { project: projectName })}
              clearLabel={t('sessions.clearProjectFilter', { project: projectName })}
              onClear={onClearProjectFilter}
            />
          ) : null}
        </div>
        <span>{sessionCountLabel}</span>
      </div>
      <div className="data-table session-table">
        <div className="table-row table-head">
          <span>{t('sessions.session')}</span>
          <span>{t('sessions.project')}</span>
          <span>{t('sessions.date')}</span>
          <span>{t('sessions.input')}</span>
          <span>{t('sessions.cached')}</span>
          <span>{t('sessions.output')}</span>
          <span>{t('sessions.total')}</span>
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
          filteredSessions.map((session) => (
            <div className="table-row" key={session.sourceFile}>
              <span className="primary-cell" title={session.sessionId}>
                {session.threadName || shortId(session.sessionId)}
              </span>
              <span title={session.projectPath}>{session.projectName}</span>
              <span>
                {formatShortDateTime(session.startedAt, locale, tCommon('value.unknownDate'))}
              </span>
              <span>{formatNumber(session.inputTokens, locale)}</span>
              <span>{formatNumber(session.cachedInputTokens, locale)}</span>
              <span>{formatNumber(session.outputTokens, locale)}</span>
              <span>{formatNumber(session.totalTokens, locale)}</span>
              <span className={session.warnings.length ? 'warning-cell' : 'ok-cell'}>
                {session.warnings.length ? <AlertTriangle size={ICON_SIZE_SMALL} /> : null}
                {session.warnings.length
                  ? tCommon('item.warnings', { count: session.warnings.length })
                  : tCommon('value.ok')}
              </span>
            </div>
          ))
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
