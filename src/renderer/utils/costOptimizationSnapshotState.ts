/**
 * @file 成本优化快照状态
 * @description 以请求编号隔离过期响应，并提供推送快照的查询匹配规则。
 */
import type {
  CostOptimizationQuery,
  CostOptimizationSnapshot,
} from '../../shared/costOptimizationTypes';

export interface CostOptimizationSnapshotState {
  snapshot: CostOptimizationSnapshot | null;
  loading: boolean;
  error: string | null;
  activeRequestId: number;
}

export type CostOptimizationSnapshotAction =
  | { type: 'request-started'; requestId: number }
  | { type: 'request-succeeded'; requestId: number; snapshot: CostOptimizationSnapshot }
  | { type: 'request-failed'; requestId: number; message: string }
  | { type: 'snapshot-pushed'; snapshot: CostOptimizationSnapshot };

export const createCostOptimizationSnapshotState = (): CostOptimizationSnapshotState => ({
  snapshot: null,
  loading: true,
  error: null,
  activeRequestId: 0,
});

export const reduceCostOptimizationSnapshotState = (
  state: CostOptimizationSnapshotState,
  action: CostOptimizationSnapshotAction
): CostOptimizationSnapshotState => {
  switch (action.type) {
    case 'request-started':
      return {
        ...state,
        loading: true,
        error: null,
        activeRequestId: action.requestId,
      };
    case 'request-succeeded':
      return action.requestId === state.activeRequestId
        ? {
            ...state,
            snapshot: action.snapshot,
            loading: false,
            error: null,
          }
        : state;
    case 'request-failed':
      return action.requestId === state.activeRequestId
        ? {
            ...state,
            loading: false,
            error: action.message,
          }
        : state;
    case 'snapshot-pushed':
      return {
        ...state,
        snapshot: action.snapshot,
        loading: false,
        error: null,
      };
  }
};

export const shouldApplyCostOptimizationPush = (
  activeQuery: CostOptimizationQuery,
  pushedQuery: CostOptimizationQuery
): boolean =>
  activeQuery.period === pushedQuery.period && activeQuery.projectPath === pushedQuery.projectPath;
