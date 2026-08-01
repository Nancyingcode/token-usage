/**
 * @file 会话诊断详情状态
 * @description 以请求编号隔离过期详情响应，并在同一会话刷新失败时保留最后成功结果。
 */

import type {
  SessionDiagnosisDetail,
  SessionDiagnosisDetailResult,
} from '../../shared/costOptimizationTypes';

export type SessionDiagnosisDetailModel =
  | { kind: 'idle' }
  | { kind: 'loading'; diagnosisId: string }
  | { kind: 'error'; diagnosisId: string; message: string }
  | { kind: 'not-found'; diagnosisId: string }
  | {
      kind: 'ready';
      diagnosisId: string;
      detail: SessionDiagnosisDetail;
      isRefreshing: boolean;
      staleReason?: string;
    };

export interface SessionDiagnosisDetailState {
  requestId: number;
  model: SessionDiagnosisDetailModel;
}

export type SessionDiagnosisDetailAction =
  | { type: 'reset' }
  | { type: 'request-started'; requestId: number; diagnosisId: string }
  | {
      type: 'request-succeeded';
      requestId: number;
      result: SessionDiagnosisDetailResult;
    }
  | {
      type: 'request-failed';
      requestId: number;
      diagnosisId: string;
      message: string;
    };

export const createSessionDiagnosisDetailState = (): SessionDiagnosisDetailState => ({
  requestId: 0,
  model: { kind: 'idle' },
});

export const reduceSessionDiagnosisDetailState = (
  state: SessionDiagnosisDetailState,
  action: SessionDiagnosisDetailAction
): SessionDiagnosisDetailState => {
  switch (action.type) {
    case 'reset':
      return createSessionDiagnosisDetailState();
    case 'request-started':
      return {
        requestId: action.requestId,
        model:
          state.model.kind === 'ready' && state.model.diagnosisId === action.diagnosisId
            ? { ...state.model, isRefreshing: true }
            : { kind: 'loading', diagnosisId: action.diagnosisId },
      };
    case 'request-succeeded':
      if (action.requestId !== state.requestId) {
        return state;
      }

      return action.result.kind === 'ready'
        ? {
            requestId: action.requestId,
            model: {
              kind: 'ready',
              diagnosisId: action.result.detail.summary.diagnosisId,
              detail: action.result.detail,
              isRefreshing: false,
            },
          }
        : {
            requestId: action.requestId,
            model: {
              kind: 'not-found',
              diagnosisId: action.result.diagnosisId,
            },
          };
    case 'request-failed':
      if (action.requestId !== state.requestId) {
        return state;
      }

      return {
        requestId: action.requestId,
        model:
          state.model.kind === 'ready' && state.model.diagnosisId === action.diagnosisId
            ? {
                ...state.model,
                isRefreshing: false,
                staleReason: action.message,
              }
            : {
                kind: 'error',
                diagnosisId: action.diagnosisId,
                message: action.message,
              },
      };
  }
};
