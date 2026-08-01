/**
 * @file 会话诊断详情 Hook
 * @description 按当前查询与稳定诊断 ID 加载详情，并以快照更新作为重新验证信号。
 */

import { useEffect, useReducer, useRef } from 'react';
import type {
  CostOptimizationQuery,
  CostOptimizationSnapshot,
} from '../../shared/costOptimizationTypes';
import {
  createSessionDiagnosisDetailState,
  reduceSessionDiagnosisDetailState,
  type SessionDiagnosisDetailModel,
} from '../utils/sessionDiagnosisDetailState';

export const useSessionDiagnosisDetail = (
  query: CostOptimizationQuery,
  diagnosisId: string | null,
  snapshot: CostOptimizationSnapshot | undefined
): SessionDiagnosisDetailModel => {
  const [state, dispatch] = useReducer(
    reduceSessionDiagnosisDetailState,
    undefined,
    createSessionDiagnosisDetailState
  );
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (diagnosisId === null || snapshot === undefined) {
      dispatch({ type: 'reset' });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    dispatch({ type: 'request-started', requestId, diagnosisId });
    void window.codexUsage.costOptimization
      .getSessionDiagnosis({
        query: {
          period: query.period,
          ...(query.projectPath ? { projectPath: query.projectPath } : {}),
        },
        diagnosisId,
      })
      .then((result) => {
        dispatch({ type: 'request-succeeded', requestId, result });
      })
      .catch((error: unknown) => {
        dispatch({
          type: 'request-failed',
          requestId,
          diagnosisId,
          message: error instanceof Error ? error.message : '',
        });
      });
  }, [diagnosisId, query.period, query.projectPath, snapshot]);

  return state.model;
};
