/**
 * @file 应用工具栏
 * @description 组合时间范围、语言、扫描状态和刷新操作，并保持键盘与辅助技术可用性。
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import type { UsagePeriod } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatShortDateTime } from '../utils/formatters';
import { hasPeriodFilter, resolveToolbarScanState } from '../utils/toolbarState';
import LanguageSelector from './LanguageSelector';
import type { ViewKey } from './Sidebar';

interface PeriodLabels {
  ariaLabel: string;
  today: string;
  week: string;
  month: string;
  total: string;
}

interface PeriodToggleProps {
  period: UsagePeriod;
  onPeriodChange: (period: UsagePeriod) => void;
  labels?: PeriodLabels;
}

export interface ToolbarProps extends PeriodToggleProps {
  activeView: ViewKey;
  loading: boolean;
  error?: string | null;
  scannedAt?: string;
  onRefresh: () => void;
}

const DEFAULT_PERIOD_LABELS: PeriodLabels = {
  ariaLabel: 'Date range',
  today: 'Today',
  week: 'Week',
  month: 'Month',
  total: 'Total',
};

const PERIOD_OPTIONS: Array<{
  value: UsagePeriod;
  labelKey: keyof Omit<PeriodLabels, 'ariaLabel'>;
}> = [
  { value: 'today', labelKey: 'today' },
  { value: 'week', labelKey: 'week' },
  { value: 'month', labelKey: 'month' },
  { value: 'total', labelKey: 'total' },
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
  error = null,
  scannedAt,
  onRefresh,
  period,
  onPeriodChange,
}) => {
  const { t, i18n } = useTranslation('common');
  const [changingLocale, setChangingLocale] = React.useState(false);
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const showPeriodToggle = hasPeriodFilter(activeView);
  const scanState = resolveToolbarScanState({ loading, error, scannedAt });
  const periodLabels: PeriodLabels = {
    ariaLabel: t('toolbar.dateRange'),
    today: t('toolbar.today'),
    week: t('toolbar.week'),
    month: t('toolbar.month'),
    total: t('toolbar.total'),
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
    <div className="title-bar-toolbar">
      <div className="toolbar-title">
        <span className={`scan-status scan-status--${scanState}`}>
          <i aria-hidden="true" />
          {t(`toolbar.scanState.${scanState}`)}
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
    </div>
  );
};

export default Toolbar;
