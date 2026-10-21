/**
 * @file 压缩会话数据提示区
 * @description 分别展示实时扫描与本地导入范围，提供用户主动触发的压缩数据刷新入口。
 */
import { Archive, ChevronDown, RefreshCw } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompressedDataStatus } from '../../shared/compressedDataTypes';
import { resolveRendererLocale } from '../i18n';
import { formatNumber, formatShortDateTime } from '../utils/formatters';

export interface CompressedDataPanelProps {
  status: CompressedDataStatus | null;
  pending: boolean;
  error?: string | null;
  scannedAt?: string;
  onRefresh: () => void;
}

const CompressedDataPanel = ({
  status,
  pending,
  error,
  scannedAt,
  onRefresh,
}: CompressedDataPanelProps) => {
  const { t, i18n } = useTranslation('common');
  const headingId = useId();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const errorMessage = error || status?.error;
  const phase = errorMessage ? 'error' : (status?.phase ?? 'idle');
  const busy = pending || phase === 'checking' || phase === 'importing';
  const visible = Boolean(
    busy || errorMessage || status?.discoveredCount || status?.importedCount || status?.report
  );
  const hasUnimportedSources = (status?.unimportedCount ?? 0) > 0;
  const failures = status?.report?.failures ?? [];
  const hasFailures = failures.length > 0;
  const showStatus = busy || phase === 'partial' || phase === 'error' || Boolean(status?.report);
  const formatDate = (value?: string): string =>
    value ? formatShortDateTime(value, locale, t('value.unknownDate')) : t('compressedData.never');

  if (!visible) {
    return null;
  }

  return (
    <section className="compressed-data-panel" aria-labelledby={headingId}>
      <div className="compressed-data-heading">
        <div className="compressed-data-summary">
          <Archive className="compressed-data-icon" size={18} aria-hidden="true" />
          <div>
            <div className="compressed-data-title-row">
              <h2 id={headingId}>{t('compressedData.title')}</h2>
              <span
                className={
                  hasUnimportedSources
                    ? 'compressed-data-count compressed-data-count--pending'
                    : 'compressed-data-count'
                }
              >
                {t('compressedData.pendingFiles', {
                  value: formatNumber(status?.unimportedCount ?? 0, locale),
                })}
              </span>
              <span className="compressed-data-saved">
                {t('compressedData.savedFiles', {
                  value: formatNumber(status?.importedCount ?? 0, locale),
                })}
              </span>
            </div>
            <p>
              {t('compressedData.scope')}
              {hasUnimportedSources ? (
                <span className="compressed-data-coverage">
                  {' '}
                  · {t('compressedData.incompleteShort')}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="compressed-data-actions">
          <button
            type="button"
            className="compressed-data-toggle"
            aria-expanded={expanded}
            aria-controls={detailsId}
            onClick={() => setExpanded((value) => !value)}
          >
            {t(expanded ? 'compressedData.hideDetails' : 'compressedData.showDetails')}
            <ChevronDown size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="compressed-data-refresh"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('compressedData.refresh')}
          </button>
        </div>
      </div>
      <div id={detailsId} className="compressed-data-body" hidden={!expanded}>
        <dl className="compressed-data-details">
          <div>
            <dt>{t('compressedData.discovered')}</dt>
            <dd>{formatNumber(status?.discoveredCount ?? 0, locale)}</dd>
          </div>
          <div>
            <dt>{t('compressedData.unimported')}</dt>
            <dd>{formatNumber(status?.unimportedCount ?? 0, locale)}</dd>
          </div>
          <div>
            <dt>{t('compressedData.localCopies')}</dt>
            <dd>{formatNumber(status?.importedCount ?? 0, locale)}</dd>
          </div>
          <div>
            <dt>{t('compressedData.liveScannedAt')}</dt>
            <dd>{formatDate(scannedAt)}</dd>
          </div>
          <div>
            <dt>{t('compressedData.lastImportedAt')}</dt>
            <dd>{formatDate(status?.lastImportedAt)}</dd>
          </div>
        </dl>
        {hasUnimportedSources ? (
          <p className="compressed-data-notice">{t('compressedData.incomplete')}</p>
        ) : null}
        <p className="compressed-data-help">{t('compressedData.phase.idle')}</p>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        {showStatus ? <p>{t(`compressedData.phase.${phase}`)}</p> : null}
        {busy ? (
          <p>
            {t('compressedData.progress', {
              processed: formatNumber(status?.processedCount ?? 0, locale),
              total: formatNumber(status?.totalCount ?? 0, locale),
            })}
          </p>
        ) : null}
        {status?.report ? (
          <p>
            {t('compressedData.report', {
              added: formatNumber(status.report.added, locale),
              updated: formatNumber(status.report.updated, locale),
              unchanged: formatNumber(status.report.unchanged, locale),
              failed: formatNumber(failures.length, locale),
            })}
          </p>
        ) : null}
      </div>
      {errorMessage ? (
        <p role="alert" className="compressed-data-error">
          {t('compressedData.error', { details: errorMessage })}
        </p>
      ) : null}
      {hasFailures ? (
        <details className="compressed-data-failures">
          <summary>{t('compressedData.failures')}</summary>
          <ul>
            {failures.map((failure) => (
              <li key={`${failure.sourceFile ?? ''}:${failure.message}`}>
                {failure.sourceFile ? <span>{failure.sourceFile}: </span> : null}
                {failure.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
};

export default CompressedDataPanel;
