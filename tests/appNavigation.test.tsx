import { describe, expect, it } from 'vitest';
import {
  INITIAL_APP_NAVIGATION_STATE,
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
    });
  });

  it('clears a project when Sessions is selected directly', () => {
    const state: AppNavigationState = {
      activeView: 'tools',
      selectedProjectPath: 'C:\\work\\repo',
    };

    expect(reduceAppNavigationState(state, { type: 'select-view', view: 'sessions' })).toEqual({
      activeView: 'sessions',
      selectedProjectPath: null,
    });
  });

  it('preserves a project when another non-Sessions view is selected', () => {
    const state: AppNavigationState = {
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
    };

    expect(reduceAppNavigationState(state, { type: 'select-view', view: 'performance' })).toEqual({
      activeView: 'performance',
      selectedProjectPath: 'C:\\work\\repo',
    });
  });

  it('clears only the project filter when requested', () => {
    const state: AppNavigationState = {
      activeView: 'sessions',
      selectedProjectPath: 'C:\\work\\repo',
    };

    expect(reduceAppNavigationState(state, { type: 'clear-project' })).toEqual({
      activeView: 'sessions',
      selectedProjectPath: null,
    });
  });
});
