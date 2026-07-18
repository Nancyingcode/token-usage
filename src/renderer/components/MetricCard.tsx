import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone: 'mint' | 'blue' | 'purple' | 'orange';
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, icon: Icon, tone }) => (
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

export default MetricCard;
