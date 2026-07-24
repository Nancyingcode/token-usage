/**
 * @file 自适应费用趋势预测
 * @description
 * 将完整费用历史补成连续日序列，并按历史长度选择衰减加权均值或星期趋势预测。
 *
 * 约束：
 * - 当前未结束的本地日期不计入历史样本
 * - 定价覆盖不足时不输出完整金额预测
 * - 所有点预测和区间下界均不得为负数
 */
import type { BudgetPolicyStatus } from './budgetTypes';
import { median, medianAbsoluteDeviation } from './costOptimizationAnomalies';
import type {
  CostForecast,
  CostOptimizationQuery,
  CostOptimizationSettings,
  DailyCostObservation,
  InsufficientForecast,
  PricingCoverage,
} from './costOptimizationTypes';

const WEIGHT_DECAY = 0.85;
const WEEKDAY_METHOD_MINIMUM_DAYS = 28;
const MAX_WEEKDAY_OBSERVATIONS = 8;
const MAD_SCALE_FACTOR = 1.4826;
const EMPIRICAL_INTERVAL_FACTOR = 1.28;
const DAYS_PER_WEEK = 7;
const DATE_PART_LENGTH = 2;
const DATE_PART_COUNT = 3;
const DAYS_FROM_SUNDAY_TO_MONDAY = 6;
const END_OF_DAY_HOUR = 23;
const END_OF_HOUR_MINUTE = 59;
const END_OF_MINUTE_SECOND = 59;
const END_OF_SECOND_MILLISECOND = 999;

export interface ForecastCostInput {
  dailyCosts: DailyCostObservation[];
  settings: CostOptimizationSettings;
  budgets: BudgetPolicyStatus[];
  coverage: PricingCoverage;
  query: CostOptimizationQuery;
  currentPeriodCostUsd: number;
  now: Date;
}

interface ForecastMethodResult {
  method: CostForecast['method'];
  predictedCosts: number[];
  residuals: number[];
}

const toLocalDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(DATE_PART_LENGTH, '0');
  const day = String(date.getDate()).padStart(DATE_PART_LENGTH, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const parseLocalDateKey = (dateKey: string): Date | undefined => {
  const parts = dateKey.split('-').map(Number);

  if (parts.length !== DATE_PART_COUNT) {
    return undefined;
  }

  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return toLocalDateKey(date) === dateKey ? date : undefined;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const buildContinuousDailyCosts = (
  dailyCosts: DailyCostObservation[],
  now: Date
): DailyCostObservation[] => {
  if (Number.isNaN(now.getTime())) {
    return [];
  }

  const currentDateKey = toLocalDateKey(now);
  const costsByDate = new Map<string, number>();

  dailyCosts.forEach(({ date, costUsd }) => {
    const parsedDate = parseLocalDateKey(date);

    if (!parsedDate || date > currentDateKey) {
      return;
    }

    const safeCost = Number.isFinite(costUsd) ? Math.max(costUsd, 0) : 0;
    costsByDate.set(date, (costsByDate.get(date) ?? 0) + safeCost);
  });

  const dates = [...costsByDate.keys()].sort((first, second) => first.localeCompare(second));
  const firstDate = dates[0] ? parseLocalDateKey(dates[0]) : undefined;

  if (!firstDate) {
    return [];
  }

  const observations: DailyCostObservation[] = [];
  let cursor = firstDate;

  while (toLocalDateKey(cursor) <= currentDateKey) {
    const date = toLocalDateKey(cursor);
    observations.push({ date, costUsd: costsByDate.get(date) ?? 0 });
    cursor = addDays(cursor, 1);
  }

  return observations;
};

const getWeightedAverageForecast = (
  history: DailyCostObservation[],
  horizonDays: number
): ForecastMethodResult => {
  let totalWeight = 0;
  let weightedCost = 0;

  [...history].reverse().forEach(({ costUsd }, index) => {
    const weight = WEIGHT_DECAY ** index;
    totalWeight += weight;
    weightedCost += costUsd * weight;
  });
  const prediction = totalWeight > 0 ? weightedCost / totalWeight : 0;

  return {
    method: 'weighted-average',
    predictedCosts: Array.from({ length: horizonDays }, () => prediction),
    residuals: history.map(({ costUsd }) => costUsd - prediction),
  };
};

const getTheilSenSlope = (values: number[]): number => {
  const slopes: number[] = [];

  values.forEach((firstValue, firstIndex) => {
    values.slice(firstIndex + 1).forEach((secondValue, offset) => {
      const secondIndex = firstIndex + offset + 1;
      slopes.push((secondValue - firstValue) / (secondIndex - firstIndex));
    });
  });

  return median(slopes);
};

const getWeekday = (dateKey: string): number => parseLocalDateKey(dateKey)?.getDay() ?? 0;

const getWeekdayTrendForecast = (
  history: DailyCostObservation[],
  futureDates: string[]
): ForecastMethodResult => {
  const trendHistory = history.slice(-WEEKDAY_METHOD_MINIMUM_DAYS);
  const slope = getTheilSenSlope(trendHistory.map(({ costUsd }) => costUsd));
  const detrendedByWeekday = new Map<number, number[]>();

  history.forEach(({ date, costUsd }, index) => {
    const weekday = getWeekday(date);
    const values = detrendedByWeekday.get(weekday) ?? [];
    values.push(costUsd - slope * index);
    detrendedByWeekday.set(weekday, values.slice(-MAX_WEEKDAY_OBSERVATIONS));
  });

  const getFittedCost = (date: string, index: number): number => {
    const weekdayValues = detrendedByWeekday.get(getWeekday(date)) ?? [];
    return median(weekdayValues) + slope * index;
  };
  const predictedCosts = futureDates.map((date, index) =>
    getFittedCost(date, history.length + index)
  );
  const residuals = history.map(({ date, costUsd }, index) => costUsd - getFittedCost(date, index));

  return { method: 'weekday-trend', predictedCosts, residuals };
};

const getFutureDates = (now: Date, horizonDays: number): string[] =>
  Array.from({ length: horizonDays }, (_, index) => toLocalDateKey(addDays(now, index + 1)));

const getQueryPeriodEnd = (query: CostOptimizationQuery, now: Date): Date | undefined => {
  if (query.period === 'total') {
    return undefined;
  }

  const end = new Date(now);
  end.setHours(
    END_OF_DAY_HOUR,
    END_OF_HOUR_MINUTE,
    END_OF_MINUTE_SECOND,
    END_OF_SECOND_MILLISECOND
  );

  if (query.period === 'week') {
    const mondayOffset = (end.getDay() + DAYS_FROM_SUNDAY_TO_MONDAY) % DAYS_PER_WEEK;
    end.setDate(end.getDate() + (DAYS_PER_WEEK - 1 - mondayOffset));
  }
  if (query.period === 'month') {
    end.setMonth(end.getMonth() + 1, 0);
  }
  return end;
};

const getPeriodEndProjection = (
  query: CostOptimizationQuery,
  currentPeriodCostUsd: number,
  points: CostForecast['points'],
  now: Date
): number => {
  if (query.period === 'total') {
    return points.reduce((total, { predictedCostUsd }) => total + predictedCostUsd, 0);
  }

  const periodEnd = getQueryPeriodEnd(query, now);
  const periodEndDate = periodEnd ? toLocalDateKey(periodEnd) : '';
  const remainingProjection = points
    .filter(({ date }) => date <= periodEndDate)
    .reduce((total, { predictedCostUsd }) => total + predictedCostUsd, 0);
  return currentPeriodCostUsd + remainingProjection;
};

const queryPeriodMatchesBudget = (
  query: CostOptimizationQuery,
  budget: BudgetPolicyStatus
): boolean => {
  const queryBudgetPeriod = query.period === 'today' ? 'day' : query.period;
  const periodMatches = queryBudgetPeriod === 'total' || budget.policy.period === queryBudgetPeriod;
  const scopeMatches = query.projectPath
    ? budget.policy.scope === 'project' && budget.policy.projectPath === query.projectPath
    : budget.policy.scope === 'global';
  return periodMatches && scopeMatches;
};

const getBudgetCrossings = (
  budgets: BudgetPolicyStatus[],
  points: CostForecast['points'],
  query: CostOptimizationQuery,
  now: Date
): CostForecast['budgetCrossings'] =>
  budgets
    .flatMap((budget) => {
      const cost = budget.cost;

      if (!cost || !queryPeriodMatchesBudget(query, budget)) {
        return [];
      }
      if (cost.used >= cost.limit) {
        return [
          {
            policyId: budget.policy.id,
            date: toLocalDateKey(now),
            projectedCostUsd: cost.used,
            limitUsd: cost.limit,
          },
        ];
      }

      let projectedCostUsd = cost.used;

      for (const point of points) {
        projectedCostUsd += point.predictedCostUsd;

        if (projectedCostUsd >= cost.limit) {
          return [
            {
              policyId: budget.policy.id,
              date: point.date,
              projectedCostUsd,
              limitUsd: cost.limit,
            },
          ];
        }
      }

      return [];
    })
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) ||
        first.limitUsd - first.projectedCostUsd - (second.limitUsd - second.projectedCostUsd) ||
        first.policyId.localeCompare(second.policyId)
    );

export const forecastCostTrend = ({
  dailyCosts,
  settings,
  budgets,
  coverage,
  query,
  currentPeriodCostUsd,
  now,
}: ForecastCostInput): CostForecast | InsufficientForecast => {
  const continuousCosts = buildContinuousDailyCosts(dailyCosts, now);
  const currentDateKey = Number.isNaN(now.getTime()) ? '' : toLocalDateKey(now);
  const history = continuousCosts.filter(({ date }) => date < currentDateKey);
  const actualHistoryDays = history.length;
  const insufficientBase = {
    requiredHistoryDays: settings.forecastMinimumHistoryDays,
    actualHistoryDays,
    coverage,
  };

  if (coverage.percentage < settings.minimumPricingCoveragePercentage) {
    return { kind: 'pricing-incomplete', ...insufficientBase };
  }
  if (actualHistoryDays < settings.forecastMinimumHistoryDays) {
    return { kind: 'insufficient-data', ...insufficientBase };
  }

  const futureDates = getFutureDates(now, settings.forecastHorizonDays);
  const methodResult =
    actualHistoryDays >= WEEKDAY_METHOD_MINIMUM_DAYS
      ? getWeekdayTrendForecast(history, futureDates)
      : getWeightedAverageForecast(history, settings.forecastHorizonDays);
  const residualCenter = median(methodResult.residuals);
  const residualScale =
    MAD_SCALE_FACTOR * medianAbsoluteDeviation(methodResult.residuals, residualCenter);
  const interval = EMPIRICAL_INTERVAL_FACTOR * residualScale;
  const points = futureDates.map((date, index) => {
    const rawPrediction = methodResult.predictedCosts[index] ?? 0;
    return {
      date,
      predictedCostUsd: Math.max(rawPrediction, 0),
      lowerCostUsd: Math.max(rawPrediction - interval, 0),
      upperCostUsd: Math.max(rawPrediction + interval, 0),
    };
  });
  const projectedCostUsd = points.reduce(
    (total, { predictedCostUsd }) => total + predictedCostUsd,
    0
  );

  return {
    kind: 'ready',
    method: methodResult.method,
    intervalLabel: '80% empirical interval',
    historyDays: actualHistoryDays,
    horizonDays: settings.forecastHorizonDays,
    points,
    projectedCostUsd,
    periodEndProjectedCostUsd: getPeriodEndProjection(query, currentPeriodCostUsd, points, now),
    budgetCrossings: getBudgetCrossings(budgets, points, query, now),
    coverage,
  };
};
