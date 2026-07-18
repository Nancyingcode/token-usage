import React, { useState } from 'react';
import { Coins, FileCode2, LockKeyhole, MessageSquareText } from 'lucide-react';
import { estimateTokenCost, getCachePercentage } from '../../shared/usageMetrics';
import type { UsageDay, UsageSummary } from '../../shared/usageTypes';
import { formatCompactNumber, formatNumber } from '../utils/formatters';
import MetricCard from './MetricCard';

interface OverviewProps {
  summary: UsageSummary;
}

interface TrendChartProps {
  days: UsageDay[];
  max: number;
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
const CHART_LEFT = 24;
const CHART_RIGHT = 560;
const CHART_BASELINE = 178;
const CHART_VERTICAL_RANGE = 136;
const TOOLTIP_LEFT_BOUNDARY = 160;
const TOOLTIP_RIGHT_BOUNDARY = 424;
const TREND_HIT_RADIUS = 12;
const ACTIVE_POINT_RADIUS = 4.8;
const INACTIVE_POINT_RADIUS = 2.4;

export type TooltipPlacement = 'left' | 'center' | 'right';

export interface TrendPoint {
  x: number;
  y: number;
  day: UsageDay;
  cost: number;
  placement: TooltipPlacement;
}

export function buildTrendPoints(days: UsageDay[], max: number): TrendPoint[] {
  return days.map((day, index) => {
    const x =
      days.length <= 1
        ? CHART_LEFT
        : CHART_LEFT + (index / (days.length - 1)) * (CHART_RIGHT - CHART_LEFT);
    const y = CHART_BASELINE - (day.totalTokens / max) * CHART_VERTICAL_RANGE;

    return {
      x,
      y,
      day,
      cost: estimateTokenCost(day.totalTokens),
      placement: getTooltipPlacement(x),
    };
  });
}

function getTooltipPlacement(x: number): TooltipPlacement {
  if (x < TOOLTIP_LEFT_BOUNDARY) {
    return 'left';
  }

  if (x > TOOLTIP_RIGHT_BOUNDARY) {
    return 'right';
  }

  return 'center';
}

function getTooltipStyle(point: TrendPoint): React.CSSProperties {
  return {
    '--tooltip-x': `${(point.x / CHART_VIEWBOX_WIDTH) * 100}%`,
    '--tooltip-y': `${(point.y / CHART_VIEWBOX_HEIGHT) * 100}%`,
  } as React.CSSProperties;
}

const TrendChart: React.FC<TrendChartProps> = ({ days, max }) => {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const points = buildTrendPoints(days, max);
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
        <svg viewBox="0 0 584 212" role="img" aria-label="Token trend chart">
          {[0, 1, 2, 3, 4].map((line) => (
            <line key={line} x1="24" x2="560" y1={42 + line * 34} y2={42 + line * 34} />
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
            const ariaLabel = `${point.day.date}, ${formatNumber(point.day.totalTokens)} total tokens, estimated cost $${point.cost.toFixed(2)}`;

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
              <b>${activePoint.cost.toFixed(2)}</b>
            </div>
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
          .filter((_, index) => index % Math.max(1, Math.ceil(days.length / 8)) === 0)
          .map((day) => (
            <span key={day.date}>{day.date.slice(5)}</span>
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

const Overview: React.FC<OverviewProps> = ({ summary }) => {
  const days = summary.byDay.slice(-TREND_HISTORY_DAYS);
  const maxDay = Math.max(1, ...days.map((day) => day.totalTokens));
  const totalCost = estimateTokenCost(summary.totals.totalTokens);
  const cachePercentage = getCachePercentage(
    summary.totals.inputTokens,
    summary.totals.cachedInputTokens
  );

  return (
    <section className="overview-grid">
      <div className="metric-grid">
        <MetricCard
          label="Total Cost"
          value={`$${totalCost.toFixed(1)}`}
          detail={`~${formatCompactNumber(summary.totals.totalTokens)} tokens processed`}
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
            <p>Total: ${totalCost.toFixed(1)}</p>
          </div>
        </div>
        <TrendChart days={days} max={maxDay} />
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
