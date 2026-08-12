// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCostOptimizationSnapshot } from '../src/renderer/hooks/useCostOptimizationSnapshot';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';

const TOTAL_SNAPSHOT = { ...SNAPSHOT, query: { period: 'total' as const } };

describe('useCostOptimizationSnapshot', () => {
  const getSnapshot = vi.fn();
  const unsubscribe = vi.fn();
  const onUpdated = vi.fn(() => unsubscribe);

  beforeEach(() => {
    getSnapshot.mockReset().mockResolvedValue(TOTAL_SNAPSHOT);
    onUpdated.mockClear();
    unsubscribe.mockClear();
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        costOptimization: {
          getSnapshot,
          updateSettings: vi.fn(async () => TOTAL_SNAPSHOT),
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
});
