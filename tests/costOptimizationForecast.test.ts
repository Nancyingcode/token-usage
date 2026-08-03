import { describe, expect, it } from 'vitest';
import type { BudgetPeriod, BudgetPolicyStatus } from '../src/shared/budgetTypes';
import type { DailyCostObservation } from '../src/shared/costOptimizationTypes';
import {
  buildContinuousDailyCosts,
  forecastCostTrend,
} from '../src/shared/costOptimizationForecast';
import { COVERAGE, FIXED_NOW, SETTINGS } from './helpers/costOptimizationFixtures';

const MILLISECONDS_PER_DAY = 86_400_000;

describe('cost forecasting', () => {
  it('fills internal and trailing zero-cost days through the current local date', () => {
    expect(
      buildContinuousDailyCosts(
        [
          { date: '2026-07-22', costUsd: 2 },
          { date: '2026-07-24', costUsd: 4 },
        ],
        FIXED_NOW
      )
    ).toEqual([
      { date: '2026-07-22', costUsd: 2 },
      { date: '2026-07-23', costUsd: 0 },
      { date: '2026-07-24', costUsd: 4 },
      { date: '2026-07-25', costUsd: 0 },
    ]);
  });

  it('returns insufficient data before the configured minimum', () => {
    const result = forecastCostTrend({
      dailyCosts: makeDailyCosts(6, () => 1),
      settings: SETTINGS,
      budgets: [],
      coverage: COVERAGE,
      query: { period: 'month' },
      currentPeriodCostUsd: 6,
      now: FIXED_NOW,
    });
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'insufficient-data',
        requiredHistoryDays: 7,
        actualHistoryDays: 6,
      })
    );
  });

  it('uses weighted average from the minimum through day 27', () => {
    const result = forecastCostTrend({
      dailyCosts: makeDailyCosts(7, (index) => index + 1),
      settings: { ...SETTINGS, forecastHorizonDays: 7 },
      budgets: [],
      coverage: COVERAGE,
      query: { period: 'month' },
      currentPeriodCostUsd: 28,
      now: FIXED_NOW,
    });

    expect(result).toEqual(expect.objectContaining({ kind: 'ready', method: 'weighted-average' }));
    if (result.kind === 'ready') {
      expect(result.points).toHaveLength(7);
      expect(result.points.every(({ lowerCostUsd }) => lowerCostUsd >= 0)).toBe(true);
    }
  });

  it('uses weekday baselines and reports the earliest budget crossing after 28 days', () => {
    const result = forecastCostTrend({
      dailyCosts: makeWeekdayPatternCosts(56),
      settings: { ...SETTINGS, forecastHorizonDays: 30 },
      budgets: [makeCostBudget('monthly-cost', 60)],
      coverage: COVERAGE,
      query: { period: 'month' },
      currentPeriodCostUsd: 50,
      now: FIXED_NOW,
    });

    expect(result).toEqual(expect.objectContaining({ kind: 'ready', method: 'weekday-trend' }));
    if (result.kind === 'ready') {
      expect(result.budgetCrossings[0]?.policyId).toBe('monthly-cost');
      expect(result.intervalKind).toBe('empirical-80');
    }
  });

  it('gates monetary forecasts when pricing coverage is below the threshold', () => {
    const result = forecastCostTrend({
      dailyCosts: makeDailyCosts(28, () => 1),
      settings: SETTINGS,
      budgets: [],
      coverage: { ...COVERAGE, percentage: 50 },
      query: { period: 'month' },
      currentPeriodCostUsd: 28,
      now: FIXED_NOW,
    });

    expect(result.kind).toBe('pricing-incomplete');
  });

  it('resets projected budget usage at day, week, and month boundaries', () => {
    const result = forecastCostTrend({
      dailyCosts: makeDailyCosts(7, () => 1),
      settings: { ...SETTINGS, forecastHorizonDays: 30 },
      budgets: [
        makeCostBudget('daily-cost', 10, 'day', 9),
        makeCostBudget('weekly-cost', 10, 'week', 8),
        makeCostBudget('monthly-cost', 25, 'month', 18),
      ],
      coverage: COVERAGE,
      query: { period: 'total' },
      currentPeriodCostUsd: 18,
      now: FIXED_NOW,
    });

    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.budgetCrossings).toEqual([]);
    }
  });
});

const makeDailyCosts = (
  count: number,
  getCost: (index: number) => number
): DailyCostObservation[] =>
  Array.from({ length: count }, (_, index) => ({
    date: new Date(FIXED_NOW.getTime() - (count - index) * MILLISECONDS_PER_DAY)
      .toISOString()
      .slice(0, 10),
    costUsd: getCost(index),
  }));

const makeWeekdayPatternCosts = (count: number): DailyCostObservation[] =>
  makeDailyCosts(count, (index) => (index % 7 < 5 ? 2 : 1) + index * 0.02);

const makeCostBudget = (
  id: string,
  limitUsd: number,
  period: BudgetPeriod = 'month',
  usedUsd = 50
): BudgetPolicyStatus => ({
  policy: {
    id,
    scope: 'global',
    period,
    modelTarget: { kind: 'all' },
    costLimitUsd: limitUsd,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  periodStart: '2026-07-01T00:00:00.000Z',
  periodEnd: FIXED_NOW.toISOString(),
  assumedTokens: 0,
  cost: {
    used: usedUsd,
    limit: limitUsd,
    percent: (usedUsd / limitUsd) * 100,
    severity: 'normal',
  },
  unpricedTokens: 0,
  unpricedModelIds: [],
});
