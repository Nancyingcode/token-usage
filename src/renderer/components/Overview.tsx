/**
 * @file 用量概览视图
 * @description
 * 展示令牌与成本摘要、每日趋势和活动分布，并计算图表所需的展示模型。
 */
import React, { useState } from 'react';
import { Coins, FileCode2, LockKeyhole, MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CostEstimate,
  ModelPricingEntry,
  UnknownModelPricing,
} from '../../shared/budgetTypes';
import { buildDailyCostEstimates, getSummaryCostEstimate } from '../../shared/pricing';
import { getCachePercentage } from '../../shared/usageMetrics';
import type { UsageDay, UsagePeriod, UsageSummary } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import { buildActivityCells } from '../utils/activityGrid';
import { formatCompactNumber, formatNumber, formatUsd } from '../utils/formatters';
import MetricCard from './MetricCard';
import PageHeader from './PageHeader';

interface OverviewProps {
  summary: UsageSummary;
  pricing: ModelPricingEntry[];
  unknownModelPricing?: UnknownModelPricing;
  period: UsagePeriod;
  scannedAt: string;
}

interface TrendChartProps {
  days: UsageDay[];
  max: number;
  dailyCosts: Map<string, CostEstimate>;
}

interface ActivityGridProps {
  days: UsageDay[];
  period: UsagePeriod;
  anchorDate: string;
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
const CHART_GRID_LINE_COUNT = 5;
const CHART_GRID_TOP = 42;
const CHART_GRID_GAP = 34;
const DATE_LABEL_START_INDEX = 5;
const MAX_X_AXIS_LABEL_COUNT = 8;
const CHART_GRID_LINES = Array.from({ length: CHART_GRID_LINE_COUNT }, (_, index) => index);
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
  day: UsageDay;
  cost: number;
  pricingIncomplete: boolean;
  assumedPricing: boolean;
  placement: TooltipPlacement;
}

export const buildOverviewMotionKey = (summary: UsageSummary, period: UsagePeriod): string =>
  `${period}:${summary.sessions.length}:${summary.totals.totalTokens}:${summary.byDay.at(-1)?.date ?? 'empty'}`;

export const buildTrendPoints = (
  days: UsageDay[],
  max: number,
  dailyCosts: Map<string, CostEstimate>
): TrendPoint[] => {
  return days.map((day, index) => {
    const x =
      days.length <= 1
        ? CHART_LEFT
        : CHART_LEFT + (index / (days.length - 1)) * (CHART_RIGHT - CHART_LEFT);
    const y = CHART_BASELINE - (day.totalTokens / max) * CHART_VERTICAL_RANGE;
    const costEstimate = dailyCosts.get(day.date);

    return {
      x,
      y,
      day,
      cost: costEstimate?.pricedCostUsd ?? 0,
      pricingIncomplete: (costEstimate?.unpricedTokens ?? 0) > 0,
      assumedPricing: (costEstimate?.assumedTokens ?? 0) > 0,
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

const getTooltipStyle = (point: TrendPoint): React.CSSProperties => {
  return {
    '--tooltip-x': `${(point.x / CHART_VIEWBOX_WIDTH) * PERCENT_SCALE}%`,
    '--tooltip-y': `${(point.y / CHART_VIEWBOX_HEIGHT) * PERCENT_SCALE}%`,
  } as React.CSSProperties;
};

const TrendChart: React.FC<TrendChartProps> = ({ days, max, dailyCosts }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const points = buildTrendPoints(days, max, dailyCosts);
  const activePoint = points.find(({ day }) => day.date === activeDate);
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');
  const area = points.length
    ? `${path} L${CHART_RIGHT},${CHART_BASELINE} L${CHART_LEFT},${CHART_BASELINE} Z`
    : '';

  return (
    <div className="trend-chart">
      <div className="trend-chart-plot">
        <svg viewBox={CHART_VIEWBOX} role="img" aria-label={t('overview.tokenTrendChart')}>
          {CHART_GRID_LINES.map((line) => (
            <line
              key={line}
              x1={CHART_LEFT}
              x2={CHART_RIGHT}
              y1={CHART_GRID_TOP + line * CHART_GRID_GAP}
              y2={CHART_GRID_TOP + line * CHART_GRID_GAP}
            />
          ))}
          {area ? <path className="trend-area" d={area} /> : null}
          {path ? <path className="trend-line" d={path} pathLength={1} /> : null}
          {activePoint ? (
            <line
              className="trend-guide"
              x1={activePoint.x}
              x2={activePoint.x}
              y1={activePoint.y}
              y2={CHART_BASELINE}
            />
          ) : null}
          {points.map((point) => {
            const active = point.day.date === activeDate;
            const pricingState = point.pricingIncomplete
              ? t('overview.pricingState')
              : point.assumedPricing
                ? t('overview.assumedPricingState')
                : '';
            const ariaLabel = t('overview.trendPoint', {
              date: point.day.date,
              tokens: formatNumber(point.day.totalTokens, locale),
              cost: formatUsd(point.cost, locale),
              pricingState,
            });

            return (
              <g key={point.day.date}>
                <circle
                  className={active ? 'trend-point active' : 'trend-point'}
                  cx={point.x}
                  cy={point.y}
                  r={active ? ACTIVE_POINT_RADIUS : INACTIVE_POINT_RADIUS}
                />
                <circle
                  className="trend-hit-target"
                  cx={point.x}
                  cy={point.y}
                  r={TREND_HIT_RADIUS}
                  tabIndex={0}
                  role="img"
                  aria-label={ariaLabel}
                  onMouseEnter={() => setActiveDate(point.day.date)}
                  onMouseLeave={() => setActiveDate(null)}
                  onFocus={() => setActiveDate(point.day.date)}
                  onBlur={() => setActiveDate(null)}
                />
              </g>
            );
          })}
        </svg>
        {activePoint ? (
          <div
            className={`trend-tooltip ${activePoint.placement}`}
            style={getTooltipStyle(activePoint)}
            aria-hidden="true"
          >
            <strong>{activePoint.day.date}</strong>
            <div className="trend-tooltip-cost">
              <span>{t('overview.estimatedCost')}</span>
              <b>{formatUsd(activePoint.cost, locale)}</b>
            </div>
            {activePoint.pricingIncomplete ? (
              <span className="pricing-incomplete-label">{t('overview.pricingIncomplete')}</span>
            ) : activePoint.assumedPricing ? (
              <span className="pricing-assumed-label">{t('overview.assumedPricing')}</span>
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
      <div className="x-axis">
        {days
          .filter(
            (_, index) => index % Math.max(1, Math.ceil(days.length / MAX_X_AXIS_LABEL_COUNT)) === 0
          )
          .map((day) => (
            <span key={day.date}>{day.date.slice(DATE_LABEL_START_INDEX)}</span>
          ))}
      </div>
    </div>
  );
};

const ActivityGrid: React.FC<ActivityGridProps> = ({ days, period, anchorDate }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const cells = buildActivityCells(days, period, anchorDate);

  return (
    <div className="activity-wrap">
      <div className="activity-labels">
        <span>{t('overview.weekday.monday')}</span>
        <span>{t('overview.weekday.wednesday')}</span>
        <span>{t('overview.weekday.friday')}</span>
      </div>
      <div className="activity-grid">
        {cells.map((cell) =>
          cell.inPeriod ? (
            <span
              key={cell.date}
              className={`activity-cell level-${cell.level}`}
              role="img"
              tabIndex={0}
              aria-label={t('overview.activityDay', {
                date: cell.date,
                tokens: formatNumber(cell.tokens, locale),
              })}
            />
          ) : (
            <span key={cell.date} className="activity-cell outside-period" aria-hidden="true" />
          )
        )}
      </div>
    </div>
  );
};

const Overview: React.FC<OverviewProps> = ({
  summary,
  pricing,
  unknownModelPricing,
  period,
  scannedAt,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const { t: tCommon } = useTranslation('common');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const days = summary.byDay.slice(-TREND_HISTORY_DAYS);
  const maxDay = Math.max(1, ...days.map((day) => day.totalTokens));
  const totalCost = getSummaryCostEstimate(summary, pricing, unknownModelPricing);
  const pricingIncomplete = totalCost.unpricedTokens > 0;
  const assumedPricing = totalCost.assumedTokens > 0;
  const showAssumedPricing = !pricingIncomplete && assumedPricing;
  const dailyCosts = new Map<string, CostEstimate>(
    buildDailyCostEstimates(summary.sessions, pricing, unknownModelPricing).map(
      ({
        date,
        pricedCostUsd,
        assumedCostUsd,
        assumedTokens,
        unpricedTokens,
        unpricedModelIds,
      }) => [
        date,
        { pricedCostUsd, assumedCostUsd, assumedTokens, unpricedTokens, unpricedModelIds },
      ]
    )
  );
  const cachePercentage = getCachePercentage(
    summary.totals.inputTokens,
    summary.totals.cachedInputTokens
  );
  const motionKey = buildOverviewMotionKey(summary, period);
  const anchorDate = scannedAt.slice(0, ISO_DATE_LENGTH);

  return (
    <section className="page-stack">
      <PageHeader title={tCommon('navigation.overview')} description={t('overview.description')} />
      <div key={motionKey} className="overview-grid" data-motion="overview-story">
        <div className="metric-grid">
          <MetricCard
            label={t('overview.totalCost')}
            value={formatUsd(totalCost.pricedCostUsd, locale)}
            detail={
              pricingIncomplete
                ? `${t('overview.pricingIncomplete')} · ${t('overview.unpricedTokens', {
                    tokens: formatCompactNumber(totalCost.unpricedTokens, locale),
                  })}`
                : assumedPricing
                  ? `${t('overview.assumedPricing')} · ${t('overview.assumedTokens', {
                      tokens: formatCompactNumber(totalCost.assumedTokens, locale),
                    })}`
                  : t('overview.tokensPriced', {
                      tokens: formatCompactNumber(summary.totals.totalTokens, locale),
                    })
            }
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
              <p>
                {t('overview.total')}: {formatUsd(totalCost.pricedCostUsd, locale)}
                {pricingIncomplete ? ` · ${t('overview.pricingIncomplete')}` : ''}
                {showAssumedPricing ? ` · ${t('overview.assumedPricing')}` : ''}
              </p>
            </div>
          </div>
          <TrendChart days={days} max={maxDay} dailyCosts={dailyCosts} />
          <div className="chart-legend">
            <span>
              <i aria-hidden="true" /> {t('overview.totalTokens')}
            </span>
          </div>
        </article>

        <article className="panel activity-panel">
          <div className="panel-heading compact">
            <div>
              <h3>{t('overview.activity')}</h3>
              <p>{t('overview.sessionsScanned', { count: summary.sessions.length })}</p>
            </div>
          </div>
          <ActivityGrid days={summary.byDay} period={period} anchorDate={anchorDate} />
        </article>
      </div>
    </section>
  );
};

export default Overview;
