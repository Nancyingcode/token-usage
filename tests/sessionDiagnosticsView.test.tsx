/**
 * @file 会话诊断工作区测试
 * @description 验证列表状态保留、详情降级和类型化消失会话返回路径。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import SessionDiagnosticsView from '../src/renderer/components/SessionDiagnosticsView';
import {
  makeDiagnosisSummaries,
  makeReadyDiagnosisResult,
} from './helpers/sessionDiagnosisFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('session diagnostics view', () => {
  it('keeps the filtered list mounted while a diagnosis detail is open', () => {
    const result = makeReadyDiagnosisResult();

    if (result.kind !== 'ready') {
      throw new Error('Expected a ready diagnosis fixture.');
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let markup: string;

    try {
      markup = renderWithI18n(
        <SessionDiagnosticsView
          summaries={makeDiagnosisSummaries()}
          diagnosisId="detail.jsonl\u001fdetail"
          diagnosisDetailModel={{
            kind: 'ready',
            diagnosisId: 'detail.jsonl\u001fdetail',
            detail: result.detail,
            isRefreshing: false,
            staleReason: 'refresh failed',
          }}
          onDiagnosisOpen={vi.fn()}
          onDiagnosisClose={vi.fn()}
        />
      );
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }

    expect(markup).toContain('data-diagnosis-view="list"');
    expect(markup).toContain('data-diagnosis-view="detail"');
    expect(markup).toContain('hidden=""');
    expect(markup).toContain('Session scope');
    expect(markup).toContain('Evidence timeline');
    expect(markup).toContain('Showing the last successful diagnosis. refresh failed');
  });

  it('renders a typed disappeared-session state with a route back to the list', () => {
    const markup = renderWithI18n(
      <SessionDiagnosticsView
        summaries={makeDiagnosisSummaries()}
        diagnosisId="gone"
        diagnosisDetailModel={{ kind: 'not-found', diagnosisId: 'gone' }}
        onDiagnosisOpen={vi.fn()}
        onDiagnosisClose={vi.fn()}
      />
    );

    expect(markup).toContain('This session is no longer in the current usage data.');
    expect(markup).toContain('Back to diagnosis list');
  });
});
