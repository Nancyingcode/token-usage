/**
 * @file 成本优化快照 Hook
 * @description 协调按周期和项目查询、设置更新及主进程推送，并忽略过期异步响应。
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  CostOptimizationQuery,
  CostOptimizationSettings,
  CostOptimizationSnapshot,
} from '../../shared/costOptimizationTypes';
import type { UsagePeriod } from '../../shared/usageTypes';
import {
  createCostOptimizationSnapshotState,
  reduceCostOptimizationSnapshotState,
  shouldApplyCostOptimizationPush,
} from '../utils/costOptimizationSnapshotState';

export interface UseCostOptimizationSnapshotResult {
  snapshot: CostOptimizationSnapshot | null;
  loading: boolean;
  error: string | null;
  projectPath: string | undefined;
  setProjectPath: (projectPath: string | undefined) => void;
  updateSettings: (settings: CostOptimizationSettings) => Promise<CostOptimizationSnapshot>;
}

const getErrorMessage = (error: unknown): string => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : String(error);
};

export const useCostOptimizationSnapshot = (
  period: UsagePeriod
): UseCostOptimizationSnapshotResult => {
  const [projectPath, setProjectPath] = useState<string | undefined>();
  const [state, dispatch] = useReducer(
    reduceCostOptimizationSnapshotState,
    undefined,
    createCostOptimizationSnapshotState
  );
  const nextRequestId = useRef(0);
  const query = useMemo<CostOptimizationQuery>(
    () => ({
      period,
      ...(projectPath ? { projectPath } : {}),
    }),
    [period, projectPath]
  );

  const requestSnapshot = useCallback(async (): Promise<CostOptimizationSnapshot> => {
    nextRequestId.current += 1;
    const requestId = nextRequestId.current;
    dispatch({ type: 'request-started', requestId });

    try {
      const snapshot = await window.codexUsage.costOptimization.getSnapshot(query);
      dispatch({ type: 'request-succeeded', requestId, snapshot });
      return snapshot;
    } catch (error) {
      dispatch({
        type: 'request-failed',
        requestId,
        message: getErrorMessage(error),
      });
      throw error;
    }
  }, [query]);

  useEffect(() => {
    void requestSnapshot().catch(() => undefined);
  }, [requestSnapshot]);

  useEffect(
    () =>
      window.codexUsage.costOptimization.onUpdated((snapshot) => {
        if (shouldApplyCostOptimizationPush(query, snapshot.query)) {
          dispatch({ type: 'snapshot-pushed', snapshot });
        }
      }),
    [query]
  );

  const updateSettings = useCallback(
    async (settings: CostOptimizationSettings): Promise<CostOptimizationSnapshot> => {
      const snapshot = await window.codexUsage.costOptimization.updateSettings(settings);

      if (shouldApplyCostOptimizationPush(query, snapshot.query)) {
        dispatch({ type: 'snapshot-pushed', snapshot });
      } else {
        await requestSnapshot();
      }

      return snapshot;
    },
    [query, requestSnapshot]
  );

  return {
    snapshot: state.snapshot,
    loading: state.loading,
    error: state.error,
    projectPath,
    setProjectPath,
    updateSettings,
  };
};
