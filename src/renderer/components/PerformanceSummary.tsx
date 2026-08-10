/**
 * @file 性能指标概览
 * @description
 * 使用现有性能视图模型展示常驻 KPI，不改变缓存、费用、活跃时段或错误率口径。
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { resolveRendererLocale } from '../i18n';
import type { CacheEfficiency } from '../utils/cacheEfficiency';
import type { CostEfficiency } from '../utils/costEfficiency';
import type { ErrorRateDetail } from '../utils/errorRateDetail';
import { formatCompactNumber, formatNumber, formatPercent, formatUsd } from '../utils/formatters';
import type { HourlyActivity } from '../utils/hourlyActivity';

interface PerformanceSummaryProps {
  cacheEfficiency: CacheEfficiency;
  costEfficiency: CostEfficiency;
  hourlyActivity: HourlyActivity;
  errorRateDetail: ErrorRateDetail;
}

type SummaryTone = 'danger' | 'warning';

interface PerformanceSummaryCardProps {
  title: string;
  value: string;
  valueTestId: string;
  context: string;
  status?: string;
  tone?: SummaryTone;
}

const EMPTY_METRIC = '—';

const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}:00`;

const formatHourRange = (hour: number): string => `${formatHour(hour)}–${formatHour(hour + 1)}`;

const PerformanceSummaryCard: React.FC<PerformanceSummaryCardProps> = ({
  title,
  value,
  valueTestId,
  context,
  status,
  tone,
}) => (
  <article
    className={`panel performance-summary-card${tone ? ` is-${tone}` : ''}`}
    data-testid="performance-summary-card"
  >
    <h3>{title}</h3>
    <strong className="performance-summary-value" data-testid={valueTestId}>
      {value}
    </strong>
    <p>{context}</p>
    {status ? <span className="performance-summary-status">{status}</span> : null}
  </article>
);

const PerformanceSummary: React.FC<PerformanceSummaryProps> = ({
  cacheEfficiency,
  costEfficiency,
  hourlyActivity,
  errorRateDetail,
}) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const cacheRate =
    cacheEfficiency.percentage === null
      ? EMPTY_METRIC
      : formatPercent(cacheEfficiency.percentage, locale);
  const unitCost =
    costEfficiency.unitCostUsdPerMillion === null
      ? EMPTY_METRIC
      : t('performance.costPerMillionValue', {
          cost: formatUsd(costEfficiency.unitCostUsdPerMillion, locale),
        });
  const coverageRate =
    costEfficiency.coverage.percentage === null
      ? EMPTY_METRIC
      : formatPercent(costEfficiency.coverage.percentage, locale);
  const peakHour = hourlyActivity.peakHour;
  const errorRate =
    errorRateDetail.errorRate === null
      ? EMPTY_METRIC
      : formatPercent(errorRateDetail.errorRate, locale);
  const pricingIncomplete = costEfficiency.coverage.unpricedTokens > 0;
  const assumedPricing = costEfficiency.coverage.assumedTokens > 0;
  const costStatus = pricingIncomplete
    ? t('performance.pricingIncomplete')
    : assumedPricing
      ? t('performance.assumedPricing')
      : undefined;
  const activityStatus = peakHour
    ? undefined
    : hourlyActivity.unallocatedTokens > 0
      ? t('performance.unallocatedActivity', {
          tokens: formatNumber(hourlyActivity.unallocatedTokens, locale),
        })
      : t('performance.noActivity');
  const errorStatus =
    errorRateDetail.errorRate === null
      ? t('performance.noAssessableTurns')
      : errorRateDetail.failedCount > 0
        ? t('performance.turnErrorsDetected', {
            count: errorRateDetail.failedCount,
            formattedCount: formatNumber(errorRateDetail.failedCount, locale),
          })
        : t('performance.noTurnErrors');

  return (
    <section className="performance-summary" aria-label={t('performance.summaryLabel')}>
      <PerformanceSummaryCard
        title={t('performance.cacheHitRate')}
        value={cacheRate}
        valueTestId="performance-summary-cache-value"
        context={t('performance.cacheOverviewContext', {
          cached: formatCompactNumber(cacheEfficiency.cachedInputTokens, locale),
          total: formatCompactNumber(cacheEfficiency.inputTokens, locale),
        })}
        status={
          cacheEfficiency.hasInconsistentData ? t('performance.cacheInconsistentTitle') : undefined
        }
        tone={cacheEfficiency.hasInconsistentData ? 'warning' : undefined}
      />
      <PerformanceSummaryCard
        title={t('performance.effectiveUnitCost')}
        value={unitCost}
        valueTestId="performance-summary-cost-value"
        context={t(
          pricingIncomplete
            ? 'performance.pricedCostOverviewContext'
            : 'performance.costOverviewContext',
          {
            cost: formatUsd(costEfficiency.pricedCostUsd, locale),
            coverage: coverageRate,
          }
        )}
        status={costStatus}
        tone={pricingIncomplete ? 'warning' : undefined}
      />
      <PerformanceSummaryCard
        title={t('performance.peakHours')}
        value={peakHour ? formatHourRange(peakHour.hour) : EMPTY_METRIC}
        valueTestId="performance-summary-activity-value"
        context={
          peakHour
            ? t('performance.peakOverviewContext', {
                tokens: formatCompactNumber(peakHour.totalTokens, locale),
                share: formatPercent(peakHour.shareOfTotal, locale),
              })
            : t('performance.activityUnavailableContext')
        }
        status={activityStatus}
        tone={hourlyActivity.unallocatedTokens > 0 ? 'warning' : undefined}
      />
      <PerformanceSummaryCard
        title={t('performance.errorRate')}
        value={errorRate}
        valueTestId="performance-summary-error-value"
        context={t('performance.errorOverviewContext', {
          failed: formatNumber(errorRateDetail.failedCount, locale),
          assessed: formatNumber(errorRateDetail.assessedCount, locale),
        })}
        status={errorStatus}
        tone={errorRateDetail.failedCount > 0 ? 'danger' : undefined}
      />
    </section>
  );
};

export default PerformanceSummary;
