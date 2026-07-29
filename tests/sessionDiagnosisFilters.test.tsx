/**
 * @file 会话诊断筛选测试
 * @description 验证诊断摘要的组合筛选、不可变排序和稳定次序。
 */
import { describe, expect, it } from 'vitest';
import { filterSessionDiagnosisSummaries } from '../src/renderer/utils/sessionDiagnosisFilters';
import {
  makeDiagnosisSummaries,
  makeDiagnosisSummary,
  makeFindingSummary,
} from './helpers/sessionDiagnosisFixtures';

describe('session diagnosis filters', () => {
  it('filters attention, cause, severity and confidence together', () => {
    const summaries = [
      makeDiagnosisSummary('critical-input', {
        requiresAttention: true,
        primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
      }),
      makeDiagnosisSummary('warning-cache', {
        requiresAttention: true,
        primaryFinding: makeFindingSummary('cache-degradation', 'warning', 'medium'),
      }),
      makeDiagnosisSummary('normal', {
        requiresAttention: false,
      }),
    ];

    expect(
      filterSessionDiagnosisSummaries({
        summaries,
        scope: 'attention',
        cause: 'input-growth',
        severity: 'critical',
        confidence: 'high',
      }).map(({ sessionId }) => sessionId)
    ).toEqual(['critical-input']);
  });

  it('keeps all sessions available in all scope', () => {
    expect(
      filterSessionDiagnosisSummaries({
        summaries: makeDiagnosisSummaries(),
        scope: 'all',
        cause: 'all',
        severity: 'all',
        confidence: 'all',
      })
    ).toHaveLength(makeDiagnosisSummaries().length);
  });

  it('sorts by attention, severity, impact, newest start and stable id', () => {
    const summaries = [
      makeDiagnosisSummary('normal', {
        requiresAttention: false,
        primaryFinding: undefined,
        impactPercentile: 1,
      }),
      makeDiagnosisSummary('warning', {
        primaryFinding: makeFindingSummary('cache-degradation', 'warning', 'medium'),
        impactPercentile: 1,
      }),
      makeDiagnosisSummary('critical-old', {
        diagnosisId: 'b',
        primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
        impactPercentile: 0.9,
        startedAt: '2026-07-23T10:00:00.000Z',
      }),
      makeDiagnosisSummary('critical-new-b', {
        diagnosisId: 'd',
        primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
        impactPercentile: 0.9,
        startedAt: '2026-07-24T10:00:00.000Z',
      }),
      makeDiagnosisSummary('critical-new-a', {
        diagnosisId: 'c',
        primaryFinding: makeFindingSummary('input-growth', 'critical', 'high'),
        impactPercentile: 0.9,
        startedAt: '2026-07-24T10:00:00.000Z',
      }),
    ];

    expect(
      filterSessionDiagnosisSummaries({
        summaries,
        scope: 'all',
        cause: 'all',
        severity: 'all',
        confidence: 'all',
      }).map(({ sessionId }) => sessionId)
    ).toEqual(['critical-new-a', 'critical-new-b', 'critical-old', 'warning', 'normal']);
  });
});
