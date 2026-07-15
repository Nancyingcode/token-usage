import React from "react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "mint" | "blue" | "purple" | "orange";
}

export default function MetricCard({ label, value, detail, icon: Icon, tone }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
      <div className="metric-icon">
        <Icon size={14} />
      </div>
    </article>
  );
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}
