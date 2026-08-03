import { describe, expect, it } from 'vitest';
import {
  budgetFormReducer,
  createBudgetFormState,
  toBudgetPolicyInput,
} from '../src/renderer/utils/budgetForm';

describe('budget form', () => {
  it('creates a project cost-only policy input', () => {
    const projectScope = budgetFormReducer(createBudgetFormState(), {
      type: 'scope-changed',
      scope: 'project',
    });
    const withProject = budgetFormReducer(projectScope, {
      type: 'project-changed',
      projectPath: 'C:\\repo',
    });
    const costEnabled = budgetFormReducer(withProject, { type: 'cost-enabled', enabled: true });
    const complete = budgetFormReducer(costEnabled, {
      type: 'cost-limit-changed',
      value: '25.50',
    });

    expect(toBudgetPolicyInput(complete)).toEqual({
      scope: 'project',
      projectPath: 'C:\\repo',
      period: 'month',
      modelTarget: { kind: 'all' },
      costLimitUsd: 25.5,
    });
  });

  it('defaults new budgets to all models', () => {
    expect(createBudgetFormState().modelTarget).toEqual({ kind: 'all' });
  });

  it('hydrates enabled limits when editing an existing policy', () => {
    const state = createBudgetFormState({
      id: 'policy-1',
      scope: 'global',
      period: 'week',
      modelTarget: { kind: 'all' },
      tokenLimit: 5_000,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });

    expect(state).toEqual(
      expect.objectContaining({
        id: 'policy-1',
        period: 'week',
        tokenEnabled: true,
        tokenLimit: '5000',
        costEnabled: false,
      })
    );
  });

  it('clears project path when switching back to global scope', () => {
    const state = {
      ...createBudgetFormState(),
      scope: 'project' as const,
      projectPath: 'C:\\repo',
    };

    expect(budgetFormReducer(state, { type: 'scope-changed', scope: 'global' }).projectPath).toBe(
      ''
    );
  });
});
