/**
 * @file 成本趋势预测
 * @description 绘制定价费用预测、经验区间和预算穿越，并提供文本等价信息。
 */
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetPolicyStatus } from '../../shared/budgetTypes';
import type {
  CostForecast as CostForecastModel,
  CostForecastPoint,
  InsufficientForecast,
} from '../../shared/costOptimizationTypes';
import { resolveRendererLocale } from '../i18n';
import { formatPercent, formatUsd } from '../utils/formatters';

interface CostForecastProps {
  forecast: CostForecastModel | InsufficientForecast;
  budgets: BudgetPolicyStatus[];
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_PADDING = 34;
const CHART_INNER_WIDTH = CHART_WIDTH - CHART_PADDING * 2;
const CHART_INNER_HEIGHT = CHART_HEIGHT - CHART_PADDING * 2;

const getPointX = (index: number, pointCount: number): number =>
  CHART_PADDING +
  (pointCount <= 1 ? CHART_INNER_WIDTH / 2 : (index / (pointCount - 1)) * CHART_INNER_WIDTH);

const getPointY = (value: number, maximum: number): number =>
  CHART_PADDING + CHART_INNER_HEIGHT - (value / maximum) * CHART_INNER_HEIGHT;

const getPolylinePoints = (
  points: CostForecastPoint[],
  maximum: number,
  valueSelector: (point: CostForecastPoint) => number
): string =>
  points
    .map(
      (point, index) =>
        `${getPointX(index, points.length)},${getPointY(valueSelector(point), maximum)}`
    )
    .join(' ');

const CostForecast: React.FC<CostForecastProps> = ({ forecast, budgets }) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const crossingPolicyIds =
    forecast.kind === 'ready'
      ? [...new Set(forecast.budgetCrossings.map(({ policyId }) => policyId))]
      : [];
  const [selectedPolicyId, setSelectedPolicyId] = useState(crossingPolicyIds[0] ?? '');
  const effectiveSelectedPolicyId = crossingPolicyIds.includes(selectedPolicyId)
    ? selectedPolicyId
    : (crossingPolicyIds[0] ?? '');
  const selectedCrossing =
    forecast.kind === 'ready'
      ? (forecast.budgetCrossings.find(({ policyId }) => policyId === effectiveSelectedPolicyId) ??
        forecast.budgetCrossings[0])
      : undefined;
  const selectedBudget = budgets.find(({ policy }) => policy.id === selectedCrossing?.policyId);
  const maximum = useMemo(
    () =>
      forecast.kind === 'ready'
        ? Math.max(
            ...forecast.points.map(({ upperCostUsd }) => upperCostUsd),
            ...forecast.budgetCrossings.map(({ limitUsd }) => limitUsd),
            1
          )
        : 1,
    [forecast]
  );

  if (forecast.kind !== 'ready') {
    return (
      <section className="panel cost-detail-empty">
        <h3>
          {forecast.kind === 'pricing-incomplete'
            ? t('forecast.pricingIncomplete')
            : t('forecast.insufficientTitle')}
        </h3>
        <p>
          {t('forecast.insufficientDescription', {
            actual: forecast.actualHistoryDays,
            required: forecast.requiredHistoryDays,
            coverage: formatPercent(forecast.coverage.percentage, locale),
          })}
        </p>
      </section>
    );
  }

  const upperPoints = getPolylinePoints(
    forecast.points,
    maximum,
    ({ upperCostUsd }) => upperCostUsd
  );
  const lowerPoints = getPolylinePoints(
    [...forecast.points].reverse(),
    maximum,
    ({ lowerCostUsd }) => lowerCostUsd
  );
  const predictionPoints = getPolylinePoints(
    forecast.points,
    maximum,
    ({ predictedCostUsd }) => predictedCostUsd
  );
  const budgetY = selectedCrossing ? getPointY(selectedCrossing.limitUsd, maximum) : undefined;

  return (
    <section className="cost-detail-stack">
      <div className="cost-forecast-header">
        <div>
          <h3>{t('forecast.title')}</h3>
          <p>
            {t('forecast.summary', {
              value: formatUsd(forecast.projectedCostUsd, locale),
              interval: forecast.intervalLabel,
            })}
          </p>
        </div>
        {crossingPolicyIds.length > 1 ? (
          <label>
            <span>{t('forecast.budget')}</span>
            <select
              value={effectiveSelectedPolicyId}
              onChange={(event) => setSelectedPolicyId(event.target.value)}
            >
              {crossingPolicyIds.map((policyId) => (
                <option key={policyId} value={policyId}>
                  {budgets.find(({ policy }) => policy.id === policyId)?.policy.projectPath ??
                    policyId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="cost-forecast-chart">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          role="img"
          aria-labelledby="cost-forecast-title cost-forecast-description"
        >
          <title id="cost-forecast-title">{t('forecast.chartTitle')}</title>
          <desc id="cost-forecast-description">
            {t('forecast.chartDescription', {
              interval: forecast.intervalLabel,
              currency: 'USD',
            })}
          </desc>
          <line
            className="cost-chart-axis"
            x1={CHART_PADDING}
            y1={CHART_HEIGHT - CHART_PADDING}
            x2={CHART_WIDTH - CHART_PADDING}
            y2={CHART_HEIGHT - CHART_PADDING}
          />
          <polygon className="cost-chart-band" points={`${upperPoints} ${lowerPoints}`} />
          <polyline className="cost-chart-line" points={predictionPoints} />
          {budgetY === undefined ? null : (
            <line
              className="cost-chart-budget"
              x1={CHART_PADDING}
              y1={budgetY}
              x2={CHART_WIDTH - CHART_PADDING}
              y2={budgetY}
            />
          )}
          {forecast.points.map((point, index) => (
            <circle
              key={point.date}
              className="cost-chart-point"
              cx={getPointX(index, forecast.points.length)}
              cy={getPointY(point.predictedCostUsd, maximum)}
              r="4"
              tabIndex={0}
            >
              <title>
                {t('forecast.point', {
                  date: point.date,
                  value: formatUsd(point.predictedCostUsd, locale),
                  lower: formatUsd(point.lowerCostUsd, locale),
                  upper: formatUsd(point.upperCostUsd, locale),
                })}
              </title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="cost-forecast-legend">
        <span>{forecast.intervalLabel}</span>
        <span>{t(`overview.method.${forecast.method}`)}</span>
        <span>{t('forecast.currency', { currency: 'USD' })}</span>
      </div>

      {selectedCrossing ? (
        <section className="cost-budget-crossing">
          <strong>{t('forecast.expectedToExceed')}</strong>
          <span>
            {t('forecast.crossingDescription', {
              budget: selectedBudget?.policy.projectPath ?? selectedCrossing.policyId,
              date: selectedCrossing.date,
              limit: formatUsd(selectedCrossing.limitUsd, locale),
            })}
          </span>
        </section>
      ) : (
        <p>{t('forecast.noCrossing')}</p>
      )}
    </section>
  );
};

export default CostForecast;
