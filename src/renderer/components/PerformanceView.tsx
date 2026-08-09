/**
 * @file 性能分析视图
 * @description
 * 展示近期用量趋势、缓存效率、会话峰值和成本等性能指标。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelPricingEntry, UnknownModelPricing } from '../../shared/budgetTypes';
import type { UsageSummary } from '../../shared/usageTypes';
import { buildCacheEfficiency } from '../utils/cacheEfficiency';
import { buildCostEfficiency } from '../utils/costEfficiency';
import { buildErrorRateDetail } from '../utils/errorRateDetail';
import { buildHourlyActivity } from '../utils/hourlyActivity';
import CacheEfficiencyCard from './CacheEfficiencyCard';
import CostEfficiencyCard from './CostEfficiencyCard';
import ErrorRateCard from './ErrorRateCard';
import HourlyActivityChart from './HourlyActivityChart';
import PageHeader from './PageHeader';

interface PerformanceViewProps {
  summary: UsageSummary;
  pricing: ModelPricingEntry[];
  unknownModelPricing?: UnknownModelPricing;
}

const PerformanceView: React.FC<PerformanceViewProps> = ({
  summary,
  pricing,
  unknownModelPricing,
}) => {
  const { t } = useTranslation('analytics');
  const cacheEfficiency = buildCacheEfficiency(summary);
  const costEfficiency = buildCostEfficiency(summary, pricing, unknownModelPricing);
  const hourlyActivity = buildHourlyActivity(summary.sessions);
  const errorRateDetail = buildErrorRateDetail(summary);

  return (
    <section className="page-stack">
      <PageHeader title={t('performance.title')} description={t('performance.description')} />
      <div className="performance-grid performance-card-grid">
        <CacheEfficiencyCard efficiency={cacheEfficiency} />
        <CostEfficiencyCard efficiency={costEfficiency} />

        <article className="panel perf-card">
          <h3>{t('performance.peakHours')}</h3>
          <HourlyActivityChart activity={hourlyActivity} />
        </article>

        <ErrorRateCard detail={errorRateDetail} />
      </div>
    </section>
  );
};

export default PerformanceView;
