import React from 'react';
import { BarChart3, Boxes, Gauge, MessageSquareText, Wrench } from 'lucide-react';

export type ViewKey = 'overview' | 'sessions' | 'tools' | 'performance' | 'wrapped';

interface SidebarProps {
  activeView: ViewKey;
  warningCount: number;
  onChange: (view: ViewKey) => void;
}

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'sessions', label: 'Sessions', icon: MessageSquareText },
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'performance', label: 'Performance', icon: Gauge },
  { key: 'wrapped', label: 'Wrapped', icon: Boxes },
];

const Sidebar: React.FC<SidebarProps> = ({ activeView, warningCount, onChange }) => (
  <aside className="sidebar">
    <nav className="nav-list" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;

        return (
          <button
            key={item.key}
            type="button"
            className={activeView === item.key ? 'nav-item active' : 'nav-item'}
            onClick={() => onChange(item.key)}
            title={item.label}
          >
            <Icon size={14} strokeWidth={1.9} />
            <span>{item.label}</span>
            {item.key === 'wrapped' && warningCount > 0 ? (
              <em className="nav-badge">{warningCount}</em>
            ) : null}
          </button>
        );
      })}
    </nav>
  </aside>
);

export default Sidebar;
