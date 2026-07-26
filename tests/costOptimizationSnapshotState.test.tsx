import { describe, expect, it } from 'vitest';
import {
  createCostOptimizationSnapshotState,
  reduceCostOptimizationSnapshotState,
  shouldApplyCostOptimizationPush,
} from '../src/renderer/utils/costOptimizationSnapshotState';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';

const WEEK_SNAPSHOT = {
  ...SNAPSHOT,
  query: { period: 'week' as const },
};
const MONTH_SNAPSHOT = {
  ...SNAPSHOT,
  query: { period: 'month' as const },
};

describe('cost optimization snapshot state', () => {
  it('ignores an older response after a newer query starts', () => {
    const initial = createCostOptimizationSnapshotState();
    const firstRequest = reduceCostOptimizationSnapshotState(initial, {
      type: 'request-started',
      requestId: 1,
    });
    const secondRequest = reduceCostOptimizationSnapshotState(firstRequest, {
      type: 'request-started',
      requestId: 2,
    });
    const staleResponse = reduceCostOptimizationSnapshotState(secondRequest, {
      type: 'request-succeeded',
      requestId: 1,
      snapshot: WEEK_SNAPSHOT,
    });
    const currentResponse = reduceCostOptimizationSnapshotState(staleResponse, {
      type: 'request-succeeded',
      requestId: 2,
      snapshot: MONTH_SNAPSHOT,
    });

    expect(staleResponse.snapshot).toBeNull();
    expect(currentResponse.snapshot).toBe(MONTH_SNAPSHOT);
    expect(currentResponse.loading).toBe(false);
  });

  it('ignores an older failure after a newer request succeeds', () => {
    const initial = createCostOptimizationSnapshotState();
    const firstRequest = reduceCostOptimizationSnapshotState(initial, {
      type: 'request-started',
      requestId: 1,
    });
    const secondRequest = reduceCostOptimizationSnapshotState(firstRequest, {
      type: 'request-started',
      requestId: 2,
    });
    const currentResponse = reduceCostOptimizationSnapshotState(secondRequest, {
      type: 'request-succeeded',
      requestId: 2,
      snapshot: MONTH_SNAPSHOT,
    });
    const staleFailure = reduceCostOptimizationSnapshotState(currentResponse, {
      type: 'request-failed',
      requestId: 1,
      message: 'older request failed',
    });

    expect(staleFailure).toBe(currentResponse);
  });

  it('applies pushed snapshots only to the active query', () => {
    expect(
      shouldApplyCostOptimizationPush(
        { period: 'month', projectPath: 'C:\\repo' },
        { period: 'month', projectPath: 'C:\\repo' }
      )
    ).toBe(true);
    expect(
      shouldApplyCostOptimizationPush(
        { period: 'month', projectPath: 'C:\\repo' },
        { period: 'month', projectPath: 'C:\\other' }
      )
    ).toBe(false);
  });
});
