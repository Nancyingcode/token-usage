import React from 'react';
import { BarChart3, Boxes, Gauge, MessageSquareText, WalletCards, Wrench } from 'lucide-react';
import { ICON_SIZE_SMALL, NAV_ICON_STROKE_WIDTH } from '../constants/ui';

export type ViewKey = 'overview' | 'budgets' | 'sessions' | 'tools' | 'performance' | 'wrapped';

interface SidebarProps {
  activeView: ViewKey;
  warningCount: number;
  budgetAlertCount?: number;
  onChange: (view: ViewKey) => void;
}

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: typeof BarChart3 }> = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'budgets', label: 'Budgets', icon: WalletCards },
  { key: 'sessions', label: 'Sessions', icon: MessageSquareText },
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'performance', label: 'Performance', icon: Gauge },
  { key: 'wrapped', label: 'Wrapped', icon: Boxes },
];

const shouldShowWarningBadge = (view: ViewKey, warningCount: number): boolean =>
  view === 'wrapped' && warningCount > 0;

const shouldShowBudgetBadge = (view: ViewKey, budgetAlertCount: number): boolean =>
  view === 'budgets' && budgetAlertCount > 0;

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  warningCount,
  budgetAlertCount = 0,
  onChange,
}) => (
  <aside className="sidebar">
    <nav className="nav-list" aria-label="Primary navigation">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const showWarningBadge = shouldShowWarningBadge(item.key, warningCount);
        const showBudgetBadge = shouldShowBudgetBadge(item.key, budgetAlertCount);
        const badgeCount = showWarningBadge ? warningCount : budgetAlertCount;
        const showBadge = showWarningBadge || showBudgetBadge;

        return (
          <button
            key={item.key}
            type="button"
            className={activeView === item.key ? 'nav-item active' : 'nav-item'}
            onClick={() => onChange(item.key)}
            title={item.label}
          >
            <Icon size={ICON_SIZE_SMALL} strokeWidth={NAV_ICON_STROKE_WIDTH} />
            <span>{item.label}</span>
            {showBadge ? <em className="nav-badge">{badgeCount}</em> : null}
          </button>
        );
      })}
    </nav>
  </aside>
);

export default Sidebar;
