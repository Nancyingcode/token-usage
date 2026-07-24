import React from 'react';
import { CalendarX2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RollingUsagePeriod } from '../../shared/usageTypes';
import { ICON_SIZE_EMPTY_STATE } from '../constants/ui';

interface PeriodEmptyStateProps {
  period: RollingUsagePeriod;
}

const PERIOD_TRANSLATION_KEYS = {
  today: 'state.period.today',
  week: 'state.period.week',
  month: 'state.period.month',
} as const satisfies Record<RollingUsagePeriod, string>;

const PeriodEmptyState: React.FC<PeriodEmptyStateProps> = ({ period }) => {
  const { t } = useTranslation('common');
  const periodLabel = t(PERIOD_TRANSLATION_KEYS[period]);

  return (
    <section className="state-panel">
      <CalendarX2 size={ICON_SIZE_EMPTY_STATE} />
      <div>
        <h2>{t('state.periodEmptyTitle')}</h2>
        <p>{t('state.periodEmptyDescription', { period: periodLabel })}</p>
      </div>
    </section>
  );
};

export default PeriodEmptyState;
