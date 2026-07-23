/**
 * @file 用量概览视图
 * @description
 * 展示令牌与成本摘要、每日趋势和活动分布，并计算图表所需的展示模型。
 */
import React, { useState } from 'react';
import { Coins, FileCode2, LockKeyhole, MessageSquareText } from 'lucide-react';
import type { CostEstimate, ModelPricingEntry } from '../../shared/budgetTypes';
import { buildDailyCostEstimates, getSummaryCostEstimate } from '../../shared/pricing';
import { getCachePercentage } from '../../shared/usageMetrics';
import type { UsageDay, UsageSummary } from '../../shared/usageTypes';
import { formatCompactNumber, formatNumber, formatUsd } from '../utils/formatters';
import MetricCard from './MetricCard';

interface OverviewProps {
  summary: UsageSummary;
  pricing: ModelPricingEntry[];
}

interface TrendChartProps {
  days: UsageDay[];
  max: number;
  dailyCosts: Map<string, CostEstimate>;
}

interface ActivityGridProps {
  days: UsageDay[];
}

const CHART_COLORS = ['#3b82f6', '#a855f7', '#22c7d9'];
const TREND_HISTORY_DAYS = 24;
const ACTIVITY_HISTORY_DAYS = 84;
const ACTIVITY_CELL_COUNT = 84;
const ACTIVITY_LEVEL_COUNT = 4;
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
  placement: TooltipPlacement;
}

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
        <svg viewBox={CHART_VIEWBOX} role="img" aria-label="Token trend chart">
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
          {path ? <path className="trend-line cyan" d={path} /> : null}
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
            const pricingState = point.pricingIncomplete ? ', pricing incomplete' : '';
            const ariaLabel = `${point.day.date}, ${formatNumber(point.day.totalTokens)} total tokens, estimated cost ${formatUsd(point.cost)}${pricingState}`;

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
              <span>Estimated cost</span>
              <b>{formatUsd(activePoint.cost)}</b>
            </div>
            {activePoint.pricingIncomplete ? (
              <span className="pricing-incomplete-label">Pricing incomplete</span>
            ) : null}
            <dl>
              <div>
                <dt>Total</dt>
                <dd>{formatNumber(activePoint.day.totalTokens)}</dd>
              </div>
              <div className="input">
                <dt>Input</dt>
                <dd>{formatNumber(activePoint.day.inputTokens)}</dd>
              </div>
              <div className="output">
                <dt>Output</dt>
                <dd>{formatNumber(activePoint.day.outputTokens)}</dd>
              </div>
              <div className="cached">
                <dt>Cached</dt>
                <dd>{formatNumber(activePoint.day.cachedInputTokens)}</dd>
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

const ActivityGrid: React.FC<ActivityGridProps> = ({ days }) => {
  const map = new Map(days.map((day) => [day.date, day.totalTokens]));
  const max = Math.max(1, ...days.map((day) => day.totalTokens));
  const cells = Array.from({ length: ACTIVITY_CELL_COUNT }, (_, index) => {
    const day = days[index];
    const value = day ? (map.get(day.date) ?? 0) : 0;
    const level = value === 0 ? 0 : Math.ceil((value / max) * ACTIVITY_LEVEL_COUNT);
    return { key: day?.date ?? `empty-${index}`, level };
  });

  return (
    <div className="activity-wrap">
      <div className="activity-labels">
        <span>Mon</span>
        <span>Wed</span>
        <span>Fri</span>
      </div>
      <div className="activity-grid">
        {cells.map((cell) => (
          <i key={cell.key} className={`activity-cell level-${cell.level}`} />
        ))}
      </div>
    </div>
  );
};

const Overview: React.FC<OverviewProps> = ({ summary, pricing }) => {
  const days = summary.byDay.slice(-TREND_HISTORY_DAYS);
  const maxDay = Math.max(1, ...days.map((day) => day.totalTokens));
  const totalCost = getSummaryCostEstimate(summary, pricing);
  const pricingIncomplete = totalCost.unpricedTokens > 0;
  const dailyCosts = new Map<string, CostEstimate>(
    buildDailyCostEstimates(summary.sessions, pricing).map(
      ({ date, pricedCostUsd, unpricedTokens, unpricedModelIds }) => [
        date,
        { pricedCostUsd, unpricedTokens, unpricedModelIds },
      ]
    )
  );
  const cachePercentage = getCachePercentage(
    summary.totals.inputTokens,
    summary.totals.cachedInputTokens
  );

  return (
    <section className="overview-grid">
      <div className="metric-grid">
        <MetricCard
          label="Total Cost"
          value={formatUsd(totalCost.pricedCostUsd)}
          detail={
            pricingIncomplete
              ? `Pricing incomplete · ${formatCompactNumber(totalCost.unpricedTokens)} unpriced tokens`
              : `${formatCompactNumber(summary.totals.totalTokens)} tokens priced`
          }
          icon={Coins}
          tone="mint"
        />
        <MetricCard
          label="Tokens"
          value={formatCompactNumber(summary.totals.totalTokens)}
          detail={`${cachePercentage}% from cache`}
          icon={LockKeyhole}
          tone="blue"
        />
        <MetricCard
          label="Lines Changed"
          value={formatCompactNumber(summary.totals.outputTokens)}
          detail={`+${formatCompactNumber(summary.totals.reasoningOutputTokens)} reasoning`}
          icon={FileCode2}
          tone="purple"
        />
        <MetricCard
          label="Sessions"
          value={formatNumber(summary.sessions.length)}
          detail={`${formatNumber(summary.byProject.length)} projects`}
          icon={MessageSquareText}
          tone="orange"
        />
      </div>

      <article className="panel chart-panel">
        <div className="panel-heading compact">
          <div>
            <h3>Cost Trends</h3>
            <p>
              Total: {formatUsd(totalCost.pricedCostUsd)}
              {pricingIncomplete ? ' · Pricing incomplete' : ''}
            </p>
          </div>
        </div>
        <TrendChart days={days} max={maxDay} dailyCosts={dailyCosts} />
        <div className="chart-legend">
          <span>
            <i style={{ background: CHART_COLORS[0] }} /> Input
          </span>
          <span>
            <i style={{ background: CHART_COLORS[1] }} /> Output
          </span>
          <span>
            <i style={{ background: CHART_COLORS[2] }} /> Cached
          </span>
        </div>
      </article>

      <article className="panel activity-panel">
        <div className="panel-heading compact">
          <div>
            <h3>Activity</h3>
            <p>{summary.sessions.length} sessions scanned locally</p>
          </div>
        </div>
        <ActivityGrid days={summary.byDay.slice(-ACTIVITY_HISTORY_DAYS)} />
      </article>
    </section>
  );
};

export default Overview;
