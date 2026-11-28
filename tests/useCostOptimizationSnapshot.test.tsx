// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCostOptimizationSnapshot } from '../src/renderer/hooks/useCostOptimizationSnapshot';
import type {
  CostOptimizationQuery,
  CostOptimizationSnapshot,
} from '../src/shared/costOptimizationTypes';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';

const TOTAL_SNAPSHOT = { ...SNAPSHOT, query: { period: 'total' as const } };

describe('useCostOptimizationSnapshot', () => {
  const getSnapshot = vi.fn();
  const updateSettings = vi.fn();
  const unsubscribe = vi.fn();
  const onUpdated = vi.fn(() => unsubscribe);

  beforeEach(() => {
    getSnapshot.mockReset().mockResolvedValue(TOTAL_SNAPSHOT);
    updateSettings.mockReset().mockResolvedValue(TOTAL_SNAPSHOT);
    onUpdated.mockClear();
    unsubscribe.mockClear();
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        costOptimization: {
          getSnapshot,
          updateSettings,
          onUpdated,
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'codexUsage');
  });

  it('does not request or subscribe until enabled', async () => {
    const { rerender, result } = renderHook(
      ({ enabled }) => useCostOptimizationSnapshot('total', enabled),
      { initialProps: { enabled: false } }
    );

    expect(getSnapshot).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.snapshot).toEqual(TOTAL_SNAPSHOT));
    expect(getSnapshot).toHaveBeenCalledWith({ period: 'total' });
    expect(onUpdated).toHaveBeenCalledOnce();
  });

  it('keeps a loaded snapshot when temporarily disabled', async () => {
    const { rerender, result } = renderHook(
      ({ enabled }) => useCostOptimizationSnapshot('total', enabled),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.snapshot).toEqual(TOTAL_SNAPSHOT));

    rerender({ enabled: false });

    expect(result.current.snapshot).toEqual(TOTAL_SNAPSHOT);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not expose an old query error in any committed render of a new selection', async () => {
    const commits: Array<{ query: CostOptimizationQuery; error: string | null }> = [];
    const useTrackedSnapshot = () => {
      const result = useCostOptimizationSnapshot('total');
      useLayoutEffect(() => {
        commits.push({ query: result.query, error: result.error });
      }, [result.query, result.error]);
      return result;
    };
    getSnapshot.mockRejectedValueOnce(new Error('all projects failed'));
    const { result } = renderHook(useTrackedSnapshot);
    await waitFor(() => expect(result.current.error).toBe('all projects failed'));

    const projectPath = 'C:\\fixture\\next';
    getSnapshot.mockResolvedValueOnce({
      ...TOTAL_SNAPSHOT,
      query: { period: 'total', projectPath },
    });
    act(() => result.current.setProjectPath(projectPath));
    await waitFor(() => expect(result.current.snapshot?.query.projectPath).toBe(projectPath));
    expect(commits.filter(({ query }) => query.projectPath === projectPath)).toEqual([
      { query: { period: 'total', projectPath }, error: null },
    ]);
  });

  it('does not supersede a newly selected project when a save from another project completes', async () => {
    const projectA = { period: 'total' as const, projectPath: 'C:\\fixture\\a' };
    const projectB = { period: 'total' as const, projectPath: 'C:\\fixture\\b' };
    getSnapshot.mockImplementation(async (query: CostOptimizationQuery) => ({
      ...TOTAL_SNAPSHOT,
      query,
    }));
    let resolveSave: ((snapshot: CostOptimizationSnapshot) => void) | undefined;
    updateSettings.mockImplementation(
      () =>
        new Promise<CostOptimizationSnapshot>((resolve) => {
          resolveSave = resolve;
        })
    );
    const { result } = renderHook(() => useCostOptimizationSnapshot('total'));
    act(() => result.current.setProjectPath(projectA.projectPath));
    await waitFor(() => expect(result.current.snapshot?.query).toEqual(projectA));
    const saving = result.current.updateSettings(TOTAL_SNAPSHOT.settings);

    act(() => result.current.setProjectPath(projectB.projectPath));
    await waitFor(() => expect(result.current.snapshot?.query).toEqual(projectB));
    await act(async () => {
      expect(resolveSave).toBeDefined();
      resolveSave?.(TOTAL_SNAPSHOT);
      await saving;
    });
    expect(result.current.snapshot?.query).toEqual(projectB);
    expect(result.current.loading).toBe(false);
    expect(
      getSnapshot.mock.calls.filter(([query]) => query.projectPath === projectA.projectPath)
    ).toHaveLength(1);
  });
});
