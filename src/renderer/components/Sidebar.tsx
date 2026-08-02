import React from 'react';
import {
  BarChart3,
  Gauge,
  MessageSquareText,
  Settings,
  TrendingDown,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ICON_SIZE_SMALL, NAV_ICON_STROKE_WIDTH } from '../constants/ui';

export type ViewKey =
  'overview' | 'budgets' | 'costOptimization' | 'sessions' | 'tools' | 'performance' | 'wrapped';

interface SidebarProps {
  activeView: ViewKey;
  warningCount: number;
  budgetAlertCount?: number;
  onChange: (view: ViewKey) => void;
}

const NAV_GROUPS = [
  {
    key: 'insights',
    translationKey: 'navigation.group.insights',
    items: [
      { key: 'overview', translationKey: 'navigation.overview', icon: BarChart3 },
      { key: 'sessions', translationKey: 'navigation.sessions', icon: MessageSquareText },
      { key: 'tools', translationKey: 'navigation.tools', icon: Wrench },
      { key: 'performance', translationKey: 'navigation.performance', icon: Gauge },
    ],
  },
  {
    key: 'control',
    translationKey: 'navigation.group.control',
    items: [
      {
        key: 'costOptimization',
        translationKey: 'navigation.costOptimization',
        icon: TrendingDown,
      },
      { key: 'budgets', translationKey: 'navigation.budgets', icon: WalletCards },
      { key: 'wrapped', translationKey: 'navigation.wrapped', icon: Settings },
    ],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  translationKey: 'navigation.group.insights' | 'navigation.group.control';
  items: ReadonlyArray<{
    key: ViewKey;
    translationKey: `navigation.${ViewKey}`;
    icon: typeof BarChart3;
  }>;
}>;

const shouldShowWarningBadge = (view: ViewKey, warningCount: number): boolean =>
  view === 'wrapped' && warningCount > 0;

const shouldShowBudgetBadge = (view: ViewKey, budgetAlertCount: number): boolean =>
  view === 'budgets' && budgetAlertCount > 0;

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  warningCount,
  budgetAlertCount = 0,
  onChange,
}) => {
  const { t } = useTranslation('common');

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-mark" aria-hidden="true" />
        <strong>{t('app.title')}</strong>
      </div>
      <nav className="nav-list" aria-label={t('navigation.label')}>
        {NAV_GROUPS.map((group) => {
          const headingId = `navigation-group-${group.key}`;

          return (
            <section key={group.key} className="nav-group" aria-labelledby={headingId}>
              <h2 id={headingId} className="nav-group-title">
                {t(group.translationKey)}
              </h2>
              <div className="nav-group-items">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const label = t(item.translationKey);
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
                      title={label}
                    >
                      <Icon size={ICON_SIZE_SMALL} strokeWidth={NAV_ICON_STROKE_WIDTH} />
                      <span>{label}</span>
                      {showBadge ? <em className="nav-badge">{badgeCount}</em> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;
