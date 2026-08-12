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
import { getErrorMessage } from '../utils/errorMessage';
import {
  createCostOptimizationSnapshotState,
  reduceCostOptimizationSnapshotState,
  resolveGlobalDiagnosisQuery,
  shouldApplyCostOptimizationPush,
  shouldRequestSeparateGlobalSnapshot,
} from '../utils/costOptimizationSnapshotState';

export interface UseCostOptimizationSnapshotResult {
  snapshot: CostOptimizationSnapshot | null;
  globalSnapshot: CostOptimizationSnapshot | null;
  query: CostOptimizationQuery;
  loading: boolean;
  error: string | null;
  projectPath: string | undefined;
  setProjectPath: (projectPath: string | undefined) => void;
  updateSettings: (settings: CostOptimizationSettings) => Promise<CostOptimizationSnapshot>;
}

export const useCostOptimizationSnapshot = (
  period: UsagePeriod,
  enabled = true
): UseCostOptimizationSnapshotResult => {
  const [projectPath, setProjectPath] = useState<string | undefined>();
  const [state, dispatch] = useReducer(
    reduceCostOptimizationSnapshotState,
    undefined,
    createCostOptimizationSnapshotState
  );
  const [globalState, dispatchGlobal] = useReducer(
    reduceCostOptimizationSnapshotState,
    undefined,
    createCostOptimizationSnapshotState
  );
  const nextRequestId = useRef(0);
  const nextGlobalRequestId = useRef(0);
  const query = useMemo<CostOptimizationQuery>(
    () => ({
      period,
      ...(projectPath ? { projectPath } : {}),
    }),
    [period, projectPath]
  );
  const globalQuery = useMemo<CostOptimizationQuery>(
    () => resolveGlobalDiagnosisQuery({ period }),
    [period]
  );
  const requestsSeparateGlobalSnapshot = shouldRequestSeparateGlobalSnapshot(query);

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

  const requestGlobalSnapshot = useCallback(async (): Promise<CostOptimizationSnapshot> => {
    nextGlobalRequestId.current += 1;
    const requestId = nextGlobalRequestId.current;
    dispatchGlobal({ type: 'request-started', requestId });

    try {
      const snapshot = await window.codexUsage.costOptimization.getSnapshot(globalQuery);
      dispatchGlobal({ type: 'request-succeeded', requestId, snapshot });
      return snapshot;
    } catch (error) {
      dispatchGlobal({
        type: 'request-failed',
        requestId,
        message: getErrorMessage(error),
      });
      throw error;
    }
  }, [globalQuery]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void requestSnapshot().catch(() => undefined);
  }, [enabled, requestSnapshot]);

  useEffect(() => {
    if (!enabled || !requestsSeparateGlobalSnapshot) {
      return;
    }

    void requestGlobalSnapshot().catch(() => undefined);
  }, [enabled, requestGlobalSnapshot, requestsSeparateGlobalSnapshot]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return window.codexUsage.costOptimization.onUpdated((snapshot) => {
      if (shouldApplyCostOptimizationPush(query, snapshot.query)) {
        dispatch({ type: 'snapshot-pushed', snapshot });
      }
      if (
        requestsSeparateGlobalSnapshot &&
        shouldApplyCostOptimizationPush(globalQuery, snapshot.query)
      ) {
        dispatchGlobal({ type: 'snapshot-pushed', snapshot });
      }
    });
  }, [enabled, globalQuery, query, requestsSeparateGlobalSnapshot]);

  const updateSettings = useCallback(
    async (settings: CostOptimizationSettings): Promise<CostOptimizationSnapshot> => {
      const snapshot = await window.codexUsage.costOptimization.updateSettings(settings);
      const refreshes: Promise<CostOptimizationSnapshot>[] = [];

      if (shouldApplyCostOptimizationPush(query, snapshot.query)) {
        dispatch({ type: 'snapshot-pushed', snapshot });
      } else {
        refreshes.push(requestSnapshot());
      }

      if (requestsSeparateGlobalSnapshot) {
        if (shouldApplyCostOptimizationPush(globalQuery, snapshot.query)) {
          dispatchGlobal({ type: 'snapshot-pushed', snapshot });
        } else {
          refreshes.push(requestGlobalSnapshot());
        }
      }

      await Promise.all(refreshes);

      return snapshot;
    },
    [globalQuery, query, requestGlobalSnapshot, requestSnapshot, requestsSeparateGlobalSnapshot]
  );

  const matchingGlobalSnapshot = globalState.snapshot
    ? shouldApplyCostOptimizationPush(globalQuery, globalState.snapshot.query)
      ? globalState.snapshot
      : null
    : null;
  const matchingCurrentSnapshot = state.snapshot
    ? shouldApplyCostOptimizationPush(query, state.snapshot.query)
      ? state.snapshot
      : null
    : null;

  return {
    snapshot: matchingCurrentSnapshot,
    globalSnapshot: requestsSeparateGlobalSnapshot
      ? matchingGlobalSnapshot
      : matchingCurrentSnapshot,
    query,
    loading: state.loading,
    error: state.error,
    projectPath,
    setProjectPath,
    updateSettings,
  };
};
