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
  CostOptimizationQuery,
  InsufficientForecast,
} from '../../shared/costOptimizationTypes';
import { resolveRendererLocale } from '../i18n';
import { formatPercent, formatUsd } from '../utils/formatters';

interface CostForecastProps {
  forecast: CostForecastModel | InsufficientForecast;
  budgets: BudgetPolicyStatus[];
  query: CostOptimizationQuery;
}

const CHART_WIDTH = 720;
const CHART_HEIGHT = 260;
const CHART_PADDING = 34;
const CHART_INNER_WIDTH = CHART_WIDTH - CHART_PADDING * 2;
const CHART_INNER_HEIGHT = CHART_HEIGHT - CHART_PADDING * 2;
const INTERVAL_KEYS: Record<CostForecastModel['intervalKind'], 'forecast.interval.empirical80'> = {
  'empirical-80': 'forecast.interval.empirical80',
};

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

export const buildCumulativeForecastPoints = (
  points: CostForecastPoint[],
  startingCostUsd: number
): CostForecastPoint[] => {
  let predictedCostUsd = Math.max(startingCostUsd, 0);
  let lowerCostUsd = Math.max(startingCostUsd, 0);
  let upperCostUsd = Math.max(startingCostUsd, 0);

  return points.map((point) => {
    predictedCostUsd += point.predictedCostUsd;
    lowerCostUsd += point.lowerCostUsd;
    upperCostUsd += point.upperCostUsd;

    return {
      date: point.date,
      predictedCostUsd,
      lowerCostUsd,
      upperCostUsd,
    };
  });
};

export const getForecastBandPoints = (points: CostForecastPoint[], maximum: number): string => {
  const upperCoordinates = points.map(
    (point, index) => `${getPointX(index, points.length)},${getPointY(point.upperCostUsd, maximum)}`
  );
  const lowerCoordinates = points
    .map(
      (point, index) =>
        `${getPointX(index, points.length)},${getPointY(point.lowerCostUsd, maximum)}`
    )
    .reverse();

  return [...upperCoordinates, ...lowerCoordinates].join(' ');
};

const budgetMatchesForecastScope = (
  budget: BudgetPolicyStatus | undefined,
  query: CostOptimizationQuery
): boolean => {
  if (!budget?.cost) {
    return false;
  }
  if (query.projectPath) {
    return budget.policy.scope === 'project' && budget.policy.projectPath === query.projectPath;
  }
  return budget.policy.scope === 'global';
};

const CostForecast: React.FC<CostForecastProps> = ({ forecast, budgets, query }) => {
  const { t, i18n } = useTranslation('costOptimization');
  const locale = resolveRendererLocale(i18n.resolvedLanguage);
  const crossingPolicyIds = [...new Set(forecast.budgetCrossings.map(({ policyId }) => policyId))];
  const [selectedPolicyId, setSelectedPolicyId] = useState(crossingPolicyIds[0] ?? '');
  const effectiveSelectedPolicyId = crossingPolicyIds.includes(selectedPolicyId)
    ? selectedPolicyId
    : (crossingPolicyIds[0] ?? '');
  const selectedCrossing =
    forecast.budgetCrossings.find(({ policyId }) => policyId === effectiveSelectedPolicyId) ??
    forecast.budgetCrossings[0];
  const selectedBudget = budgets.find(({ policy }) => policy.id === selectedCrossing?.policyId);
  const selectedBudgetMatchesForecast = budgetMatchesForecastScope(selectedBudget, query);
  const startingCostUsd =
    selectedBudgetMatchesForecast && selectedBudget?.cost ? selectedBudget.cost.used : 0;
  const chartPoints = useMemo(
    () =>
      forecast.kind === 'ready'
        ? buildCumulativeForecastPoints(forecast.points, startingCostUsd)
        : [],
    [forecast, startingCostUsd]
  );
  const maximum = useMemo(
    () =>
      forecast.kind === 'ready'
        ? Math.max(
            ...chartPoints.map(({ upperCostUsd }) => upperCostUsd),
            selectedBudgetMatchesForecast && selectedCrossing ? selectedCrossing.limitUsd : 0,
            1
          )
        : 1,
    [chartPoints, forecast.kind, selectedBudgetMatchesForecast, selectedCrossing]
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
        {selectedCrossing ? (
          <p>
            {t('forecast.crossingDescription', {
              budget: selectedBudget?.policy.projectPath ?? selectedCrossing.policyId,
              date: selectedCrossing.date,
              limit: formatUsd(selectedCrossing.limitUsd, locale),
            })}
          </p>
        ) : null}
      </section>
    );
  }

  const intervalLabel = t(INTERVAL_KEYS[forecast.intervalKind]);
  const bandPoints = getForecastBandPoints(chartPoints, maximum);
  const predictionPoints = getPolylinePoints(
    chartPoints,
    maximum,
    ({ predictedCostUsd }) => predictedCostUsd
  );
  const budgetY =
    selectedBudgetMatchesForecast && selectedCrossing
      ? getPointY(selectedCrossing.limitUsd, maximum)
      : undefined;

  return (
    <section className="cost-detail-stack">
      <div className="cost-forecast-header">
        <div>
          <h3>{t('forecast.title')}</h3>
          <p>
            {t('forecast.summary', {
              value: formatUsd(forecast.projectedCostUsd, locale),
              interval: intervalLabel,
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
              interval: intervalLabel,
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
          <polygon className="cost-chart-band" points={bandPoints} />
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
          {chartPoints.map((point, index) => (
            <circle
              key={point.date}
              className="cost-chart-point"
              cx={getPointX(index, chartPoints.length)}
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
        <span>{intervalLabel}</span>
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
