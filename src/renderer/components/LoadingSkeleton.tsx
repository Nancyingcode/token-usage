/**
 * @file Initial loading skeleton
 * @description Preserves the dashboard structure while the first local usage scan is running.
 */

import React from 'react';

const SKELETON_METRIC_COUNT = 4;

interface LoadingSkeletonProps {
  label: string;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ label }) => (
  <section className="loading-skeleton" role="status" aria-busy="true" aria-label={label}>
    <span className="visually-hidden">{label}</span>
    <div className="loading-skeleton-heading" aria-hidden="true" />
    <div className="loading-skeleton-metrics" aria-hidden="true">
      {Array.from({ length: SKELETON_METRIC_COUNT }, (_, index) => (
        <i key={index} />
      ))}
    </div>
    <div className="loading-skeleton-panels" aria-hidden="true">
      <i />
      <i />
    </div>
  </section>
);

export default LoadingSkeleton;
