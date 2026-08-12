import { describe, expect, it } from 'vitest';
import {
  INITIAL_APP_NAVIGATION_STATE,
  getViewTransitionKey,
  needsCostOptimization,
  needsUsageDataPath,
  reduceAppNavigationState,
  type AppNavigationState,
} from '../src/renderer/App';

describe('reduceAppNavigationState', () => {
  it('opens Sessions with the selected project identity', () => {
    expect(
      reduceAppNavigationState(INITIAL_APP_NAVIGATION_STATE, {
        type: 'select-project',
        projectPath: 'C:\\work\\repo',
      })
    ).toEqual({
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    });
  });

  it('clears a project when Sessions is selected directly', () => {
    const state: AppNavigationState = {
      activeView: 'tools',
      selectedProjectPath: 'C:\\work\\repo',
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    };

    expect(reduceAppNavigationState(state, { type: 'select-view', view: 'sessions' })).toEqual({
      activeView: 'sessions',
      selectedProjectPath: null,
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    });
  });

  it('preserves a project when another non-Sessions view is selected', () => {
    const state: AppNavigationState = {
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    };

    expect(reduceAppNavigationState(state, { type: 'select-view', view: 'performance' })).toEqual({
      activeView: 'performance',
      selectedProjectPath: 'C:\\work\\repo',
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    });
  });

  it('opens cost optimization without reusing the Sessions project as navigation state', () => {
    const state: AppNavigationState = {
      activeView: 'overview',
      selectedProjectPath: null,
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    };

    expect(
      reduceAppNavigationState(state, {
        type: 'select-view',
        view: 'costOptimization',
      })
    ).toEqual({
      activeView: 'costOptimization',
      selectedProjectPath: null,
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    });
  });

  it('clears only the project filter when requested', () => {
    const state: AppNavigationState = {
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    };

    expect(reduceAppNavigationState(state, { type: 'clear-project' })).toEqual({
      activeView: 'sessions',
      selectedProjectPath: null,
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'overview',
      diagnosisId: null,
    });
  });

  it('opens a diagnosis in the controlled cost optimization tab', () => {
    expect(
      reduceAppNavigationState(INITIAL_APP_NAVIGATION_STATE, {
        type: 'open-diagnosis',
        diagnosisId: 'source\u001fsession',
      })
    ).toEqual({
      activeView: 'costOptimization',
      selectedProjectPath: null,
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'diagnostics',
      diagnosisId: 'source\u001fsession',
    });
  });

  it('closes detail without leaving the diagnostics tab', () => {
    const state: AppNavigationState = {
      activeView: 'costOptimization',
      selectedProjectPath: null,
      activeBudgetTab: 'overview',
      activeCostOptimizationTab: 'diagnostics',
      diagnosisId: 'source\u001fsession',
    };

    expect(reduceAppNavigationState(state, { type: 'close-diagnosis' })).toMatchObject({
      activeView: 'costOptimization',
      activeCostOptimizationTab: 'diagnostics',
      diagnosisId: null,
    });
  });

  it('controls the budget workspace tab without changing the active page', () => {
    const state = reduceAppNavigationState(INITIAL_APP_NAVIGATION_STATE, {
      type: 'select-view',
      view: 'budgets',
    });

    expect(reduceAppNavigationState(state, { type: 'select-budget-tab', tab: 'pricing' })).toEqual({
      ...state,
      activeBudgetTab: 'pricing',
    });
  });

  it('opens a budget policy from notification navigation', () => {
    expect(
      reduceAppNavigationState(INITIAL_APP_NAVIGATION_STATE, { type: 'open-budget-policy' })
    ).toMatchObject({
      activeView: 'budgets',
      activeBudgetTab: 'policies',
    });
  });
});

describe('getViewTransitionKey', () => {
  const states = {
    usage: 'ready',
    budget: 'loading',
    costOptimization: 'error',
  };

  it('uses the data state owned by the active page', () => {
    expect(getViewTransitionKey('overview', states)).toBe('overview:ready');
    expect(getViewTransitionKey('budgets', states)).toBe('budgets:loading');
    expect(getViewTransitionKey('costOptimization', states)).toBe('costOptimization:error');
  });
});

describe('first-screen data dependencies', () => {
  it('loads cost optimization only for cost and session views', () => {
    expect(needsCostOptimization('overview')).toBe(false);
    expect(needsCostOptimization('sessions')).toBe(true);
    expect(needsCostOptimization('costOptimization')).toBe(true);
  });

  it('loads usage path settings only for Settings', () => {
    expect(needsUsageDataPath('overview')).toBe(false);
    expect(needsUsageDataPath('wrapped')).toBe(true);
  });
});
