/**
 * @file Error rate detail aggregation tests
 * @description Verifies turn outcome rates, coverage, categories, history, and immutability.
 */
import { describe, expect, it } from 'vitest';
import { buildErrorRateDetail } from '../src/renderer/utils/errorRateDetail';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageSession, UsageTurnOutcome } from '../src/shared/usageTypes';

describe('error rate detail', () => {
  it('calculates failed turns over assessed turns and excludes interruptions', () => {
    const summary = buildUsageSummary([
      makeSession('covered-a', [
        makeOutcome('completed', '2026-08-08T10:00:00.000Z'),
        makeOutcome('failed', '2026-08-08T11:00:00.000Z', {
          code: 'usage_limit_exceeded',
          message: 'Limit reached',
        }),
        makeOutcome('interrupted', '2026-08-08T12:00:00.000Z'),
      ]),
      makeSession('covered-b', [makeOutcome('completed', '2026-08-09T10:00:00.000Z')]),
      makeSession('uncovered', []),
    ]);

    const detail = buildErrorRateDetail(summary);

    expect(detail).toMatchObject({
      completedCount: 2,
      failedCount: 1,
      interruptedCount: 1,
      assessedCount: 3,
      errorRate: (1 / 3) * 100,
      coveredSessionCount: 2,
      totalSessionCount: 3,
    });
    expect(detail.days).toEqual([
      {
        date: '2026-08-08',
        completedCount: 1,
        failedCount: 1,
        interruptedCount: 1,
        errorRate: 50,
      },
      {
        date: '2026-08-09',
        completedCount: 1,
        failedCount: 0,
        interruptedCount: 0,
        errorRate: 0,
      },
    ]);
  });

  it('distinguishes unavailable error rate from a real zero rate', () => {
    const unavailable = buildErrorRateDetail(
      buildUsageSummary([
        makeSession('interrupted', [makeOutcome('interrupted', '2026-08-08T10:00:00.000Z')]),
      ])
    );
    const zero = buildErrorRateDetail(
      buildUsageSummary([
        makeSession('completed', [makeOutcome('completed', '2026-08-08T10:00:00.000Z')]),
      ])
    );

    expect(unavailable.errorRate).toBeNull();
    expect(unavailable.days[0].errorRate).toBeNull();
    expect(zero.errorRate).toBe(0);
    expect(zero.days[0].errorRate).toBe(0);
  });

  it('groups known errors, preserves unknown codes, and limits recent errors to five', () => {
    const codes = [
      'usage_limit_exceeded',
      'session_budget_exceeded',
      'http_connection_failed',
      'unauthorized',
      'sandbox_error',
      'future_error_kind',
    ];
    const session = makeSession(
      'categories',
      codes.map((code, index) =>
        makeOutcome('failed', `2026-08-0${index + 1}T10:00:00.000Z`, {
          code,
          message: `Failure ${index + 1}`,
        })
      ),
      { threadName: 'Category thread', projectName: 'category-project' }
    );

    const detail = buildErrorRateDetail(buildUsageSummary([session]));

    expect(detail.categories).toEqual([
      { category: 'usage-limit', count: 2, percentage: (2 / 6) * 100 },
      { category: 'authentication', count: 1, percentage: (1 / 6) * 100 },
      { category: 'network', count: 1, percentage: (1 / 6) * 100 },
      { category: 'sandbox', count: 1, percentage: (1 / 6) * 100 },
      { category: 'other', count: 1, percentage: (1 / 6) * 100 },
    ]);
    expect(detail.recentErrors).toHaveLength(5);
    expect(detail.recentErrors[0]).toMatchObject({
      occurredAt: '2026-08-06T10:00:00.000Z',
      sessionLabel: 'Category thread',
      projectName: 'category-project',
      category: 'other',
      rawCode: 'future_error_kind',
      message: 'Failure 6',
    });
    expect(detail.recentErrors.at(-1)?.occurredAt).toBe('2026-08-02T10:00:00.000Z');
  });

  it('keeps the latest thirty terminal dates without mutating the summary', () => {
    const turnOutcomes = Array.from({ length: 31 }, (_, index) => {
      const occurredAt = new Date(Date.UTC(2026, 6, index + 1, 12)).toISOString();
      return makeOutcome(index % 2 === 0 ? 'completed' : 'failed', occurredAt, {
        message: 'Alternating failure',
      });
    });
    const summary = buildUsageSummary([makeSession('history', turnOutcomes)]);
    const snapshot = structuredClone(summary);

    const detail = buildErrorRateDetail(summary);

    expect(detail.days).toHaveLength(30);
    expect(detail.days[0].date).toBe('2026-07-02');
    expect(detail.days.at(-1)?.date).toBe('2026-07-31');
    expect(summary).toEqual(snapshot);
  });
});

const makeOutcome = (
  status: UsageTurnOutcome['status'],
  occurredAt: string,
  error?: UsageTurnOutcome['error']
): UsageTurnOutcome => ({
  occurredAt,
  status,
  ...(status === 'interrupted' ? { interruptReason: 'interrupted' } : {}),
  ...(status === 'failed' && error ? { error } : {}),
});

const makeSession = (
  sessionId: string,
  turnOutcomes: UsageTurnOutcome[],
  overrides: Partial<UsageSession> = {}
): UsageSession => ({
  sessionId,
  startedAt: '2026-08-01T00:00:00.000Z',
  endedAt: '2026-08-10T00:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  turnOutcomes,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  eventCount: 0,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
  ...overrides,
});
