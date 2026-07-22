import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PerformanceView from '../src/renderer/components/PerformanceView';
import type { ModelPricingEntry } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';

const makeSession = (warningCount: number): UsageSession => ({
  sessionId: `session-${warningCount}`,
  startedAt: '2026-07-16T00:00:00.000Z',
  endedAt: '2026-07-16T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 10,
  eventCount: 1,
  sourceFile: `session-${warningCount}.jsonl`,
  warnings: Array.from({ length: warningCount }, () => ({ message: 'warning' })),
});

describe('PerformanceView', () => {
  it('keeps application error rate at zero when scan warnings exist', () => {
    const summary = buildUsageSummary([makeSession(3), makeSession(1)]);
    const markup = renderToStaticMarkup(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('0.00% (0/2)');
    expect(markup).not.toContain('stroke-dasharray="-');
    expect(markup).toContain('Pricing incomplete');
  });
});

const PRICING: ModelPricingEntry[] = [];
