import React from "react";
import type { UsageSummary } from "../../shared/usageTypes";
import TokenBar from "./TokenBar";

interface PerformanceViewProps {
  summary: UsageSummary;
}

export default function PerformanceView({ summary }: PerformanceViewProps) {
  const days = summary.byDay.slice(-30);
  const maxDay = Math.max(1, ...days.map((day) => day.totalTokens));
  const maxSession = Math.max(1, ...summary.sessions.slice(0, 12).map((session) => session.totalTokens));
  const cacheRate = summary.totals.inputTokens
    ? Math.round((summary.totals.cachedInputTokens / summary.totals.inputTokens) * 100)
    : 0;

  return (
    <section className="performance-grid">
      <article className="panel perf-card">
        <h3>Cache Hit Rate</h3>
        <p>{cacheRate}%</p>
        <MiniLine days={days} max={maxDay} tone="cyan" />
      </article>

      <article className="panel perf-card">
        <h3>Cost Efficiency</h3>
        <p>${(summary.totals.totalTokens / 1_000_000 * 1.35).toFixed(2)}</p>
        <MiniLine days={days} max={maxDay} tone="blue" />
      </article>

      <article className="panel perf-card">
        <h3>Peak Hours</h3>
        <p>Most active at {peakHour(summary)}</p>
        <div className="peak-bars">
          {summary.sessions.slice(0, 12).reverse().map((session, index) => (
            <TokenBar
              key={session.sourceFile}
              value={session.totalTokens}
              max={maxSession}
              tone={index % 4 === 0 ? "purple" : "blue"}
            />
          ))}
        </div>
      </article>

      <article className="panel perf-card">
        <h3>Error Rate</h3>
        <p>{errorRate(summary)}% ({warningTotal(summary)}/{summary.sessions.length || 1})</p>
        <Donut value={100 - Number(errorRate(summary))} />
      </article>
    </section>
  );
}

function MiniLine({ days, max, tone }: { days: Array<{ date: string; totalTokens: number }>; max: number; tone: "cyan" | "blue" }) {
  const points = days.map((day, index) => {
    const x = days.length <= 1 ? 12 : 12 + (index / (days.length - 1)) * 250;
    const y = 118 - (day.totalTokens / max) * 92;
    return { x, y, date: day.date };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");

  return (
    <svg className={`mini-line ${tone}`} viewBox="0 0 274 138" aria-hidden="true">
      {[0, 1, 2, 3].map((line) => (
        <line key={line} x1="12" x2="262" y1={26 + line * 28} y2={26 + line * 28} />
      ))}
      <path d={path} />
    </svg>
  );
}

function Donut({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 48;
  const dash = (value / 100) * circumference;

  return (
    <svg className="donut" viewBox="0 0 120 120" aria-hidden="true">
      <circle className="donut-track" cx="60" cy="60" r="48" />
      <circle
        className="donut-value"
        cx="60"
        cy="60"
        r="48"
        strokeDasharray={`${dash} ${circumference - dash}`}
      />
    </svg>
  );
}

function peakHour(summary: UsageSummary): string {
  const hours = new Map<number, number>();

  for (const session of summary.sessions) {
    const hour = new Date(session.startedAt).getHours();
    hours.set(hour, (hours.get(hour) ?? 0) + session.totalTokens);
  }

  const [hour = 0] = [...hours.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  return `${String(hour).padStart(2, "0")}:00`;
}

function warningTotal(summary: UsageSummary): number {
  return summary.sessions.reduce((total, session) => total + session.warnings.length, 0);
}

function errorRate(summary: UsageSummary): string {
  if (summary.sessions.length === 0) {
    return "0.00";
  }

  return ((warningTotal(summary) / summary.sessions.length) * 100).toFixed(2);
}
