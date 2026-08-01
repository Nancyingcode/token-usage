/**
 * @file 会话诊断详情状态测试
 * @description 验证详情请求竞态、刷新保留和类型化消失状态。
 */
import { describe, expect, it } from 'vitest';
import {
  createSessionDiagnosisDetailState,
  reduceSessionDiagnosisDetailState,
} from '../src/renderer/utils/sessionDiagnosisDetailState';
import { makeReadyDiagnosisResult } from './helpers/sessionDiagnosisFixtures';

describe('session diagnosis detail state', () => {
  it('ignores an older detail response after a newer diagnosis starts', () => {
    const first = reduceSessionDiagnosisDetailState(createSessionDiagnosisDetailState(), {
      type: 'request-started',
      requestId: 1,
      diagnosisId: 'first',
    });
    const second = reduceSessionDiagnosisDetailState(first, {
      type: 'request-started',
      requestId: 2,
      diagnosisId: 'second',
    });
    const stale = reduceSessionDiagnosisDetailState(second, {
      type: 'request-succeeded',
      requestId: 1,
      result: makeReadyDiagnosisResult('first'),
    });

    expect(stale).toBe(second);
  });

  it('retains the last ready detail when refreshing the same diagnosis fails', () => {
    const started = reduceSessionDiagnosisDetailState(createSessionDiagnosisDetailState(), {
      type: 'request-started',
      requestId: 1,
      diagnosisId: 'same',
    });
    const ready = reduceSessionDiagnosisDetailState(started, {
      type: 'request-succeeded',
      requestId: 1,
      result: makeReadyDiagnosisResult('same'),
    });
    const refreshing = reduceSessionDiagnosisDetailState(ready, {
      type: 'request-started',
      requestId: 2,
      diagnosisId: 'same',
    });
    const retained = reduceSessionDiagnosisDetailState(refreshing, {
      type: 'request-failed',
      requestId: 2,
      diagnosisId: 'same',
      message: 'refresh failed',
    });

    expect(retained.model).toMatchObject({
      kind: 'ready',
      diagnosisId: 'same',
      isRefreshing: false,
      staleReason: 'refresh failed',
    });
  });

  it('represents a disappeared diagnosis without fabricating detail', () => {
    const started = reduceSessionDiagnosisDetailState(createSessionDiagnosisDetailState(), {
      type: 'request-started',
      requestId: 1,
      diagnosisId: 'gone',
    });
    const result = reduceSessionDiagnosisDetailState(started, {
      type: 'request-succeeded',
      requestId: 1,
      result: { kind: 'not-found', diagnosisId: 'gone' },
    });

    expect(result.model).toEqual({ kind: 'not-found', diagnosisId: 'gone' });
  });
});
