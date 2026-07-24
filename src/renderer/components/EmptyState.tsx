import React from 'react';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UsageWarning } from '../../shared/usageTypes';
import { ICON_SIZE_EMPTY_STATE } from '../constants/ui';
import { translateUsageWarning } from '../utils/usageWarnings';

interface EmptyStateProps {
  sessionsDir: string;
  warnings: UsageWarning[];
}

const EmptyState: React.FC<EmptyStateProps> = ({ sessionsDir, warnings }) => {
  const { t } = useTranslation('common');
  const { t: tWarning } = useTranslation('warnings');
  const firstWarning = warnings[0];

  return (
    <section className="state-panel">
      <Inbox size={ICON_SIZE_EMPTY_STATE} />
      <div>
        <h2>{t('state.noSessions')}</h2>
        <p>{t('state.scannedPath', { path: sessionsDir })}</p>
        {firstWarning ? <p>{translateUsageWarning(firstWarning, tWarning)}</p> : null}
      </div>
    </section>
  );
};

export default EmptyState;
