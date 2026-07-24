import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COST_OPTIMIZATION_SETTINGS,
  getCostOptimizationQueryIssues,
  getCostOptimizationSettingsIssues,
} from '../src/shared/costOptimizationValidation';

describe('cost optimization validation', () => {
  it('rejects out-of-range analysis settings', () => {
    expect(
      getCostOptimizationSettingsIssues({
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        anomalyHistoryWindow: 6,
        anomalyMinimumSamples: 2,
        anomalySensitivity: 11,
        forecastMinimumHistoryDays: 29,
        minimumSavingsUsd: -1,
        targetCachePercentage: 101,
      }).map(({ field, code }) => ({ field, code }))
    ).toEqual([
      { field: 'anomalyHistoryWindow', code: 'history-window-range' },
      { field: 'anomalyMinimumSamples', code: 'minimum-samples-range' },
      { field: 'anomalySensitivity', code: 'sensitivity-range' },
      { field: 'forecastMinimumHistoryDays', code: 'forecast-history-range' },
      { field: 'minimumSavingsUsd', code: 'minimum-savings-range' },
      { field: 'targetCachePercentage', code: 'percentage-range' },
    ]);
  });

  it('rejects duplicate or unpriced candidate models', () => {
    const issues = getCostOptimizationSettingsIssues(
      {
        ...DEFAULT_COST_OPTIMIZATION_SETTINGS,
        candidateModelIds: ['gpt-test', 'GPT-TEST', 'missing-model'],
      },
      ['gpt-test']
    );

    expect(issues.map(({ code }) => code)).toEqual([
      'candidate-model-duplicate',
      'candidate-model-unpriced',
    ]);
  });

  it('allows only projects present in the current scan', () => {
    expect(
      getCostOptimizationQueryIssues({ period: 'month', projectPath: 'C:\\missing' }, ['C:\\repo'])
    ).toEqual([{ field: 'projectPath', code: 'project-not-found' }]);
  });
});
