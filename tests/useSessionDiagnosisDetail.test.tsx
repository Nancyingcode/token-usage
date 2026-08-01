/**
 * @vitest-environment jsdom
 * @file 会话诊断详情 Hook 测试
 * @description 验证 IPC 普通对象错误可安全转换为用户可见状态。
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSessionDiagnosisDetail } from '../src/renderer/hooks/useSessionDiagnosisDetail';
import { SNAPSHOT } from './helpers/costOptimizationFixtures';

describe('useSessionDiagnosisDetail', () => {
  it('preserves the message from a plain-object IPC rejection', async () => {
    Object.defineProperty(window, 'codexUsage', {
      configurable: true,
      value: {
        costOptimization: {
          getSessionDiagnosis: vi.fn().mockRejectedValue({ message: 'IPC detail failed' }),
        },
      },
    });

    const { result } = renderHook(() =>
      useSessionDiagnosisDetail({ period: 'total' }, 'diagnosis-id', SNAPSHOT)
    );

    await waitFor(() =>
      expect(result.current).toEqual({
        kind: 'error',
        diagnosisId: 'diagnosis-id',
        message: 'IPC detail failed',
      })
    );
  });
});
