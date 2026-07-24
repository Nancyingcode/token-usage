import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UsageSession } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';

interface SessionsViewProps {
  sessions: UsageSession[];
}

const SHORT_ID_MAX_LENGTH = 12;
const SHORT_ID_PREFIX_LENGTH = 8;
const SHORT_ID_SUFFIX_LENGTH = 4;

const SessionsView: React.FC<SessionsViewProps> = ({ sessions }) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);

  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('sessions.eyebrow')}</p>
          <h3>{t('sessions.title')}</h3>
        </div>
        <span>{t('sessions.count', { count: sessions.length })}</span>
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
        {sessions.map((session) => (
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
        ))}
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
