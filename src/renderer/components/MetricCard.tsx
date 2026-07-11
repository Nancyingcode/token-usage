import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "green" | "amber" | "blue";
}

export default function MetricCard({ label, value, icon: Icon, tone = "default" }: MetricCardProps) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <div className="metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{formatNumber(value)}</strong>
      </div>
    </article>
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}
