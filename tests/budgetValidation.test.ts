import { describe, expect, it } from 'vitest';
import {
  getBudgetPolicyIssues,
  getPricingOverrideIssues,
  getThresholdIssues,
} from '../src/shared/budgetValidation';

describe('budget validation', () => {
  it('requires a project path and at least one positive limit', () => {
    expect(
      getBudgetPolicyIssues({
        scope: 'project',
        period: 'day',
        modelTarget: { kind: 'all' },
        tokenLimit: 0,
      })
    ).toEqual([
      { field: 'projectPath', code: 'project-required' },
      { field: 'tokenLimit', code: 'token-limit-positive' },
      { field: 'limits', code: 'budget-limit-required' },
    ]);
  });

  it('accepts independently enabled token and cost limits', () => {
    expect(
      getBudgetPolicyIssues({
        scope: 'global',
        period: 'month',
        modelTarget: { kind: 'all' },
        tokenLimit: 1_000,
      })
    ).toEqual([]);
    expect(
      getBudgetPolicyIssues({
        scope: 'global',
        period: 'month',
        modelTarget: { kind: 'all' },
        costLimitUsd: 25,
      })
    ).toEqual([]);
  });

  it('requires a non-empty ID only for concrete model targets', () => {
    expect(
      getBudgetPolicyIssues({
        scope: 'global',
        period: 'day',
        modelTarget: { kind: 'model', modelId: '  ' },
        tokenLimit: 100,
      })
    ).toContainEqual({ field: 'modelId', code: 'model-id-required' });

    expect(
      getBudgetPolicyIssues({
        scope: 'global',
        period: 'day',
        modelTarget: { kind: 'unknown' },
        tokenLimit: 100,
      })
    ).toEqual([]);
  });

  it('requires ordered global thresholds at or below 100', () => {
    expect(getThresholdIssues({ warningPercent: 95, criticalPercent: 90 })).toHaveLength(1);
    expect(getThresholdIssues({ warningPercent: 95, criticalPercent: 90 })[0].code).toBe(
      'thresholds-invalid'
    );
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
      { field: 'modelId', code: 'model-id-required' },
      { field: 'aliases', code: 'aliases-unique' },
      {
        field: 'inputUsdPerMillion',
        code: 'input-price-non-negative',
      },
      {
        field: 'outputUsdPerMillion',
        code: 'output-price-non-negative',
      },
    ]);
  });
});
