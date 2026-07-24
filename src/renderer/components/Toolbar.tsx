import React from 'react';
import { RefreshCw, Sidebar as SidebarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import type { UsagePeriod } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL, ICON_STROKE_WIDTH } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatShortDateTime } from '../utils/formatters';
import LanguageSelector from './LanguageSelector';
import type { ViewKey } from './Sidebar';

interface PeriodLabels {
  ariaLabel: string;
  today: string;
  week: string;
  month: string;
}

interface PeriodToggleProps {
  period: UsagePeriod;
  onPeriodChange: (period: UsagePeriod) => void;
  labels?: PeriodLabels;
}

interface ToolbarProps extends PeriodToggleProps {
  activeView: ViewKey;
  loading: boolean;
  scannedAt?: string;
  onRefresh: () => void;
}

const VIEW_TRANSLATION_KEYS = {
  overview: 'navigation.overview',
  budgets: 'navigation.budgets',
  sessions: 'navigation.sessions',
  tools: 'navigation.tools',
  performance: 'navigation.performance',
  wrapped: 'navigation.wrapped',
} as const satisfies Record<ViewKey, string>;

const DEFAULT_PERIOD_LABELS: PeriodLabels = {
  ariaLabel: 'Date range',
  today: 'Today',
  week: 'Week',
  month: 'Month',
};

const PERIOD_OPTIONS: Array<{
  value: UsagePeriod;
  labelKey: keyof Omit<PeriodLabels, 'ariaLabel'>;
}> = [
  { value: 'today', labelKey: 'today' },
  { value: 'week', labelKey: 'week' },
  { value: 'month', labelKey: 'month' },
];

export const PeriodToggle: React.FC<PeriodToggleProps> = ({
  period,
  onPeriodChange,
  labels = DEFAULT_PERIOD_LABELS,
}) => (
  <div className="period-toggle" aria-label={labels.ariaLabel}>
    {PERIOD_OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        className={period === option.value ? 'active' : undefined}
        aria-pressed={period === option.value}
        onClick={() => onPeriodChange(option.value)}
      >
        {labels[option.labelKey]}
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
  const { t, i18n } = useTranslation('common');
  const [changingLocale, setChangingLocale] = React.useState(false);
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const showPeriodToggle = activeView !== 'budgets';
  const periodLabels: PeriodLabels = {
    ariaLabel: t('toolbar.dateRange'),
    today: t('toolbar.today'),
    week: t('toolbar.week'),
    month: t('toolbar.month'),
  };
  const handleLocaleChange = async (nextLocale: SupportedLocale): Promise<void> => {
    setChangingLocale(true);

    try {
      await window.codexUsage.locale.set(nextLocale);
    } catch {
      window.alert(t('toolbar.languageChangeFailed'));
    } finally {
      setChangingLocale(false);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <SidebarIcon size={ICON_SIZE_SMALL} strokeWidth={ICON_STROKE_WIDTH} />
        <strong>{t(VIEW_TRANSLATION_KEYS[activeView])}</strong>
        <span className="daemon-pill">
          <i />
          {t('app.daemon')}
        </span>
        {scannedAt ? (
          <span className="scan-time">
            {formatShortDateTime(scannedAt, locale, t('value.unknownDate'))}
          </span>
        ) : null}
      </div>

      <div className="toolbar-actions">
        {showPeriodToggle ? (
          <PeriodToggle period={period} onPeriodChange={onPeriodChange} labels={periodLabels} />
        ) : null}
        <LanguageSelector
          locale={locale}
          onChange={(nextLocale) => void handleLocaleChange(nextLocale)}
          ariaLabel={t('toolbar.language')}
          disabled={changingLocale}
        />
        <button
          className="icon-button"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title={t('toolbar.refresh')}
          aria-label={t('toolbar.refresh')}
        >
          <RefreshCw size={ICON_SIZE_SMALL} className={loading ? 'spinning' : undefined} />
        </button>
      </div>
    </header>
  );
};

export default Toolbar;
