/**
 * @file Cost efficiency detail card
 * @description Displays cost coverage, composition, and keyboard-accessible daily cost details.
 */

import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SupportedLocale } from '../../shared/i18n/locale';
import { resolveRendererLocale } from '../i18n';
import type {
  CostEfficiency,
  CostEfficiencyDay,
  CostEfficiencyBreakdownItem,
} from '../utils/costEfficiency';
import { formatNumber, formatPercent, formatUsd } from '../utils/formatters';

interface CostEfficiencyCardProps {
  efficiency: CostEfficiency;
}

const PERCENT_SCALE = 100;
const DATE_PART_COUNT = 3;
const MINIMUM_VISIBLE_BAR_PERCENTAGE = 2;

const formatDateKey = (value: string, locale: SupportedLocale): string => {
  const dateParts = value.split('-').map(Number);

  if (dateParts.length !== DATE_PART_COUNT || dateParts.some((part) => !Number.isInteger(part))) {
    return value;
  }

  const [year, month, day] = dateParts;
  const date = new Date(year, month - 1, day);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
};

const CostEfficiencyCard: React.FC<CostEfficiencyCardProps> = ({ efficiency }) => {
  const { t, i18n } = useTranslation('analytics');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const chartDescriptionId = useId();
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const activeDay = efficiency.days.find(({ date }) => date === activeDate) ?? null;
  const pricingIncomplete = efficiency.coverage.unpricedTokens > 0;
  const assumedPricing = efficiency.coverage.assumedTokens > 0;
  const hasTrend = efficiency.days.some(({ coverage }) => coverage.pricedTokens > 0);
  const maxDailyCost = Math.max(
    0,
    ...efficiency.days
      .filter(({ coverage }) => coverage.pricedTokens > 0)
      .map(({ pricedCostUsd }) => pricedCostUsd)
  );
  const firstDay = efficiency.days[0];
  const lastDay = efficiency.days.at(-1);
  const showLastDayLabel = lastDay !== undefined && lastDay.date !== firstDay?.date;

  const formatRate = (percentage: number | null): string =>
    percentage === null ? '—' : formatPercent(percentage, locale);
  const formatUnitCost = (costUsd: number | null): string =>
    costUsd === null
      ? '—'
      : t('performance.costPerMillionValue', { cost: formatUsd(costUsd, locale) });
  const getDayLabel = (day: CostEfficiencyDay): string => {
    const pricingState =
      day.coverage.unpricedTokens > 0
        ? t('performance.costDayPricingIncomplete', {
            tokens: formatNumber(day.coverage.unpricedTokens, locale),
          })
        : day.coverage.assumedTokens > 0
          ? t('performance.costDayAssumedPricing')
          : '';

    return t(
      day.coverage.pricedTokens > 0
        ? 'performance.costDayLabel'
        : 'performance.costDayUnavailableLabel',
      {
        date: formatDateKey(day.date, locale),
        cost: formatUsd(day.pricedCostUsd, locale),
        unitCost: formatUnitCost(day.unitCostUsdPerMillion),
        pricedTokens: formatNumber(day.coverage.pricedTokens, locale),
        coverage: formatRate(day.coverage.percentage),
        pricingState,
      }
    );
  };
  const coverageItems = [
    {
      kind: 'exact',
      label: t('performance.exactPricing'),
      tokens: efficiency.coverage.exactPricedTokens,
      percentage: efficiency.coverage.exactPercentage,
    },
    {
      kind: 'assumed',
      label: t('performance.fallbackPricing'),
      tokens: efficiency.coverage.assumedTokens,
      percentage: efficiency.coverage.assumedPercentage,
    },
    {
      kind: 'unpriced',
      label: t('performance.unpriced'),
      tokens: efficiency.coverage.unpricedTokens,
      percentage: efficiency.coverage.unpricedPercentage,
    },
  ];
  const breakdownLabels: Record<CostEfficiencyBreakdownItem['kind'], string> = {
    'regular-input': t('performance.regularInputCost'),
    'cached-input': t('performance.cachedInputCost'),
    output: t('performance.outputCost'),
  };

  return (
    <article className="panel perf-card cost-efficiency-card">
      <div className="cost-efficiency-summary" data-testid="cost-summary">
        <div className="cost-efficiency-heading">
          <h3>{t('performance.costEfficiency')}</h3>
          <span className="cost-efficiency-value-label">
            {t(pricingIncomplete ? 'performance.pricedCost' : 'performance.estimatedCost')}
          </span>
          <strong className="cost-efficiency-value">
            {formatUsd(efficiency.pricedCostUsd, locale)}
          </strong>
          <p>{t('performance.costLocalEstimate')}</p>
        </div>

        <dl className="cost-efficiency-stats">
          <div>
            <dt>{t('performance.effectiveUnitCost')}</dt>
            <dd data-testid="cost-unit-value">
              {formatUnitCost(efficiency.unitCostUsdPerMillion)}
            </dd>
          </div>
          <div>
            <dt>
              {t(
                pricingIncomplete
                  ? 'performance.pricedAveragePerSession'
                  : 'performance.averagePerSession'
              )}
            </dt>
            <dd>
              {efficiency.averageSessionCostUsd === null
                ? '—'
                : formatUsd(efficiency.averageSessionCostUsd, locale)}
            </dd>
          </div>
          <div>
            <dt>{t('performance.pricingCoverage')}</dt>
            <dd>{formatRate(efficiency.coverage.percentage)}</dd>
          </div>
        </dl>
      </div>

      {pricingIncomplete ? (
        <div className="cost-efficiency-warning" role="status">
          <strong>{t('performance.pricingIncomplete')}</strong>
          <span>
            {t('performance.unpricedTokenDetail', {
              tokens: formatNumber(efficiency.coverage.unpricedTokens, locale),
            })}
          </span>
          {efficiency.coverage.unpricedModelIds.length > 0 ? (
            <span>
              {t('performance.unpricedModels', {
                models: efficiency.coverage.unpricedModelIds.join(', '),
              })}
            </span>
          ) : null}
        </div>
      ) : assumedPricing ? (
        <div className="cost-efficiency-assumption" role="status">
          {t('performance.assumedPricing')}
        </div>
      ) : null}

      <section className="cost-coverage" aria-label={t('performance.pricingCoverage')}>
        <div className="cost-section-heading">
          <strong>{t('performance.pricingCoverage')}</strong>
          <span>{t('performance.pricingCoverageDescription')}</span>
        </div>
        <div className="cost-segment-track" aria-hidden="true">
          {coverageItems.map((item) => (
            <span
              key={item.kind}
              className={`cost-segment-${item.kind}`}
              style={{ width: `${item.percentage ?? 0}%` }}
            />
          ))}
        </div>
        <ul className="cost-segment-legend" aria-label={t('performance.pricingCoverageLegend')}>
          {coverageItems.map((item) => (
            <li key={item.kind} className={item.kind}>
              <span>{item.label}</span>
              <strong>
                {formatNumber(item.tokens, locale)} · {formatRate(item.percentage)}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="cost-composition" aria-label={t('performance.costComposition')}>
        <div className="cost-section-heading">
          <strong>{t('performance.costComposition')}</strong>
          <span>{t('performance.costCompositionDescription')}</span>
        </div>
        <div className="cost-segment-track" aria-hidden="true">
          {efficiency.breakdown.map((item) => (
            <span
              key={item.kind}
              className={`cost-breakdown-${item.kind}`}
              style={{ width: `${item.percentage ?? 0}%` }}
            />
          ))}
        </div>
        <ul className="cost-segment-legend" aria-label={t('performance.costCompositionLegend')}>
          {efficiency.breakdown.map((item) => (
            <li key={item.kind} className={item.kind}>
              <span>{breakdownLabels[item.kind]}</span>
              <strong>
                {formatUsd(item.costUsd, locale)} · {formatRate(item.percentage)}
              </strong>
            </li>
          ))}
        </ul>
      </section>

      <figure className="cost-trend" aria-labelledby={chartDescriptionId}>
        <figcaption id={chartDescriptionId} className="cost-section-heading">
          <strong>{t('performance.dailyCostTrend')}</strong>
          <span>{t('performance.costTrendDescription')}</span>
        </figcaption>

        {hasTrend ? (
          <div className="cost-trend-scroll">
            <div className="cost-trend-plot">
              <div className="cost-trend-bars" role="list">
                {efficiency.days.map((day) => {
                  const available = day.coverage.pricedTokens > 0;
                  const height = available
                    ? maxDailyCost > 0
                      ? Math.max(
                          MINIMUM_VISIBLE_BAR_PERCENTAGE,
                          (day.pricedCostUsd / maxDailyCost) * PERCENT_SCALE
                        )
                      : MINIMUM_VISIBLE_BAR_PERCENTAGE
                    : 0;

                  return (
                    <span className="cost-trend-column" role="listitem" key={day.date}>
                      <span
                        className={`cost-trend-target${available ? '' : ' unavailable'}`}
                        role="img"
                        tabIndex={0}
                        aria-label={getDayLabel(day)}
                        data-cost-usd={available ? day.pricedCostUsd : 'unavailable'}
                        data-testid={`cost-day-${day.date}`}
                        onMouseEnter={() => setActiveDate(day.date)}
                        onMouseLeave={() => setActiveDate(null)}
                        onFocus={() => setActiveDate(day.date)}
                        onBlur={() => setActiveDate(null)}
                      >
                        <span className="cost-trend-bar" style={{ height: `${height}%` }} />
                      </span>
                    </span>
                  );
                })}
              </div>

              <div className="cost-trend-axis" aria-hidden="true">
                {firstDay ? <span>{formatDateKey(firstDay.date, locale)}</span> : null}
                {showLastDayLabel ? <span>{formatDateKey(lastDay.date, locale)}</span> : null}
              </div>

              {activeDay ? (
                <div className="cost-trend-tooltip" role="tooltip">
                  <strong>{formatDateKey(activeDay.date, locale)}</strong>
                  <span>
                    {activeDay.coverage.pricedTokens > 0
                      ? formatUsd(activeDay.pricedCostUsd, locale)
                      : t('performance.costUnavailable')}
                  </span>
                  <dl>
                    <div>
                      <dt>{t('performance.effectiveUnitCost')}</dt>
                      <dd>{formatUnitCost(activeDay.unitCostUsdPerMillion)}</dd>
                    </div>
                    <div>
                      <dt>{t('performance.pricedTokens')}</dt>
                      <dd>{formatNumber(activeDay.coverage.pricedTokens, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t('performance.pricingCoverage')}</dt>
                      <dd>{formatRate(activeDay.coverage.percentage)}</dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="cost-trend-empty">{t('performance.noPricedUsage')}</p>
        )}
      </figure>
    </article>
  );
};

export default CostEfficiencyCard;
