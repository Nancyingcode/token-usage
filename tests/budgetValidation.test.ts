import { describe, expect, it } from 'vitest';
import {
  getBudgetPolicyIssues,
  getPricingOverrideIssues,
  getThresholdIssues,
} from '../src/shared/budgetValidation';

describe('budget validation', () => {
  it('requires a project path and at least one positive limit', () => {
    expect(getBudgetPolicyIssues({ scope: 'project', period: 'day', tokenLimit: 0 })).toEqual([
      { field: 'projectPath', message: 'Project is required.' },
      { field: 'tokenLimit', message: 'Token limit must be greater than 0.' },
      { field: 'limits', message: 'Enable at least one budget limit.' },
    ]);
  });

  it('accepts independently enabled token and cost limits', () => {
    expect(getBudgetPolicyIssues({ scope: 'global', period: 'month', tokenLimit: 1_000 })).toEqual(
      []
    );
    expect(getBudgetPolicyIssues({ scope: 'global', period: 'month', costLimitUsd: 25 })).toEqual(
      []
    );
  });

  it('requires ordered global thresholds at or below 100', () => {
    expect(getThresholdIssues({ warningPercent: 95, criticalPercent: 90 })).toHaveLength(1);
    expect(getThresholdIssues({ warningPercent: 80, criticalPercent: 100 })).toEqual([]);
  });

  it('validates model pricing identifiers, aliases, and non-negative rates', () => {
    expect(
      getPricingOverrideIssues({
        modelId: ' ',
        aliases: ['gpt-test', ' GPT-TEST '],
        inputUsdPerMillion: -1,
        cachedInputUsdPerMillion: 0,
        outputUsdPerMillion: Number.NaN,
      })
    ).toEqual([
      { field: 'modelId', message: 'Model ID is required.' },
      { field: 'aliases', message: 'Model aliases must be unique.' },
      { field: 'inputUsdPerMillion', message: 'Input price must be 0 or greater.' },
      { field: 'outputUsdPerMillion', message: 'Output price must be 0 or greater.' },
    ]);
  });
});
