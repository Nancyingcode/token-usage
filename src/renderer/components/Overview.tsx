/**
 * @file 用量概览视图
 * @description
 * 展示令牌与成本摘要、每日趋势和活动分布，并计算图表所需的展示模型。
 */
import { PricingQualityNotice } from './PricingQualityNotice';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Coins, FileCode2, LockKeyhole, MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { parseCalendarDate } from '../../shared/calendarDate';
import type {
  CostEstimate,
  ModelPricingEntry,
  UnknownModelPricing,
} from '../../shared/budgetTypes';
import { buildOverviewCostEstimates } from '../../shared/pricing';
import { getLocalDateKey } from '../../shared/usageMath';
import { getCachePercentage } from '../../shared/usageMetrics';
import type { UsageDateRange, UsageDay, UsagePeriod, UsageSummary } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import {
  ACTIVITY_WEEK_COUNT,
  buildActivityCells,
  buildActivityMonthLabels,
  getClippedActivityRange,
} from '../utils/activityGrid';
import type { OverviewDateFilter } from '../utils/appContentModel';
import {
  createCalendarDateRangeFormatter,
  formatCompactNumber,
  formatNumber,
  formatUsd,
} from '../utils/formatters';
import { buildOverviewTrendBuckets, buildTrendTokenTicks } from '../utils/overviewTrend';
import MetricCard from './MetricCard';
import PageHeader from './PageHeader';

interface OverviewProps {
  summary: UsageSummary;
  pricing: ModelPricingEntry[];
  unknownModelPricing?: UnknownModelPricing;
  period: UsagePeriod;
  scannedAt: string;
  overviewDateFilter?: OverviewDateFilter;
}

type TrendDay = UsageDay & { endDate?: string };

interface TrendChartProps {
  days: TrendDay[];
  dailyCosts: Map<string, CostEstimate>;
  filterKey: string;
}

interface ActivityGridProps {
  days: UsageDay[];
  period: UsagePeriod | UsageDateRange;
  anchorDate: string;
  sessionCount: number;
}

const TREND_HISTORY_DAYS = 24;
const ISO_DATE_LENGTH = 10;
const CHART_VIEWBOX_WIDTH = 584;
const CHART_VIEWBOX_HEIGHT = 212;
const CHART_VIEWBOX = `0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`;
const CHART_LEFT = 24;
const CHART_RIGHT = 560;
const CHART_BASELINE = 178;
const CHART_VERTICAL_RANGE = 136;
const CHART_AXIS_LABEL_GAP = 8;
const CHART_PEAK_LABEL_OFFSET_X = 6;
const CHART_PEAK_LABEL_OFFSET_Y = 9;
const DATE_LABEL_START_INDEX = 5;
const CHART_DATE_LABEL_Y = 208;
const MAX_X_AXIS_LABEL_COUNT = 8;
const TOOLTIP_LEFT_BOUNDARY = 160;
const TOOLTIP_RIGHT_BOUNDARY = 424;
const TREND_HIT_RADIUS = 12;
const ACTIVE_POINT_RADIUS = 4.8;
const INACTIVE_POINT_RADIUS = 2.4;
const PERCENT_SCALE = 100;

export type TooltipPlacement = 'left' | 'center' | 'right';

export interface TrendPoint {
  x: number;
  y: number;
  day: TrendDay;
  cost: number;
  pricingIncomplete: boolean;
  assumedPricing: boolean;
  conditionalPricing?: boolean;
  placement: TooltipPlacement;
}

const getOverviewFilterKey = (period: UsagePeriod, range?: UsageDateRange): string =>
  range ? `${range.startDate}:${range.endDate}` : period;

const getTrendY = (tokens: number, max: number): number =>
  CHART_BASELINE - (tokens / max) * CHART_VERTICAL_RANGE;

export const buildTrendPoints = (
  days: TrendDay[],
  max: number,
  dailyCosts: Map<string, CostEstimate>
): TrendPoint[] => {
  return days.map((day, index) => {
    const x =
      days.length <= 1
        ? CHART_LEFT
        : CHART_LEFT + (index / (days.length - 1)) * (CHART_RIGHT - CHART_LEFT);
    const y = getTrendY(day.totalTokens, max);
    const costEstimate = dailyCosts.get(day.date);

    return {
      x,
      y,
      day,
      cost: costEstimate?.pricedCostUsd ?? 0,
      pricingIncomplete: (costEstimate?.unpricedTokens ?? 0) > 0,
      assumedPricing: (costEstimate?.assumedTokens ?? 0) > 0,
      ...(costEstimate?.conditionAssumedTokens ? { conditionalPricing: true } : {}),
      placement: getTooltipPlacement(x),
    };
  });
};

const getTooltipPlacement = (x: number): TooltipPlacement => {
  if (x < TOOLTIP_LEFT_BOUNDARY) {
    return 'left';
  }

  if (x > TOOLTIP_RIGHT_BOUNDARY) {
    return 'right';
  }

  return 'center';
};

const toChartPercentage = (value: number, size: number): string =>
  `${(value / size) * PERCENT_SCALE}%`;

const getTooltipStyle = (point: TrendPoint): React.CSSProperties => {
  return {
    '--tooltip-x': toChartPercentage(point.x, CHART_VIEWBOX_WIDTH),
    '--tooltip-y': toChartPercentage(point.y, CHART_VIEWBOX_HEIGHT),
  } as React.CSSProperties;
};

const formatActivityDate = (value: string, formatter: Intl.DateTimeFormat): string => {
  const date = parseCalendarDate(value);
  return date ? formatter.format(date) : value;
};

const getTrendAxisPoints = (points: TrendPoint[], showEndpoints: boolean): TrendPoint[] => {
  if (!showEndpoints) {
    const step = Math.max(1, Math.ceil(points.length / MAX_X_AXIS_LABEL_COUNT));
    return points.filter((_, index) => index % step === 0);
  }

  const labelCount = Math.min(points.length, MAX_X_AXIS_LABEL_COUNT);
  if (labelCount < 2) {
    return points;
  }

  const step = (points.length - 1) / (labelCount - 1);
  return Array.from({ length: labelCount }, (_, index) => points[Math.round(index * step)]);
};

const shouldShowAssumedPricing = (
  assumedPricing: boolean,
  pricingIncomplete: boolean,
  isDateRange: boolean
): boolean => assumedPricing && (isDateRange || !pricingIncomplete);

const TrendChart: React.FC<TrendChartProps> = ({ days, dailyCosts, filterKey }) => {
  const { t: tBudgets } = useTranslation('budgets');
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [rangeMotion, setRangeMotion] = useState({ filterKey, shouldAnimate: false });
  if (rangeMotion.filterKey !== filterKey) {
    setRangeMotion({ filterKey, shouldAnimate: true });
  }
  const rangeMotionClass = rangeMotion.shouldAnimate ? 'trend-range-enter' : undefined;
  const isDateRange = days[0]?.endDate !== undefined;
  const { peakTokens, ticks, points } = useMemo(() => {
    const peakTokens = Math.max(0, ...days.map(({ totalTokens }) => totalTokens));
    const tickValues = buildTrendTokenTicks(peakTokens);
    const scaleMax = tickValues[tickValues.length - 1];
    const ticks = tickValues.map((value) => ({ value, y: getTrendY(value, scaleMax) }));
    const formatRange = isDateRange ? createCalendarDateRangeFormatter(locale) : undefined;
    const points = buildTrendPoints(days, scaleMax, dailyCosts).map((point) => {
      const { date, endDate } = point.day;
      const dateLabel = formatRange && endDate ? formatRange({ startDate: date, endDate }) : date;
      return { ...point, dateLabel };
    });
    return { peakTokens, ticks, points };
  }, [dailyCosts, days, isDateRange, locale]);
  const activePoint = points.find(({ day }) => day.date === activeDate);
  if (activeDate !== null && !activePoint) {
    setActiveDate(null);
  }
  const peakPoint =
    peakTokens > 0 ? points.find(({ day }) => day.totalTokens === peakTokens) : null;
  const alignPeakRight = peakPoint?.placement === 'right';
  const showActiveAssumedPricing = activePoint
    ? shouldShowAssumedPricing(
        activePoint.assumedPricing,
        activePoint.pricingIncomplete,
        isDateRange
      )
    : false;
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const showArea = points.length > 1;
  const area = showArea
    ? `${path} L${CHART_RIGHT},${CHART_BASELINE} L${CHART_LEFT},${CHART_BASELINE} Z`
    : '';
  const axisPoints = getTrendAxisPoints(points, isDateRange);
  const lastPoint = points.at(-1);

  return (
    <div className="trend-chart">
      <div className="trend-chart-plot">
        <svg role="group" aria-label={t('overview.tokenTrendChart')}>
          {/* 数据点和日期跟随折线定位，同时保持固定的像素尺寸。 */}
          <svg
            width="100%"
            height="100%"
            viewBox={CHART_VIEWBOX}
            preserveAspectRatio="none"
            overflow="visible"
            aria-hidden="true"
          >
            {ticks.map(({ value, y }) => (
              <line
                key={value}
                className="trend-grid-line"
                x1={CHART_LEFT}
                x2={CHART_RIGHT}
                y1={y}
                y2={y}
              />
            ))}
            <g key={filterKey} className={rangeMotionClass}>
              {area ? <path className="trend-area" d={area} /> : null}
              {path ? <path className="trend-line" d={path} /> : null}
            </g>
            {activePoint ? (
              <line
                className="trend-guide"
                x1={activePoint.x}
                x2={activePoint.x}
                y1={activePoint.y}
                y2={CHART_BASELINE}
              />
            ) : null}
          </svg>
          <g className="trend-y-axis" aria-hidden="true">
            {ticks.map(({ value, y }) => (
              <text
                key={value}
                x={toChartPercentage(CHART_LEFT, CHART_VIEWBOX_WIDTH)}
                y={toChartPercentage(y, CHART_VIEWBOX_HEIGHT)}
                dx={-CHART_AXIS_LABEL_GAP}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatCompactNumber(value, locale)}
              </text>
            ))}
          </g>
          <g key={filterKey} className={rangeMotionClass} aria-hidden="true">
            {points.map(({ day, x, y }) => {
              const active = day.date === activeDate;
              return (
                <circle
                  key={day.date}
                  className={active ? 'trend-point active' : 'trend-point'}
                  cx={toChartPercentage(x, CHART_VIEWBOX_WIDTH)}
                  cy={toChartPercentage(y, CHART_VIEWBOX_HEIGHT)}
                  r={active ? ACTIVE_POINT_RADIUS : INACTIVE_POINT_RADIUS}
                />
              );
            })}
          </g>
          {points.map((point) => {
            const x = toChartPercentage(point.x, CHART_VIEWBOX_WIDTH);
            const y = toChartPercentage(point.y, CHART_VIEWBOX_HEIGHT);
            const showAssumed = shouldShowAssumedPricing(
              point.assumedPricing,
              point.pricingIncomplete,
              isDateRange
            );
            const pricingState = [
              point.pricingIncomplete ? t('overview.pricingState') : '',
              showAssumed ? t('overview.assumedPricingState') : '',
            ].join('');
            const ariaLabel = t('overview.trendPoint', {
              date: point.dateLabel,
              tokens: formatNumber(point.day.totalTokens, locale),
              cost: formatUsd(point.cost, locale),
              pricingState: [
                pricingState,
                point.conditionalPricing ? tBudgets('pricing.qualityTitle') : '',
              ]
                .filter(Boolean)
                .join(' · '),
            });

            return (
              <circle
                key={point.day.date}
                className="trend-hit-target"
                cx={x}
                cy={y}
                r={TREND_HIT_RADIUS}
                tabIndex={0}
                role="img"
                aria-label={ariaLabel}
                onMouseEnter={() => setActiveDate(point.day.date)}
                onMouseLeave={() => setActiveDate(null)}
                onFocus={() => setActiveDate(point.day.date)}
                onBlur={() => setActiveDate(null)}
              />
            );
          })}
          {peakPoint ? (
            <text
              className="trend-peak-label"
              x={toChartPercentage(peakPoint.x, CHART_VIEWBOX_WIDTH)}
              y={toChartPercentage(peakPoint.y, CHART_VIEWBOX_HEIGHT)}
              dx={alignPeakRight ? -CHART_PEAK_LABEL_OFFSET_X : CHART_PEAK_LABEL_OFFSET_X}
              dy={-CHART_PEAK_LABEL_OFFSET_Y}
              textAnchor={alignPeakRight ? 'end' : 'start'}
              aria-hidden="true"
            >
              {formatCompactNumber(peakTokens, locale)}
            </text>
          ) : null}
          <g className="trend-x-axis">
            {axisPoints.map((point) => {
              const axisDate =
                point === lastPoint ? (point.day.endDate ?? point.day.date) : point.day.date;
              return (
                <text
                  key={point.day.date}
                  x={toChartPercentage(point.x, CHART_VIEWBOX_WIDTH)}
                  y={toChartPercentage(CHART_DATE_LABEL_Y, CHART_VIEWBOX_HEIGHT)}
                  textAnchor="middle"
                >
                  {axisDate.slice(DATE_LABEL_START_INDEX)}
                </text>
              );
            })}
          </g>
        </svg>
        {activePoint ? (
          <div
            className={`trend-tooltip ${activePoint.placement}`}
            style={getTooltipStyle(activePoint)}
            aria-hidden="true"
          >
            <strong>{activePoint.dateLabel}</strong>
            <div className="trend-tooltip-cost">
              <span>{t('overview.estimatedCost')}</span>
              <b>{formatUsd(activePoint.cost, locale)}</b>
            </div>
            {activePoint.pricingIncomplete ? (
              <span className="pricing-incomplete-label">{t('overview.pricingIncomplete')}</span>
            ) : null}
            {showActiveAssumedPricing ? (
              <span className="pricing-assumed-label">{t('overview.assumedPricing')}</span>
            ) : null}
            {activePoint.conditionalPricing ? (
              <span>{tBudgets('pricing.qualityTitle')}</span>
            ) : null}
            <dl>
              <div>
                <dt>{t('overview.total')}</dt>
                <dd>{formatNumber(activePoint.day.totalTokens, locale)}</dd>
              </div>
              <div className="input">
                <dt>{t('overview.input')}</dt>
                <dd>{formatNumber(activePoint.day.inputTokens, locale)}</dd>
              </div>
              <div className="output">
                <dt>{t('overview.output')}</dt>
                <dd>{formatNumber(activePoint.day.outputTokens, locale)}</dd>
              </div>
              <div className="cached">
                <dt>{t('overview.cached')}</dt>
                <dd>{formatNumber(activePoint.day.cachedInputTokens, locale)}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const ActivityGrid: React.FC<ActivityGridProps> = ({ days, period, anchorDate, sessionCount }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [showFullWindow, setShowFullWindow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridId = useId();
  const range = typeof period === 'string' ? undefined : period;
  const shouldAnchorEnd = range !== undefined || showFullWindow;
  // 日历使用 UTC 保留日期键的自然日语义；格式化器随组件卸载释放，语言变化时重建。
  const dateFormatters = useMemo(
    () => ({
      day: new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }),
      month: new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }),
    }),
    [locale]
  );
  const cells = useMemo(
    () =>
      buildActivityCells(days, period, anchorDate, showFullWindow).map((cell) => ({
        ...cell,
        formattedDate: cell.inPeriod ? formatActivityDate(cell.date, dateFormatters.day) : '',
        formattedTokens: cell.inPeriod ? formatNumber(cell.tokens, locale) : '',
      })),
    [days, period, anchorDate, showFullWindow, locale, dateFormatters]
  );
  const monthLabels = useMemo(
    () =>
      new Map(
        buildActivityMonthLabels(cells).map(({ date, weekIndex }) => [
          weekIndex,
          formatActivityDate(date, dateFormatters.month),
        ])
      ),
    [cells, dateFormatters]
  );
  const lastCell = cells.at(-1);
  const weekCount = (lastCell?.weekIndex ?? -1) + 1;
  const visibleEndDate = lastCell?.date;
  const showWindowToggle = showFullWindow || weekCount < ACTIVITY_WEEK_COUNT;
  const activeCell = cells.find(({ date }) => date === activeDate);
  const clippedRange = range ? getClippedActivityRange(range) : undefined;
  useEffect(() => {
    const scroll = scrollRef.current;
    if (shouldAnchorEnd && scroll) {
      // 窄窗口优先呈现用户所选的结束周，较早的自然周仍可横向浏览。
      scroll.scrollLeft = scroll.scrollWidth;
    }
  }, [shouldAnchorEnd, weekCount, visibleEndDate]);

  return (
    <article className="panel activity-panel">
      <div className="panel-heading compact">
        <div>
          <h3>{t('overview.activity')}</h3>
          <p>{t('overview.sessionsScanned', { count: sessionCount })}</p>
          {clippedRange ? (
            <p>
              {t('overview.activityVisibleRange', {
                range: createCalendarDateRangeFormatter(locale)(clippedRange),
              })}
            </p>
          ) : null}
        </div>
        {showWindowToggle ? (
          <button
            className="secondary-button activity-window-toggle"
            type="button"
            aria-controls={gridId}
            aria-expanded={showFullWindow}
            onClick={() => setShowFullWindow((visible) => !visible)}
          >
            {showFullWindow
              ? t('overview.activitySelectedWeeks')
              : t('overview.activityShowWeeks', { count: ACTIVITY_WEEK_COUNT })}
          </button>
        ) : null}
      </div>
      <div className="activity-calendar-scroll" ref={scrollRef}>
        <div
          className="activity-calendar"
          style={{ '--activity-week-count': weekCount } as React.CSSProperties}
        >
          <div className="activity-months" aria-hidden="true">
            {Array.from({ length: weekCount }, (_, weekIndex) => {
              const monthDate = monthLabels.get(weekIndex);
              return <span key={weekIndex}>{monthDate ?? ''}</span>;
            })}
          </div>
          <div className="activity-wrap">
            <div className="activity-labels" aria-hidden="true">
              <span className="monday">{t('overview.weekday.monday')}</span>
              <span className="wednesday">{t('overview.weekday.wednesday')}</span>
              <span className="friday">{t('overview.weekday.friday')}</span>
            </div>
            <div
              id={gridId}
              className="activity-grid"
              role="group"
              aria-label={t('overview.activityCalendar')}
              data-day-count={cells.length}
              data-week-count={weekCount}
            >
              {cells.map((cell) => {
                const active = activeDate === cell.date;
                const { formattedDate, formattedTokens } = cell;

                return (
                  <span key={cell.date} className="activity-cell-slot">
                    {cell.isFuture ? (
                      <span className="activity-cell future" aria-hidden="true" />
                    ) : cell.inPeriod ? (
                      <span
                        className={`activity-cell level-${cell.level}${active ? ' active' : ''}`}
                        role="img"
                        tabIndex={0}
                        aria-label={t('overview.activityDay', {
                          date: formattedDate,
                          tokens: formattedTokens,
                        })}
                        data-testid={`activity-day-${cell.date}`}
                        onMouseEnter={() => setActiveDate(cell.date)}
                        onMouseLeave={() => setActiveDate(null)}
                        onFocus={() => setActiveDate(cell.date)}
                        onBlur={() => setActiveDate(null)}
                      />
                    ) : (
                      <span className="activity-cell outside-period" aria-hidden="true" />
                    )}
                  </span>
                );
              })}
            </div>
            {activeCell ? (
              <span
                className="activity-tooltip"
                style={
                  {
                    '--activity-tooltip-week': activeCell.weekIndex,
                    '--activity-tooltip-weekday': activeCell.weekday,
                  } as React.CSSProperties
                }
                role="tooltip"
              >
                <strong>{activeCell.formattedDate}</strong>
                <span>{t('overview.activityTokens', { tokens: activeCell.formattedTokens })}</span>
              </span>
            ) : null}
          </div>
          <div className="activity-legend" aria-label={t('overview.activityLegend')}>
            <span>{t('overview.activityLess')}</span>
            {Array.from({ length: 5 }, (_, level) => (
              <i key={level} className={`activity-cell level-${level}`} aria-hidden="true" />
            ))}
            <span>{t('overview.activityMore')}</span>
          </div>
        </div>
      </div>
    </article>
  );
};

const Overview: React.FC<OverviewProps> = ({
  summary,
  pricing,
  unknownModelPricing,
  period,
  scannedAt,
  overviewDateFilter,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const dateRange = overviewDateFilter?.range;
  const filterKey = getOverviewFilterKey(period, dateRange);
  const trend = useMemo(
    () => (dateRange ? buildOverviewTrendBuckets(summary.byDay, dateRange) : null),
    [dateRange, summary.byDay]
  );
  const days = trend?.buckets ?? summary.byDay.slice(-TREND_HISTORY_DAYS);
  const { totalCost, dailyCosts } = useMemo(() => {
    if (!trend) {
      return buildOverviewCostEstimates(summary.sessions, pricing, unknownModelPricing);
    }

    return buildOverviewCostEstimates(summary.sessions, pricing, unknownModelPricing, (session) =>
      trend.bucketStartByDay.get(getLocalDateKey(session.startedAt))
    );
  }, [summary.sessions, pricing, trend, unknownModelPricing]);
  const pricingIncomplete = totalCost.unpricedTokens > 0;
  const showAssumedPricing = shouldShowAssumedPricing(
    totalCost.assumedTokens > 0,
    pricingIncomplete,
    dateRange !== undefined
  );
  const pricingDetails = [];
  if (pricingIncomplete) {
    pricingDetails.push(
      t('overview.pricingIncomplete'),
      t('overview.unpricedTokens', {
        tokens: formatCompactNumber(totalCost.unpricedTokens, locale),
      })
    );
  }
  if (showAssumedPricing) {
    pricingDetails.push(
      t('overview.assumedPricing'),
      t('overview.assumedTokens', { tokens: formatCompactNumber(totalCost.assumedTokens, locale) })
    );
  }
  const costDetail =
    pricingDetails.length > 0
      ? pricingDetails.join(' · ')
      : t('overview.tokensPriced', {
          tokens: formatCompactNumber(summary.totals.totalTokens, locale),
        });
  const cachePercentage = getCachePercentage(
    summary.totals.inputTokens,
    summary.totals.cachedInputTokens
  );
  const anchorDate = overviewDateFilter?.today ?? scannedAt.slice(0, ISO_DATE_LENGTH);
  const description = dateRange
    ? t('overview.dateRangeSummary', { range: createCalendarDateRangeFormatter(locale)(dateRange) })
    : t('overview.description');
  const daysPerPoint = trend?.daysPerPoint ?? 1;
  const granularity =
    daysPerPoint === 1
      ? t('overview.trendGranularity.daily')
      : t('overview.trendGranularity.grouped', { days: formatNumber(daysPerPoint, locale) });

  return (
    <section className="page-stack page-stack--overview">
      <div className="overview-heading">
        <PageHeader title={tCommon('navigation.overview')} description={description} />
        <PricingQualityNotice quality={totalCost} layout="banner" />
      </div>
      <div className="overview-grid">
        <div key={`${filterKey}:${locale}`} className="metric-grid">
          <MetricCard
            label={t('overview.totalCost')}
            value={formatUsd(totalCost.pricedCostUsd, locale)}
            detail={costDetail}
            icon={Coins}
            emphasis="featured"
          />
          <MetricCard
            label={t('overview.tokens')}
            value={formatCompactNumber(summary.totals.totalTokens, locale)}
            detail={t('overview.fromCache', { percent: cachePercentage })}
            icon={LockKeyhole}
            emphasis="default"
          />
          <MetricCard
            label={t('overview.linesChanged')}
            value={formatCompactNumber(summary.totals.outputTokens, locale)}
            detail={t('overview.reasoning', {
              tokens: formatCompactNumber(summary.totals.reasoningOutputTokens, locale),
            })}
            icon={FileCode2}
            emphasis="default"
          />
          <MetricCard
            label={t('overview.sessions')}
            value={formatNumber(summary.sessions.length, locale)}
            detail={t('overview.projects', {
              count: summary.byProject.length,
            })}
            icon={MessageSquareText}
            emphasis="default"
          />
        </div>

        <article className="panel chart-panel">
          <div className="panel-heading compact">
            <div>
              <h3>{t('overview.tokenUsageTrend')}</h3>
              <p>{granularity}</p>
            </div>
          </div>
          <TrendChart days={days} dailyCosts={dailyCosts} filterKey={filterKey} />
          <div className="chart-legend">
            <span>
              <i aria-hidden="true" /> {t('overview.totalTokens')}
            </span>
          </div>
        </article>

        <ActivityGrid
          key={`activity:${filterKey}`}
          days={summary.byDay}
          period={dateRange ?? period}
          anchorDate={anchorDate}
          sessionCount={summary.sessions.length}
        />
      </div>
    </section>
  );
};

export default Overview;
