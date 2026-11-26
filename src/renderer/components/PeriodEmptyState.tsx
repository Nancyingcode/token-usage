import React from 'react';
import { CalendarX2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RollingUsagePeriod, UsageDateRange } from '../../shared/usageTypes';
import { ICON_SIZE_EMPTY_STATE } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { createCalendarDateRangeFormatter } from '../utils/formatters';

type PeriodEmptyStateProps = { period: RollingUsagePeriod } | { range: UsageDateRange };

const PERIOD_TRANSLATION_KEYS = {
  today: 'state.period.today',
  week: 'state.period.week',
  month: 'state.period.month',
} as const satisfies Record<RollingUsagePeriod, string>;

const PeriodEmptyState: React.FC<PeriodEmptyStateProps> = (props) => {
  const { t, i18n } = useTranslation('common');
  const isCustomRange = 'range' in props;
  const title = t(isCustomRange ? 'state.dateRangeEmptyTitle' : 'state.periodEmptyTitle');
  const description = isCustomRange
    ? createCalendarDateRangeFormatter(resolveRendererLocale(i18n.resolvedLanguage))(props.range)
    : t('state.periodEmptyDescription', { period: t(PERIOD_TRANSLATION_KEYS[props.period]) });

  return (
    <section className="state-panel">
      <CalendarX2 size={ICON_SIZE_EMPTY_STATE} />
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
};

export default PeriodEmptyState;
