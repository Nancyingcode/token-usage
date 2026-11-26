/**
 * @file 应用工具栏
 * @description 组合时间范围、语言、扫描状态和刷新操作，并保持键盘与辅助技术可用性。
 */
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatLocalDateKey } from '../../shared/calendarDate';
import type { SupportedLocale } from '../../shared/i18n/locale';
import type { UsageDateRange, UsagePeriod } from '../../shared/usageTypes';
import { ICON_SIZE_SMALL } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { createCalendarDateRangeFormatter, formatShortDateTime } from '../utils/formatters';
import { hasPeriodFilter, resolveToolbarScanState } from '../utils/toolbarState';
import DateRangeDialog from './DateRangeDialog';
import LanguageSelector from './LanguageSelector';
import SelectMenu from './SelectMenu';
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

interface OverviewDateRangeControl {
  appliedRange?: UsageDateRange;
  getInitialRange: (now: Date) => UsageDateRange;
  onApply: (range: UsageDateRange) => void;
}

export interface ToolbarProps extends PeriodToggleProps {
  activeView: ViewKey;
  loading: boolean;
  error?: string | null;
  scannedAt?: string;
  onRefresh: () => void;
  overviewDateRange?: OverviewDateRangeControl;
}

interface CustomPeriodButton {
  label: string;
  active: boolean;
  onOpen: () => void;
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

export const PeriodToggle: React.FC<PeriodToggleProps & { custom?: CustomPeriodButton }> = ({
  period,
  onPeriodChange,
  labels = DEFAULT_PERIOD_LABELS,
  custom,
}) => (
  <div
    className={custom ? 'period-toggle period-toggle--overview' : 'period-toggle'}
    role="group"
    aria-label={labels.ariaLabel}
  >
    {PERIOD_OPTIONS.map((option) => {
      const selected = !custom?.active && period === option.value;
      return (
        <button
          key={option.value}
          type="button"
          className={selected ? 'active' : undefined}
          aria-pressed={selected}
          onClick={() => onPeriodChange(option.value)}
        >
          {labels[option.labelKey]}
        </button>
      );
    })}
    {custom ? (
      <button
        type="button"
        className={custom.active ? 'active' : undefined}
        aria-pressed={custom.active}
        aria-haspopup="dialog"
        onClick={custom.onOpen}
      >
        {custom.label}
      </button>
    ) : null}
  </div>
);

type OverviewPeriod = UsagePeriod | 'custom';

const OverviewPeriodControls: React.FC<{
  period: UsagePeriod;
  labels: PeriodLabels;
  onPeriodChange: (period: UsagePeriod) => void;
  control: OverviewDateRangeControl;
}> = ({ period, labels, onPeriodChange, control }) => {
  const { t, i18n } = useTranslation('common');
  const [dialog, setDialog] = React.useState<{
    initialRange: UsageDateRange;
    today: string;
  } | null>(null);
  const { appliedRange, getInitialRange, onApply } = control;
  const customLabel = t('toolbar.customRange.label');
  const activeRangeLabel = appliedRange
    ? createCalendarDateRangeFormatter(resolveRendererLocale(i18n.resolvedLanguage))(appliedRange)
    : null;
  const options = [
    ...PERIOD_OPTIONS.map(({ value, labelKey }) => ({ value, label: labels[labelKey] })),
    { value: 'custom' as const, label: customLabel },
  ];

  const openDialog = (): void => {
    const now = new Date();
    setDialog({
      initialRange: appliedRange ?? getInitialRange(now),
      today: formatLocalDateKey(now),
    });
  };
  const closeDialog = (): void => setDialog(null);
  const handleCompactChange = (next: OverviewPeriod): void => {
    if (next === 'custom') {
      openDialog();
    } else {
      onPeriodChange(next);
    }
  };

  return (
    <>
      <PeriodToggle
        period={period}
        labels={labels}
        onPeriodChange={onPeriodChange}
        custom={{ label: customLabel, active: appliedRange !== undefined, onOpen: openDialog }}
      />
      <SelectMenu<OverviewPeriod>
        className="overview-period-menu"
        value={appliedRange ? 'custom' : period}
        options={options}
        onChange={handleCompactChange}
        ariaLabel={labels.ariaLabel}
        loadingLabel={t('state.loadingOptions')}
        emptyLabel={t('state.noOptions')}
      />
      <span className="visually-hidden" role="status">
        {activeRangeLabel ? t('toolbar.customRange.applied', { range: activeRangeLabel }) : null}
      </span>
      {dialog ? (
        <DateRangeDialog
          {...dialog}
          onCancel={closeDialog}
          onApply={(range) => {
            onApply(range);
            closeDialog();
          }}
        />
      ) : null}
    </>
  );
};

const Toolbar: React.FC<ToolbarProps> = ({
  activeView,
  loading,
  error = null,
  scannedAt,
  onRefresh,
  period,
  onPeriodChange,
  overviewDateRange,
}) => {
  const { t, i18n } = useTranslation('common');
  const [changingLocale, setChangingLocale] = React.useState(false);
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const showPeriodToggle = hasPeriodFilter(activeView);
  const customRangeControl = activeView === 'overview' ? overviewDateRange : undefined;
  const showPresetToggle = showPeriodToggle && !customRangeControl;
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
        {customRangeControl ? (
          <OverviewPeriodControls
            period={period}
            labels={periodLabels}
            onPeriodChange={onPeriodChange}
            control={customRangeControl}
          />
        ) : null}
        {showPresetToggle ? (
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
