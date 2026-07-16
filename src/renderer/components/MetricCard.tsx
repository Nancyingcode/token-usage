import React from "react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: "mint" | "blue" | "purple" | "orange";
}

const COMPACT_NUMBER_THRESHOLD = 1_000;

const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, icon: Icon, tone }) => {
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
};

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= COMPACT_NUMBER_THRESHOLD ? 1 : 0
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export default MetricCard;
