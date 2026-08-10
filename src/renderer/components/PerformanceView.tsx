/**
 * @file 性能分析视图
 * @description
 * 展示近期用量趋势、缓存效率、会话峰值和成本等性能指标。
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelPricingEntry, UnknownModelPricing } from '../../shared/budgetTypes';
import type { UsageSummary } from '../../shared/usageTypes';
import { buildCacheEfficiency } from '../utils/cacheEfficiency';
import { buildCostEfficiency } from '../utils/costEfficiency';
import { buildErrorRateDetail } from '../utils/errorRateDetail';
import { buildHourlyActivity } from '../utils/hourlyActivity';
import AccessibleTabs, { getTabId, getTabPanelId } from './AccessibleTabs';
import CacheEfficiencyCard from './CacheEfficiencyCard';
import CostEfficiencyCard from './CostEfficiencyCard';
import ErrorRateCard from './ErrorRateCard';
import HourlyActivityChart from './HourlyActivityChart';
import PageHeader from './PageHeader';
import PerformanceSummary from './PerformanceSummary';

interface PerformanceViewProps {
  summary: UsageSummary;
  pricing: ModelPricingEntry[];
  unknownModelPricing?: UnknownModelPricing;
}

type PerformanceDetailKey = 'cache' | 'cost' | 'activity' | 'reliability';

const PERFORMANCE_DETAIL_GROUP_ID = 'performance-detail';

const PerformanceView: React.FC<PerformanceViewProps> = ({
  summary,
  pricing,
  unknownModelPricing,
}) => {
  const { t } = useTranslation('analytics');
  const [activeDetail, setActiveDetail] = useState<PerformanceDetailKey>('cache');
  const cacheEfficiency = useMemo(() => buildCacheEfficiency(summary), [summary]);
  const costEfficiency = useMemo(
    () => buildCostEfficiency(summary, pricing, unknownModelPricing),
    [pricing, summary, unknownModelPricing]
  );
  const hourlyActivity = useMemo(() => buildHourlyActivity(summary.sessions), [summary.sessions]);
  const errorRateDetail = useMemo(() => buildErrorRateDetail(summary), [summary]);
  const detailTabs = [
    { value: 'cache' as const, label: t('performance.detailTabs.cache') },
    { value: 'cost' as const, label: t('performance.detailTabs.cost') },
    { value: 'activity' as const, label: t('performance.detailTabs.activity') },
    { value: 'reliability' as const, label: t('performance.detailTabs.reliability') },
  ];

  const renderActiveDetail = (): React.ReactNode => {
    switch (activeDetail) {
      case 'cache':
        return <CacheEfficiencyCard efficiency={cacheEfficiency} />;
      case 'cost':
        return <CostEfficiencyCard efficiency={costEfficiency} />;
      case 'activity':
        return (
          <article className="panel perf-card performance-activity-detail">
            <h3>{t('performance.peakHours')}</h3>
            <HourlyActivityChart activity={hourlyActivity} />
          </article>
        );
      case 'reliability':
        return <ErrorRateCard detail={errorRateDetail} />;
    }
  };

  return (
    <section className="page-stack">
      <PageHeader title={t('performance.title')} description={t('performance.description')} />
      <PerformanceSummary
        cacheEfficiency={cacheEfficiency}
        costEfficiency={costEfficiency}
        hourlyActivity={hourlyActivity}
        errorRateDetail={errorRateDetail}
      />
      <section className="performance-detail" aria-label={t('performance.detailLabel')}>
        <AccessibleTabs
          groupId={PERFORMANCE_DETAIL_GROUP_ID}
          label={t('performance.detailTabsLabel')}
          value={activeDetail}
          tabs={detailTabs}
          onChange={setActiveDetail}
        />
        <div
          id={getTabPanelId(PERFORMANCE_DETAIL_GROUP_ID, activeDetail)}
          className="performance-detail-panel"
          role="tabpanel"
          aria-labelledby={getTabId(PERFORMANCE_DETAIL_GROUP_ID, activeDetail)}
        >
          {renderActiveDetail()}
        </div>
      </section>
    </section>
  );
};

export default PerformanceView;
