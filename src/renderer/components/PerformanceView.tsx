import React from 'react';
import { estimateTokenCost, getCachePercentage } from '../../shared/usageMetrics';
import type { UsageSummary } from '../../shared/usageTypes';
import TokenBar from './TokenBar';

interface PerformanceViewProps {
  summary: UsageSummary;
}

interface MiniLineProps {
  days: Array<{ date: string; totalTokens: number }>;
  max: number;
  tone: 'cyan' | 'blue';
}

interface DonutProps {
  value: number;
}

const PERFORMANCE_HISTORY_DAYS = 30;
const PEAK_SESSION_COUNT = 12;
const HIGHLIGHT_BAR_INTERVAL = 4;
const MINI_LINE_VIEWBOX_WIDTH = 274;
const MINI_LINE_VIEWBOX_HEIGHT = 138;
const MINI_LINE_VIEWBOX = `0 0 ${MINI_LINE_VIEWBOX_WIDTH} ${MINI_LINE_VIEWBOX_HEIGHT}`;
const MINI_LINE_LEFT = 12;
const MINI_LINE_RIGHT = 262;
const MINI_LINE_BASELINE = 118;
const MINI_LINE_VERTICAL_RANGE = 92;
const MINI_LINE_GRID_TOP = 26;
const MINI_LINE_GRID_GAP = 28;
const MINI_LINE_GRID_COUNT = 4;
const MINI_LINE_GRID_LINES = Array.from({ length: MINI_LINE_GRID_COUNT }, (_, index) => index);
const DONUT_VIEWBOX_SIZE = 120;
const DONUT_VIEWBOX = `0 0 ${DONUT_VIEWBOX_SIZE} ${DONUT_VIEWBOX_SIZE}`;
const DONUT_CENTER = DONUT_VIEWBOX_SIZE / 2;
const DONUT_RADIUS = 48;
const PERCENT_SCALE = 100;
const APPLICATION_ERROR_COUNT = 0;
const APPLICATION_ERROR_RATE = 0;

const MiniLine: React.FC<MiniLineProps> = ({ days, max, tone }) => {
  const points = days.map((day, index) => {
    const x =
      days.length <= 1
        ? MINI_LINE_LEFT
        : MINI_LINE_LEFT + (index / (days.length - 1)) * (MINI_LINE_RIGHT - MINI_LINE_LEFT);
    const y = MINI_LINE_BASELINE - (day.totalTokens / max) * MINI_LINE_VERTICAL_RANGE;
    return { x, y, date: day.date };
  });
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');

  return (
    <svg className={`mini-line ${tone}`} viewBox={MINI_LINE_VIEWBOX} aria-hidden="true">
      {MINI_LINE_GRID_LINES.map((line) => (
        <line
          key={line}
          x1={MINI_LINE_LEFT}
          x2={MINI_LINE_RIGHT}
          y1={MINI_LINE_GRID_TOP + line * MINI_LINE_GRID_GAP}
          y2={MINI_LINE_GRID_TOP + line * MINI_LINE_GRID_GAP}
        />
      ))}
      <path d={path} />
    </svg>
  );
};

const Donut: React.FC<DonutProps> = ({ value }) => {
  const circumference = 2 * Math.PI * DONUT_RADIUS;
  const dash = (value / PERCENT_SCALE) * circumference;

  return (
    <svg className="donut" viewBox={DONUT_VIEWBOX} aria-hidden="true">
      <circle className="donut-track" cx={DONUT_CENTER} cy={DONUT_CENTER} r={DONUT_RADIUS} />
      <circle
        className="donut-value"
        cx={DONUT_CENTER}
        cy={DONUT_CENTER}
        r={DONUT_RADIUS}
        strokeDasharray={`${dash} ${circumference - dash}`}
      />
    </svg>
  );
};

const PerformanceView: React.FC<PerformanceViewProps> = ({ summary }) => {
  const days = summary.byDay.slice(-PERFORMANCE_HISTORY_DAYS);
  const maxDay = Math.max(1, ...days.map((day) => day.totalTokens));
  const maxSession = Math.max(
    1,
    ...summary.sessions.slice(0, PEAK_SESSION_COUNT).map((session) => session.totalTokens)
  );
  const cacheRate = getCachePercentage(
    summary.totals.inputTokens,
    summary.totals.cachedInputTokens
  );
  const totalCost = estimateTokenCost(summary.totals.totalTokens);

  return (
    <section className="performance-grid">
      <article className="panel perf-card">
        <h3>Cache Hit Rate</h3>
        <p>{cacheRate}%</p>
        <MiniLine days={days} max={maxDay} tone="cyan" />
      </article>

      <article className="panel perf-card">
        <h3>Cost Efficiency</h3>
        <p>${totalCost.toFixed(2)}</p>
        <MiniLine days={days} max={maxDay} tone="blue" />
      </article>

      <article className="panel perf-card">
        <h3>Peak Hours</h3>
        <p>Most active at {peakHour(summary)}</p>
        <div className="peak-bars">
          {summary.sessions
            .slice(0, PEAK_SESSION_COUNT)
            .reverse()
            .map((session, index) => (
              <TokenBar
                key={session.sourceFile}
                value={session.totalTokens}
                max={maxSession}
                tone={index % HIGHLIGHT_BAR_INTERVAL === 0 ? 'purple' : 'blue'}
              />
            ))}
        </div>
      </article>

      <article className="panel perf-card">
        <h3>Error Rate</h3>
        <p>
          {APPLICATION_ERROR_RATE.toFixed(2)}% ({APPLICATION_ERROR_COUNT}/{summary.sessions.length})
        </p>
        <Donut value={PERCENT_SCALE - APPLICATION_ERROR_RATE} />
      </article>
    </section>
  );
};

const peakHour = (summary: UsageSummary): string => {
  const hours = summary.sessions.reduce<Map<number, number>>((hourTotals, session) => {
    const hour = new Date(session.startedAt).getHours();
    hourTotals.set(hour, (hourTotals.get(hour) ?? 0) + session.totalTokens);
    return hourTotals;
  }, new Map());

  const [hour = 0] = [...hours.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return `${String(hour).padStart(2, '0')}:00`;
};

export default PerformanceView;
