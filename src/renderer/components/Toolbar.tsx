import React from 'react';
import { RefreshCw, Sidebar as SidebarIcon } from 'lucide-react';
import type { ViewKey } from './Sidebar';

interface ToolbarProps {
  activeView: ViewKey;
  loading: boolean;
  scannedAt?: string;
  onRefresh: () => void;
}

const VIEW_LABELS: Record<ViewKey, string> = {
  overview: 'Overview',
  sessions: 'Sessions',
  tools: 'Tools',
  performance: 'Performance',
  wrapped: 'Wrapped',
};

const Toolbar: React.FC<ToolbarProps> = ({ activeView, loading, scannedAt, onRefresh }) => (
  <header className="toolbar">
    <div className="toolbar-title">
      <SidebarIcon size={14} strokeWidth={1.8} />
      <strong>{VIEW_LABELS[activeView]}</strong>
      <span className="daemon-pill">
        <i />
        Daemon
      </span>
      {scannedAt ? <span className="scan-time">{formatDateTime(scannedAt)}</span> : null}
    </div>

    <div className="toolbar-actions">
      <div className="period-toggle" aria-label="Date range">
        <button type="button">Today</button>
        <button type="button">Week</button>
        <button type="button" className="active">
          Month
        </button>
      </div>
      <button
        className="icon-button"
        type="button"
        onClick={onRefresh}
        disabled={loading}
        title="Refresh"
      >
        <RefreshCw size={14} className={loading ? 'spinning' : undefined} />
      </button>
    </div>
  </header>
);

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default Toolbar;
