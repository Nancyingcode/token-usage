import React from "react";
import { Coins, FileCode2, LockKeyhole, MessageSquareText } from "lucide-react";
import { estimateTokenCost, getCachePercentage } from "../../shared/usageMetrics";
import type { UsageDay, UsageSummary } from "../../shared/usageTypes";
import MetricCard, { formatCompact, formatNumber } from "./MetricCard";

interface OverviewProps {
  summary: UsageSummary;
}

const chartColors = ["#3b82f6", "#a855f7", "#22c7d9"];

export default function Overview({ summary }: OverviewProps) {
  const days = summary.byDay.slice(-24);
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
          detail={`~${formatCompact(summary.totals.totalTokens)} tokens processed`}
          icon={Coins}
          tone="mint"
        />
        <MetricCard
          label="Tokens"
          value={formatCompact(summary.totals.totalTokens)}
          detail={`${cachePercentage}% from cache`}
          icon={LockKeyhole}
          tone="blue"
        />
        <MetricCard
          label="Lines Changed"
          value={formatCompact(summary.totals.outputTokens)}
          detail={`+${formatCompact(summary.totals.reasoningOutputTokens)} reasoning`}
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
            <i style={{ background: chartColors[0] }} /> Input
          </span>
          <span>
            <i style={{ background: chartColors[1] }} /> Output
          </span>
          <span>
            <i style={{ background: chartColors[2] }} /> Cached
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
        <ActivityGrid days={summary.byDay.slice(-84)} />
      </article>
    </section>
  );
}

function TrendChart({ days, max }: { days: UsageDay[]; max: number }) {
  const points = days.map((day, index) => {
    const x = days.length <= 1 ? 24 : 24 + (index / (days.length - 1)) * 536;
    const y = 178 - (day.totalTokens / max) * 136;
    return { x, y, day };
  });
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const area = points.length ? `${path} L560,178 L24,178 Z` : "";

  return (
    <div className="trend-chart">
      <svg viewBox="0 0 584 212" role="img" aria-label="Token trend chart">
        {[0, 1, 2, 3, 4].map((line) => (
          <line key={line} x1="24" x2="560" y1={42 + line * 34} y2={42 + line * 34} />
        ))}
        {area ? <path className="trend-area" d={area} /> : null}
        {path ? <path className="trend-line cyan" d={path} /> : null}
        {points.map((point, index) => (
          <circle key={`${point.day.date}-${index}`} cx={point.x} cy={point.y} r="2.4" />
        ))}
      </svg>
      <div className="x-axis">
        {days
          .filter((_, index) => index % Math.max(1, Math.ceil(days.length / 8)) === 0)
          .map((day) => (
            <span key={day.date}>{day.date.slice(5)}</span>
          ))}
      </div>
    </div>
  );
}

function ActivityGrid({ days }: { days: UsageDay[] }) {
  const map = new Map(days.map((day) => [day.date, day.totalTokens]));
  const max = Math.max(1, ...days.map((day) => day.totalTokens));
  const cells = Array.from({ length: 84 }, (_, index) => {
    const day = days[index];
    const value = day ? (map.get(day.date) ?? 0) : 0;
    const level = value === 0 ? 0 : Math.ceil((value / max) * 4);
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
}
