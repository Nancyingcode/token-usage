import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ICON_SIZE_SMALL } from '../constants/ui';

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
      <Icon size={ICON_SIZE_SMALL} />
    </div>
  </article>
);

export default MetricCard;
