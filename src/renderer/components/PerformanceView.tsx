/**
 * @file 性能分析视图
 * @description
 * 展示近期用量趋势、缓存效率、会话峰值和成本等性能指标。
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelPricingEntry, UnknownModelPricing } from '../../shared/budgetTypes';
import type { UsageSummary } from '../../shared/usageTypes';
import { resolveRendererLocale } from '../i18n';
import { buildCacheEfficiency } from '../utils/cacheEfficiency';
import { buildCostEfficiency } from '../utils/costEfficiency';
import { formatPercent } from '../utils/formatters';
import { buildHourlyActivity } from '../utils/hourlyActivity';
import CacheEfficiencyCard from './CacheEfficiencyCard';
import CostEfficiencyCard from './CostEfficiencyCard';
import HourlyActivityChart from './HourlyActivityChart';
import PageHeader from './PageHeader';

interface PerformanceViewProps {
  summary: UsageSummary;
  pricing: ModelPricingEntry[];
  unknownModelPricing?: UnknownModelPricing;
}

interface DonutProps {
  value: number;
}

const DONUT_VIEWBOX_SIZE = 120;
const DONUT_VIEWBOX = `0 0 ${DONUT_VIEWBOX_SIZE} ${DONUT_VIEWBOX_SIZE}`;
const DONUT_CENTER = DONUT_VIEWBOX_SIZE / 2;
const DONUT_RADIUS = 48;
const PERCENT_SCALE = 100;
const APPLICATION_ERROR_COUNT = 0;
const APPLICATION_ERROR_RATE = 0;
const ERROR_RATE_FRACTION_DIGITS = 2;

const Donut: React.FC<DonutProps> = ({ value }) => {
  const circumference = 2 * Math.PI * DONUT_RADIUS;
  const dash = (value / PERCENT_SCALE) * circumference;

  return (
    <svg className="donut" viewBox={DONUT_VIEWBOX} aria-hidden="true">
      <circle className="donut-track" cx={DONUT_CENTER} cy={DONUT_CENTER} r={DONUT_RADIUS} />
      <circle
        className="donut-value"
        cx={DONUT_CENTER}
        cy={DONUT_CENTER}
        r={DONUT_RADIUS}
        strokeDasharray={`${dash} ${circumference - dash}`}
      />
    </svg>
  );
};

const PerformanceView: React.FC<PerformanceViewProps> = ({
  summary,
  pricing,
  unknownModelPricing,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const cacheEfficiency = buildCacheEfficiency(summary);
  const costEfficiency = buildCostEfficiency(summary, pricing, unknownModelPricing);
  const hourlyActivity = buildHourlyActivity(summary.sessions);

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

        <article className="panel perf-card">
          <h3>{t('performance.errorRate')}</h3>
          <p>
            {formatPercent(APPLICATION_ERROR_RATE, locale, ERROR_RATE_FRACTION_DIGITS)} (
            {APPLICATION_ERROR_COUNT}/{summary.sessions.length})
          </p>
          <Donut value={PERCENT_SCALE - APPLICATION_ERROR_RATE} />
        </article>
      </div>
    </section>
  );
};

export default PerformanceView;
