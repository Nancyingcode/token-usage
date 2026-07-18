import React from 'react';
import { CalendarX2 } from 'lucide-react';
import type { UsagePeriod } from '../../shared/usageTypes';
import { ICON_SIZE_EMPTY_STATE } from '../constants/ui';

interface PeriodEmptyStateProps {
  period: UsagePeriod;
}

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  today: 'today',
  week: 'the last 7 days',
  month: 'the last 30 days',
};

const PeriodEmptyState: React.FC<PeriodEmptyStateProps> = ({ period }) => (
  <section className="state-panel">
    <CalendarX2 size={ICON_SIZE_EMPTY_STATE} />
    <div>
      <h2>No sessions in this period</h2>
      <p>No Codex sessions started during {PERIOD_LABELS[period]}.</p>
    </div>
  </section>
);

export default PeriodEmptyState;
