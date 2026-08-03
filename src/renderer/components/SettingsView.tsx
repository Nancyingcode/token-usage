import React, { useEffect, useState } from 'react';
import { Folder, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UsageScanResult } from '../../shared/usageTypes';
import type {
  UsageDataPathIssueCode,
  UsageDataPathSettings,
} from '../../shared/usageDataPathTypes';
import { ICON_SIZE_MEDIUM } from '../constants/ui';
import { translateUsageWarning } from '../utils/usageWarnings';
import PageHeader from './PageHeader';

interface SettingsViewProps {
  result?: UsageScanResult;
  dataPathSettings: UsageDataPathSettings;
  scanError?: string;
  onSelectDataPath: () => Promise<string | null>;
  onUpdateDataPath: (sessionsDir: string) => Promise<unknown>;
  onResetDataPath: () => Promise<unknown>;
}

const MAX_VISIBLE_WARNINGS = 8;

const DATA_PATH_ISSUE_CODES = new Set<UsageDataPathIssueCode>([
  'path-required',
  'path-not-absolute',
  'path-unreadable',
  'unexpected',
]);

const getUsageDataPathIssueCode = (error: unknown): UsageDataPathIssueCode => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    DATA_PATH_ISSUE_CODES.has(error.code as UsageDataPathIssueCode)
  ) {
    return error.code as UsageDataPathIssueCode;
  }

  return 'unexpected';
};

const SettingsView: React.FC<SettingsViewProps> = ({
  result,
  dataPathSettings,
  scanError,
  onSelectDataPath,
  onUpdateDataPath,
  onResetDataPath,
}) => {
  const { t } = useTranslation('settings');
  const { t: tWarning } = useTranslation('warnings');
  const [draftPath, setDraftPath] = useState(dataPathSettings.sessionsDir);
  const [pendingAction, setPendingAction] = useState<'select' | 'save' | 'reset' | null>(null);
  const [issueCode, setIssueCode] = useState<UsageDataPathIssueCode | null>(null);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const warnings = result?.warnings ?? [];
  const pathChanged = draftPath !== dataPathSettings.sessionsDir;
  const pathDescriptionIds = issueCode
    ? 'usage-data-path-description usage-data-path-default usage-data-path-error'
    : 'usage-data-path-description usage-data-path-default';

  useEffect(() => {
    setDraftPath(dataPathSettings.sessionsDir);
  }, [dataPathSettings.sessionsDir]);

  const runPathAction = async (
    action: 'save' | 'reset',
    operation: () => Promise<unknown>
  ): Promise<void> => {
    setPendingAction(action);
    setIssueCode(null);
    setSelectionFailed(false);
    setSaved(false);

    try {
      await operation();
      setSaved(true);
    } catch (error) {
      setIssueCode(getUsageDataPathIssueCode(error));
    } finally {
      setPendingAction(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void runPathAction('save', () => onUpdateDataPath(draftPath));
  };

  const handleSelect = async (): Promise<void> => {
    setPendingAction('select');
    setIssueCode(null);
    setSelectionFailed(false);
    setSaved(false);

    try {
      const selectedPath = await onSelectDataPath();

      if (selectedPath !== null) {
        setDraftPath(selectedPath);
      }
    } catch {
      setSelectionFailed(true);
    } finally {
      setPendingAction(null);
    }
  };

  const handleReset = (): void => {
    void runPathAction('reset', onResetDataPath);
  };

  return (
    <section className="page-stack">
      <PageHeader title={t('title')} description={t('description')} />
      <div className="settings-grid">
        <article className="panel settings-data-path-panel">
          <div className="settings-item">
            <Folder size={ICON_SIZE_MEDIUM} />
            <div>
              <p className="eyebrow">{t('dataPath')}</p>
              <h3>{t('codexSessions')}</h3>
              <form className="settings-data-path-form" onSubmit={handleSubmit}>
                <label htmlFor="usage-data-path">{t('sessionsDirectory')}</label>
                <p id="usage-data-path-description">{t('dataPathDescription')}</p>
                <input
                  id="usage-data-path"
                  value={draftPath}
                  readOnly
                  disabled={pendingAction !== null}
                  aria-describedby={pathDescriptionIds}
                  aria-invalid={issueCode !== null}
                />
                <code id="usage-data-path-default">
                  {t('defaultPath', { path: dataPathSettings.defaultSessionsDir })}
                </code>
                {issueCode ? (
                  <p id="usage-data-path-error" className="form-error" role="alert">
                    {t(`dataPathValidation.${issueCode}`)}
                  </p>
                ) : null}
                {selectionFailed ? (
                  <p className="form-error" role="alert">
                    {t('selectFolderFailed')}
                  </p>
                ) : null}
                {saved ? <p className="settings-path-success">{t('pathSaved')}</p> : null}
                {scanError ? (
                  <p className="form-error" role="status">
                    {t('scanError', { details: scanError })}
                  </p>
                ) : null}
                <div className="settings-data-path-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void handleSelect()}
                  >
                    {pendingAction === 'select' ? t('selectingFolder') : t('selectFolder')}
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!pathChanged || pendingAction !== null}
                  >
                    {pendingAction === 'save' ? t('savingPath') : t('savePath')}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={dataPathSettings.usingDefault || pendingAction !== null}
                    onClick={handleReset}
                  >
                    {pendingAction === 'reset' ? t('restoringDefault') : t('restoreDefault')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="settings-item">
            <ShieldCheck size={ICON_SIZE_MEDIUM} />
            <div>
              <p className="eyebrow">{t('privacy')}</p>
              <h3>{t('localReadOnly')}</h3>
              <p>{t('privacyDescription')}</p>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="eyebrow">{t('costEstimate')}</p>
          <h3>{t('modelBasedEstimate')}</h3>
          <p>{t('costDescription')}</p>
        </article>

        <article className="panel">
          <p className="eyebrow">{t('warnings')}</p>
          <h3>{t('scanWarnings', { count: warnings.length })}</h3>
          <div className="warning-list">
            {warnings.slice(0, MAX_VISIBLE_WARNINGS).map((warning) => (
              <p key={`${warning.sourceFile}-${warning.line}-${warning.code}`}>
                {warning.sourceFile ? `${warning.sourceFile}: ` : ''}
                {translateUsageWarning(warning, tWarning)}
              </p>
            ))}
            {warnings.length === 0 ? <p>{t('noWarnings')}</p> : null}
          </div>
        </article>
      </div>
    </section>
  );
};

export default SettingsView;
