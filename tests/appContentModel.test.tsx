import { describe, expect, it } from 'vitest';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageScanResult, UsageSession } from '../src/shared/usageTypes';
import {
  resolveAppContentModel,
  type ResolveAppContentModelInput,
} from '../src/renderer/utils/appContentModel';

const SESSION: UsageSession = {
  sessionId: 'session-1',
  startedAt: '2026-07-19T08:00:00.000Z',
  endedAt: '2026-07-19T08:10:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [],
  inputTokens: 10,
  cachedInputTokens: 2,
  outputTokens: 4,
  reasoningOutputTokens: 1,
  totalTokens: 15,
  eventCount: 1,
  sourceFile: 'session-1.jsonl',
  warnings: [],
};

const EMPTY_SUMMARY = buildUsageSummary([]);
const READY_SUMMARY = buildUsageSummary([SESSION]);

const makeResult = (summary = READY_SUMMARY): UsageScanResult => ({
  sessionsDir: 'C:\\Users\\tester\\.codex\\sessions',
  scannedAt: '2026-07-19T08:15:00.000Z',
  summary,
  warnings: [],
});

const makeInput = (
  overrides: Partial<ResolveAppContentModelInput> = {}
): ResolveAppContentModelInput => ({
  error: null,
  loading: false,
  result: makeResult(),
  filteredSummary: READY_SUMMARY,
  period: 'month',
  ...overrides,
});

describe('resolveAppContentModel', () => {
  it('returns an initial error before a scan result exists', () => {
    expect(
      resolveAppContentModel(
        makeInput({
          error: 'Scan failed',
          loading: false,
          result: null,
          filteredSummary: null,
        })
      )
    ).toEqual({ kind: 'error', message: 'Scan failed' });
  });

  it('returns loading only before a scan result exists', () => {
    expect(
      resolveAppContentModel(makeInput({ loading: true, result: null, filteredSummary: null }))
    ).toEqual({ kind: 'loading' });
  });

  it('returns idle before a scan result exists', () => {
    expect(resolveAppContentModel(makeInput({ result: null, filteredSummary: null }))).toEqual({
      kind: 'idle',
    });
  });

  it('returns empty when the complete scan has no sessions', () => {
    const result = makeResult(EMPTY_SUMMARY);
    const model = resolveAppContentModel(makeInput({ result, filteredSummary: EMPTY_SUMMARY }));

    expect(model).toEqual({
      kind: 'empty',
      result,
      freshness: { refreshing: false, staleReason: null },
    });
  });

  it('returns period-empty when only the filtered summary is empty', () => {
    const result = makeResult();

    expect(
      resolveAppContentModel(makeInput({ result, filteredSummary: EMPTY_SUMMARY, period: 'week' }))
    ).toEqual({
      kind: 'period-empty',
      period: 'week',
      result,
      freshness: { refreshing: false, staleReason: null },
    });
  });

  it('does not classify Total as a rolling-period empty state', () => {
    const model = resolveAppContentModel(
      makeInput({ filteredSummary: EMPTY_SUMMARY, period: 'total' })
    );

    expect(model.kind).toBe('ready');
  });

  it('returns ready with the result and filtered summary', () => {
    const result = makeResult();
    const model = resolveAppContentModel(makeInput({ result }));

    expect(model).toEqual({
      kind: 'ready',
      result,
      summary: READY_SUMMARY,
      freshness: { refreshing: false, staleReason: null },
    });
  });

  it('keeps the last successful result when a later refresh fails', () => {
    const result = makeResult();

    expect(
      resolveAppContentModel(
        makeInput({ result, filteredSummary: READY_SUMMARY, error: 'Disk unavailable' })
      )
    ).toMatchObject({
      kind: 'ready',
      result,
      freshness: { refreshing: false, staleReason: 'Disk unavailable' },
    });
  });

  it('keeps content visible during a background refresh', () => {
    expect(
      resolveAppContentModel(makeInput({ loading: true, result: makeResult() }))
    ).toMatchObject({
      kind: 'ready',
      freshness: { refreshing: true, staleReason: null },
    });
  });
});
