import { describe, expect, it } from 'vitest';
import {
  createCostOptimizationSettingsForm,
  getCostOptimizationSettingsFormIssues,
  updateCostOptimizationSettingsForm,
} from '../src/renderer/utils/costOptimizationSettingsForm';
import { DEFAULT_COST_OPTIMIZATION_SETTINGS } from '../src/shared/costOptimizationValidation';

describe('cost optimization settings form', () => {
  it('maps invalid string fields to structured issues without mutating settings', () => {
    const initial = createCostOptimizationSettingsForm(DEFAULT_COST_OPTIMIZATION_SETTINGS);
    const changed = updateCostOptimizationSettingsForm(initial, 'anomalyHistoryWindow', '6');

    expect(getCostOptimizationSettingsFormIssues(changed, ['gpt-test'])).toContainEqual({
      field: 'anomalyHistoryWindow',
      code: 'history-window-range',
    });
    expect(initial.anomalyHistoryWindow).toBe('28');
  });

  it('toggles candidate models without duplicating them', () => {
    const initial = createCostOptimizationSettingsForm(DEFAULT_COST_OPTIMIZATION_SETTINGS);
    const selected = updateCostOptimizationSettingsForm(initial, 'candidateModelIds', 'gpt-test');
    const cleared = updateCostOptimizationSettingsForm(selected, 'candidateModelIds', 'gpt-test');

    expect(selected.candidateModelIds).toEqual(['gpt-test']);
    expect(cleared.candidateModelIds).toEqual([]);
  });
});
