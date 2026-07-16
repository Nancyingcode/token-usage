import React from 'react';
import {
  countSessionWarnings,
  estimateTokenCost,
  getCachePercentage,
  getWarningRate,
} from '../../shared/usageMetrics';
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
const DONUT_RADIUS = 48;
const PERCENT_SCALE = 100;

const MiniLine: React.FC<MiniLineProps> = ({ days, max, tone }) => {
  const points = days.map((day, index) => {
    const x = days.length <= 1 ? 12 : 12 + (index / (days.length - 1)) * 250;
    const y = 118 - (day.totalTokens / max) * 92;
    return { x, y, date: day.date };
  });
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' ');

  return (
    <svg className={`mini-line ${tone}`} viewBox="0 0 274 138" aria-hidden="true">
      {[0, 1, 2, 3].map((line) => (
        <line key={line} x1="12" x2="262" y1={26 + line * 28} y2={26 + line * 28} />
      ))}
      <path d={path} />
    </svg>
  );
};

const Donut: React.FC<DonutProps> = ({ value }) => {
  const circumference = 2 * Math.PI * DONUT_RADIUS;
  const dash = (value / PERCENT_SCALE) * circumference;

  return (
    <svg className="donut" viewBox="0 0 120 120" aria-hidden="true">
      <circle className="donut-track" cx="60" cy="60" r={DONUT_RADIUS} />
      <circle
        className="donut-value"
        cx="60"
        cy="60"
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
  const warningCount = countSessionWarnings(summary.sessions);
  const warningRate = getWarningRate(summary.sessions);

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
          {warningRate.toFixed(2)}% ({warningCount}/{summary.sessions.length || 1})
        </p>
        <Donut value={PERCENT_SCALE - warningRate} />
      </article>
    </section>
  );
};

function peakHour(summary: UsageSummary): string {
  const hours = summary.sessions.reduce<Map<number, number>>((hourTotals, session) => {
    const hour = new Date(session.startedAt).getHours();
    hourTotals.set(hour, (hourTotals.get(hour) ?? 0) + session.totalTokens);
    return hourTotals;
  }, new Map());

  const [hour = 0] = [...hours.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return `${String(hour).padStart(2, '0')}:00`;
}

export default PerformanceView;
