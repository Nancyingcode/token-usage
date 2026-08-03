/**
 * @file 成本优化总览
 * @description 汇总当前费用、定价覆盖、预测、异常和保守节省建议。
 */
import React from 'react';
import { CircleDollarSign, PiggyBank, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CostOptimizationSnapshot } from '../../shared/costOptimizationTypes';
import { ICON_SIZE_LARGE } from '../constants/ui';
import { resolveRendererLocale } from '../i18n';
import { formatPercent, formatUsd } from '../utils/formatters';

interface CostOptimizationOverviewProps {
  snapshot: CostOptimizationSnapshot;
}

const OVERVIEW_RECOMMENDATION_LIMIT = 3;
const OVERVIEW_ANOMALY_LIMIT = 2;

const CostOptimizationOverview: React.FC<CostOptimizationOverviewProps> = ({ snapshot }) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const pricingCoverageReady =
    snapshot.coverage.percentage >= snapshot.settings.minimumPricingCoveragePercentage;
  const forecastValue =
    snapshot.forecast.kind === 'ready'
      ? formatUsd(snapshot.forecast.periodEndProjectedCostUsd, locale)
      : t('overview.insufficientHistory');
  const savingsValue = pricingCoverageReady
    ? formatUsd(snapshot.conservativeSavingsUsd, locale)
    : t('overview.pricingRequired');
  const earliestCrossing =
    snapshot.forecast.kind === 'ready' ? snapshot.forecast.budgetCrossings[0] : undefined;
  const recommendations = snapshot.recommendations.slice(0, OVERVIEW_RECOMMENDATION_LIMIT);
  const anomalies = [...snapshot.anomalies]
    .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt))
    .slice(0, OVERVIEW_ANOMALY_LIMIT);

  return (
    <div className="cost-optimization-overview">
      <section className="cost-optimization-metric-grid" aria-label={t('overview.metrics')}>
        <article className="metric-card metric-card--featured">
          <div className="metric-copy">
            <span>{t('overview.currentCost')}</span>
            <strong>{formatUsd(snapshot.currentCostUsd, locale)}</strong>
            <small>{t('overview.pricingCoverage')}</small>
            <em className="status-label">{formatPercent(snapshot.coverage.percentage, locale)}</em>
          </div>
          <CircleDollarSign size={ICON_SIZE_LARGE} />
        </article>
        <article className="metric-card metric-card--default">
          <div className="metric-copy">
            <span>{t('overview.periodEndForecast')}</span>
            <strong>{forecastValue}</strong>
            <small>
              {snapshot.forecast.kind === 'ready'
                ? t(`overview.method.${snapshot.forecast.method}`)
                : t('overview.needsHistory', {
                    count: snapshot.forecast.requiredHistoryDays,
                  })}
            </small>
          </div>
          <ShieldCheck size={ICON_SIZE_LARGE} />
        </article>
        <article className="metric-card metric-card--default">
          <div className="metric-copy">
            <span>{t('overview.anomalies')}</span>
            <strong>{snapshot.anomalies.length}</strong>
            <small>{t('overview.currentPeriod')}</small>
          </div>
          <TriangleAlert size={ICON_SIZE_LARGE} />
        </article>
        <article className="metric-card metric-card--default">
          <div className="metric-copy">
            <span>{t('overview.conservativeSavings')}</span>
            <strong>{savingsValue}</strong>
            <small>{t('overview.overlapAdjusted')}</small>
          </div>
          <PiggyBank size={ICON_SIZE_LARGE} />
        </article>
      </section>

      {!pricingCoverageReady ? (
        <section className="cost-optimization-pricing-gate">
          <strong>{t('overview.pricingGateTitle')}</strong>
          <span>
            {t('overview.pricingGateDescription', {
              current: snapshot.coverage.percentage,
              required: snapshot.settings.minimumPricingCoveragePercentage,
            })}
          </span>
        </section>
      ) : null}

      <section className="panel cost-optimization-forecast-summary">
        <div className="panel-heading compact">
          <div>
            <h3>{t('overview.forecastSummary')}</h3>
            <p>
              {snapshot.forecast.kind === 'ready'
                ? t('overview.forecastRange', {
                    value: formatUsd(snapshot.forecast.projectedCostUsd, locale),
                    interval: t('forecast.interval.empirical80'),
                  })
                : t('overview.needsHistory', {
                    count: snapshot.forecast.requiredHistoryDays,
                  })}
            </p>
          </div>
        </div>
        {earliestCrossing ? (
          <p>
            {t('overview.budgetCrossing', {
              date: earliestCrossing.date,
              limit: formatUsd(earliestCrossing.limitUsd, locale),
            })}
          </p>
        ) : (
          <p>{t('overview.noBudgetCrossing')}</p>
        )}
      </section>

      <div className="cost-optimization-summary-grid">
        <section className="panel">
          <div className="panel-heading compact">
            <div>
              <h3>{t('overview.topRecommendations')}</h3>
              <p>{t('overview.topRecommendationsDescription')}</p>
            </div>
          </div>
          {recommendations.length > 0 ? (
            <ul className="cost-optimization-summary-list">
              {recommendations.map((recommendation) => (
                <li key={recommendation.id}>
                  <div>
                    <strong>{t(`recommendation.${recommendation.type}`)}</strong>
                    <span>{recommendation.scopeLabel}</span>
                  </div>
                  <em>{formatUsd(recommendation.savingsUsd, locale)}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('overview.noRecommendations')}</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading compact">
            <div>
              <h3>{t('overview.latestAnomalies')}</h3>
              <p>{t('overview.latestAnomaliesDescription')}</p>
            </div>
          </div>
          {anomalies.length > 0 ? (
            <ul className="cost-optimization-summary-list">
              {anomalies.map((anomaly) => (
                <li key={anomaly.id}>
                  <div>
                    <strong>{t(`anomaly.level.${anomaly.level}`)}</strong>
                    <span>{anomaly.projectName ?? anomaly.modelId ?? anomaly.date}</span>
                  </div>
                  <em>{formatUsd(anomaly.actualCostUsd, locale)}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('overview.noAnomalies')}</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default CostOptimizationOverview;
