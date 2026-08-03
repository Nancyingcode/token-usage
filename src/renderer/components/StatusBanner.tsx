/**
 * @file Status banner
 * @description Presents non-blocking information, warnings, and recoverable errors with optional action.
 */

import React from 'react';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';

import { ICON_SIZE_SMALL, ICON_STROKE_WIDTH } from '../constants/ui';

interface StatusBannerProps {
  tone: 'info' | 'warning' | 'danger';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const STATUS_ICONS = {
  info: Info,
  warning: TriangleAlert,
  danger: CircleAlert,
} as const;

const StatusBanner: React.FC<StatusBannerProps> = ({
  tone,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const Icon = STATUS_ICONS[tone];
  const action = actionLabel && onAction ? { label: actionLabel, onClick: onAction } : null;

  return (
    <section className={`status-banner status-banner--${tone}`} role="status">
      <Icon
        className="status-banner-icon"
        size={ICON_SIZE_SMALL}
        strokeWidth={ICON_STROKE_WIDTH}
        aria-hidden="true"
      />
      <div className="status-banner-copy">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? (
        <button className="status-banner-action" type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </section>
  );
};

export default StatusBanner;
