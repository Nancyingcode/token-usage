import React from 'react';
import { Folder, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UsageScanResult } from '../../shared/usageTypes';
import { ICON_SIZE_MEDIUM } from '../constants/ui';
import { translateUsageWarning } from '../utils/usageWarnings';

interface SettingsViewProps {
  result: UsageScanResult;
}

const MAX_VISIBLE_WARNINGS = 8;

const SettingsView: React.FC<SettingsViewProps> = ({ result }) => {
  const { t } = useTranslation('settings');
  const { t: tWarning } = useTranslation('warnings');

  return (
    <section className="settings-grid">
      <article className="panel">
        <div className="settings-item">
          <Folder size={ICON_SIZE_MEDIUM} />
          <div>
            <p className="eyebrow">{t('dataPath')}</p>
            <h3>{t('codexSessions')}</h3>
            <code>{result.sessionsDir}</code>
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
        <h3>{t('scanWarnings', { count: result.warnings.length })}</h3>
        <div className="warning-list">
          {result.warnings.slice(0, MAX_VISIBLE_WARNINGS).map((warning) => (
            <p key={`${warning.sourceFile}-${warning.line}-${warning.code}`}>
              {warning.sourceFile ? `${warning.sourceFile}: ` : ''}
              {translateUsageWarning(warning, tWarning)}
            </p>
          ))}
          {result.warnings.length === 0 ? <p>{t('noWarnings')}</p> : null}
        </div>
      </article>
    </section>
  );
};

export default SettingsView;
