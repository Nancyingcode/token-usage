/**
 * @file 会话诊断详情测试
 * @description 验证原因优先顺序、检测器降级状态和不完整定价表达。
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type {
  SessionDiagnosisDetail,
  SessionDetectorResult,
} from '../src/shared/costOptimizationTypes';
import SessionDiagnosisDetailView from '../src/renderer/components/SessionDiagnosisDetail';
import {
  makeDiagnosisDetail,
  makePartiallyPricedDiagnosisSummary,
} from './helpers/sessionDiagnosisFixtures';
import { renderWithI18n } from './helpers/renderWithI18n';

describe('session diagnosis detail', () => {
  it('renders the primary reason before timeline and all detector states', () => {
    const markup = renderWithI18n(
      <SessionDiagnosisDetailView detail={makeDiagnosisDetail()} onBack={vi.fn()} />
    );

    expect(markup.indexOf('Primary cause')).toBeLessThan(markup.indexOf('Evidence timeline'));
    expect(markup).toContain('Input footprint growth');
    expect(markup).toContain('Not detected');
    expect(markup).toContain('Insufficient data');
    expect(markup).toContain('Not applicable');
    expect(markup).toContain('Back to diagnosis list');
  });

  it('renders unresolved and partial-pricing evidence without a full-cost claim', () => {
    const detail = makeDiagnosisDetail();
    const detectors: SessionDetectorResult[] = detail.detectors.map((result) =>
      result.state === 'finding'
        ? {
            state: 'insufficient-data',
            cause: result.cause,
            reason: 'insufficient-history',
          }
        : result
    );
    const unresolved: SessionDiagnosisDetail = {
      ...detail,
      summary: {
        ...makePartiallyPricedDiagnosisSummary(),
        primaryFinding: undefined,
      },
      detectors,
    };
    const markup = renderWithI18n(
      <SessionDiagnosisDetailView detail={unresolved} onBack={vi.fn()} />
    );

    expect(markup).toContain('Could not identify a cause from available metadata');
    expect(markup).toContain('unknown-model');
    expect(markup).toContain('Priced cost');
    expect(markup).not.toContain('Full estimated cost');
  });

  it('renders baseline samples, omitted points and Chinese state copy', () => {
    const detail = makeDiagnosisDetail();
    const primary = detail.detectors[0];

    if (primary.state !== 'finding') {
      throw new Error('Expected a finding fixture.');
    }

    const markup = renderWithI18n(
      <SessionDiagnosisDetailView
        detail={{
          ...detail,
          invalidTimelinePointCount: 1,
          detectors: [
            {
              ...primary,
              baseline: {
                scope: 'project-model',
                sampleCount: 7,
                median: 1,
                mad: 0,
                score: 8,
              },
            },
            ...detail.detectors.slice(1),
          ],
        }}
        onBack={vi.fn()}
      />,
      'zh-CN'
    );

    expect(markup).toContain('7');
    expect(markup).toContain('1');
    expect(markup).toContain('数据不足');
  });

  it('shows the model-cost disclaimer only when a model-cost finding exists', () => {
    const detail = makeDiagnosisDetail();
    const modelFinding: SessionDetectorResult = {
      state: 'finding',
      cause: 'model-cost-dominance',
      severity: 'warning',
      confidence: 'medium',
      normalizedScore: 0.5,
      evidence: {
        kind: 'model-cost',
        modelId: 'gpt-expensive',
        costShare: 0.82,
        unitCostRatio: 2.4,
      },
    };
    const markup = renderWithI18n(
      <SessionDiagnosisDetailView
        detail={{
          ...detail,
          detectors: detail.detectors.map((result) =>
            result.cause === 'model-cost-dominance' ? modelFinding : result
          ),
        }}
        onBack={vi.fn()}
      />
    );

    expect(markup).toContain(
      'Cost composition does not imply equivalent model quality, speed, or capability.'
    );
  });
});
