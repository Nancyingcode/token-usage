import React from 'react';
import { RefreshCw, Sidebar as SidebarIcon } from 'lucide-react';
import type { UsagePeriod } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL, ICON_STROKE_WIDTH } from '../constants/ui';
import { formatShortDateTime } from '../utils/formatters';
import type { ViewKey } from './Sidebar';

interface PeriodToggleProps {
  period: UsagePeriod;
  onPeriodChange: (period: UsagePeriod) => void;
}

interface ToolbarProps extends PeriodToggleProps {
  activeView: ViewKey;
  loading: boolean;
  scannedAt?: string;
  onRefresh: () => void;
}

const VIEW_LABELS: Record<ViewKey, string> = {
  overview: 'Overview',
  budgets: 'Budgets',
  sessions: 'Sessions',
  tools: 'Tools',
  performance: 'Performance',
  wrapped: 'Wrapped',
};

const PERIOD_OPTIONS: Array<{ value: UsagePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export const PeriodToggle: React.FC<PeriodToggleProps> = ({ period, onPeriodChange }) => (
  <div className="period-toggle" aria-label="Date range">
    {PERIOD_OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        className={period === option.value ? 'active' : undefined}
        aria-pressed={period === option.value}
        onClick={() => onPeriodChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Toolbar: React.FC<ToolbarProps> = ({
  activeView,
  loading,
  scannedAt,
  onRefresh,
  period,
  onPeriodChange,
}) => {
  const showPeriodToggle = activeView !== 'budgets';

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <SidebarIcon size={ICON_SIZE_SMALL} strokeWidth={ICON_STROKE_WIDTH} />
        <strong>{VIEW_LABELS[activeView]}</strong>
        <span className="daemon-pill">
          <i />
          Daemon
        </span>
        {scannedAt ? <span className="scan-time">{formatShortDateTime(scannedAt)}</span> : null}
      </div>

      <div className="toolbar-actions">
        {showPeriodToggle ? <PeriodToggle period={period} onPeriodChange={onPeriodChange} /> : null}
        <button
          className="icon-button"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={ICON_SIZE_SMALL} className={loading ? 'spinning' : undefined} />
        </button>
      </div>
    </header>
  );
};

export default Toolbar;
