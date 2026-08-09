import React from 'react';
import { describe, expect, it } from 'vitest';
import PerformanceView from '../src/renderer/components/PerformanceView';
import type { ModelPricingEntry } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession } from '../src/shared/usageTypes';
import { renderWithI18n } from './helpers/renderWithI18n';

const makeSession = (warningCount: number): UsageSession => ({
  sessionId: `session-${warningCount}`,
  startedAt: '2026-07-16T00:00:00.000Z',
  endedAt: '2026-07-16T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  turnOutcomes: [],
  inputTokens: 10,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 10,
  eventCount: 1,
  sourceFile: `session-${warningCount}.jsonl`,
  warnings: Array.from({ length: warningCount }, () => ({
    code: 'malformed-jsonl' as const,
  })),
});

const makeHourlySession = (hour: number, totalTokens: number): UsageSession => {
  const occurredAt = new Date(2026, 7, 4, hour).toISOString();

  return {
    ...makeSession(0),
    sessionId: `hour-${hour}`,
    startedAt: occurredAt,
    endedAt: occurredAt,
    usageSlices: [
      {
        occurredAt,
        inputTokens: totalTokens,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens,
      },
    ],
    inputTokens: totalTokens,
    totalTokens,
    sourceFile: `hour-${hour}.jsonl`,
  };
};

describe('PerformanceView', () => {
  it('keeps scan warnings separate from turn errors', () => {
    const summary = buildUsageSummary([makeSession(3), makeSession(1)]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('No assessable turn outcomes');
    expect(markup).not.toContain('0.00% (0/2)');
    expect(markup).toContain('Pricing incomplete');
    expect(markup).toContain('class="page-header"');
    expect(markup).toContain('class="page-stack"');
    expect(markup).toContain('performance-card-grid');
  });

  it('renders real completed, failed, and interrupted turn details', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        sessionId: 'turn-outcomes',
        threadName: 'Turn outcome details',
        turnOutcomes: [
          {
            occurredAt: '2026-08-09T10:00:00.000Z',
            status: 'completed',
          },
          {
            occurredAt: '2026-08-09T11:00:00.000Z',
            status: 'failed',
            error: {
              code: 'response_stream_disconnected',
              message: 'Stream disconnected.',
            },
          },
          {
            occurredAt: '2026-08-09T12:00:00.000Z',
            status: 'interrupted',
            interruptReason: 'interrupted',
          },
        ],
      },
    ]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('error-rate-card');
    expect(markup).toContain('Turn Error Rate');
    expect(markup).toContain('50%');
    expect(markup).toContain('Completed turns');
    expect(markup).toContain('Failed turns');
    expect(markup).toContain('Interrupted turns');
    expect(markup).toContain('Stream disconnected.');
    expect(markup).not.toContain('class="donut"');
  });

  it('renders performance metrics in Chinese', () => {
    const summary = buildUsageSummary([makeSession(0)]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />, 'zh-CN');

    expect(markup).toContain('缓存命中率');
    expect(markup).toContain('费用效率');
    expect(markup).toContain('错误率');
  });

  it('renders the detailed cache efficiency card instead of a total-token mini line', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        inputTokens: 100,
        cachedInputTokens: 60,
        totalTokens: 100,
      },
    ]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('cache-efficiency-card');
    expect(markup).toContain('Cached input');
    expect(markup).toContain('Uncached input');
    expect(markup).toContain('Total input');
    expect(markup).toContain('data-cache-percentage="60"');
  });

  it('renders detailed cost efficiency instead of a total-token mini line', () => {
    const summary = buildUsageSummary([makeSession(0)]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup).toContain('cost-efficiency-card');
    expect(markup).toContain('Daily cost trend');
    expect(markup).not.toContain('class="mini-line blue"');
  });

  it('renders a detailed 24-hour activity distribution and peak summary', () => {
    const summary = buildUsageSummary([makeHourlySession(14, 300), makeHourlySession(8, 100)]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />);

    expect(markup.match(/data-hour-bar=/g)).toHaveLength(24);
    expect(markup).not.toContain('vertical-token-bar');
    expect(markup).toContain('14:00–15:00');
    expect(markup).toContain('300 tokens');
    expect(markup).toContain('75%');
    expect(markup).toContain('1 session');
    expect(markup).toContain('1 active day');
    expect(markup).toContain('00:00');
    expect(markup).toContain('06:00');
    expect(markup).toContain('12:00');
    expect(markup).toContain('18:00');
    expect(markup).toContain('24:00');
  });

  it('does not invent a midnight peak when tokens cannot be assigned by hour', () => {
    const summary = buildUsageSummary([
      {
        ...makeSession(0),
        startedAt: 'invalid',
        endedAt: 'invalid',
        inputTokens: 90,
        totalTokens: 90,
      },
    ]);
    const markup = renderWithI18n(<PerformanceView summary={summary} pricing={PRICING} />, 'zh-CN');

    expect(markup).toContain('无法按小时分配用量');
    expect(markup).not.toContain('最活跃时间：00:00');
  });
});

const PRICING: ModelPricingEntry[] = [];
