/**
 * @file 应用版本与更新设置
 * @description 展示主进程更新状态，只提供明确下载和安装操作，保留离线修复入口。
 */
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppUpdatePhase } from '../../shared/appUpdateTypes';
import { ICON_SIZE_MEDIUM } from '../constants/ui';
import { useAppUpdate } from '../hooks/useAppUpdate';
import { resolveRendererLocale } from '../i18n';
import { formatPercent } from '../utils/formatters';

const PROGRESS_COMPLETE = 100;
const BUSY_PHASES = new Set<AppUpdatePhase>(['checking', 'downloading', 'preparing', 'installing']);

export const AppUpdateSettings = () => {
  const { t, i18n } = useTranslation('appUpdate');
  const { snapshot, pending, unavailable, feedback, check, download, install, openReleasePage } =
    useAppUpdate();
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const phase = snapshot?.phase;
  const busy = pending !== null || (phase !== undefined && BUSY_PHASES.has(phase));
  const waitingForInitialState = !snapshot && feedback !== 'connection';
  const cannotCheck = unavailable || waitingForInitialState || phase === 'unavailable' || busy;
  const cannotOpenReleasePage = unavailable || busy;
  const downloadFailed = phase === 'error' && snapshot?.error === 'download-failed';
  const installFailed =
    phase === 'error' &&
    (snapshot?.error === 'save-failed' || snapshot?.error === 'install-failed');
  const showDownload = phase === 'available' || downloadFailed;
  const showInstall = phase === 'downloaded' || installFailed;
  const progress = snapshot?.progress;
  const showProgress = phase === 'downloading' && progress !== undefined;
  const progressPercent = Math.min(PROGRESS_COMPLETE, Math.max(0, progress?.percent ?? 0));
  const serviceError = phase === 'error' ? snapshot?.error : undefined;
  const showError = feedback !== null || serviceError !== undefined;

  let status: string = t(`states.${phase ?? 'loading'}`);
  if (unavailable) {
    status = t('bridgeUnavailable');
  } else if (snapshot?.unavailableReason) {
    status = t(`unavailable.${snapshot.unavailableReason}`);
  }
  const errorMessage = feedback
    ? t(`feedback.${feedback}`)
    : serviceError
      ? t(`errors.${serviceError}`)
      : '';

  return (
    <article className="panel app-update-panel" aria-labelledby="app-update-title">
      <div className="settings-item">
        <Download size={ICON_SIZE_MEDIUM} aria-hidden="true" />
        <div className="app-update-content">
          <p className="eyebrow">{t('channel')}</p>
          <h3 id="app-update-title">{t('title')}</h3>
          <p>{t('description')}</p>
          <dl className="app-update-versions">
            <div>
              <dt>{t('currentVersion')}</dt>
              <dd>{snapshot?.currentVersion ?? t('unknownVersion')}</dd>
            </div>
            {snapshot?.targetVersion ? (
              <div>
                <dt>{t('targetVersion')}</dt>
                <dd>{snapshot.targetVersion}</dd>
              </div>
            ) : null}
          </dl>
          <p role="status" aria-live="polite" aria-atomic="true">
            {status}
          </p>
          {showError ? (
            <p className="form-error" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {showProgress ? (
            <div className="app-update-progress">
              <progress
                aria-label={t('downloadProgress')}
                max={PROGRESS_COMPLETE}
                value={progressPercent}
              />
              <span>{formatPercent(progressPercent, locale)}</span>
            </div>
          ) : null}
          {snapshot?.releaseNotes ? (
            <details className="app-update-notes">
              <summary>{t('releaseNotes')}</summary>
              <p>{snapshot.releaseNotes}</p>
            </details>
          ) : null}
          <div className="settings-data-path-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={cannotCheck}
              onClick={() => void check()}
            >
              {t('check')}
            </button>
            {showDownload ? (
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={() => void download()}
              >
                {t(downloadFailed ? 'retryDownload' : 'download')}
              </button>
            ) : null}
            {showInstall ? (
              <button
                className="primary-button"
                type="button"
                disabled={busy}
                onClick={() => void install()}
              >
                {t(installFailed ? 'retryInstall' : 'install')}
              </button>
            ) : null}
          </div>
          <p>{t('offlineDescription')}</p>
          <button
            className="secondary-button"
            type="button"
            disabled={cannotOpenReleasePage}
            onClick={() => void openReleasePage()}
          >
            {t('offlineInstaller')}
          </button>
        </div>
      </div>
    </article>
  );
};
