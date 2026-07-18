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
  it('prioritizes an error over loading', () => {
    expect(resolveAppContentModel(makeInput({ error: 'Scan failed', loading: true }))).toEqual({
      kind: 'error',
      message: 'Scan failed',
    });
  });

  it('returns loading when no error exists', () => {
    expect(resolveAppContentModel(makeInput({ loading: true }))).toEqual({ kind: 'loading' });
  });

  it('returns idle before a scan result exists', () => {
    expect(resolveAppContentModel(makeInput({ result: null, filteredSummary: null }))).toEqual({
      kind: 'idle',
    });
  });

  it('returns empty when the complete scan has no sessions', () => {
    const result = makeResult(EMPTY_SUMMARY);
    const model = resolveAppContentModel(makeInput({ result, filteredSummary: EMPTY_SUMMARY }));

    expect(model).toEqual({ kind: 'empty', result });
  });

  it('returns period-empty when only the filtered summary is empty', () => {
    expect(
      resolveAppContentModel(makeInput({ filteredSummary: EMPTY_SUMMARY, period: 'week' }))
    ).toEqual({ kind: 'period-empty', period: 'week' });
  });

  it('returns ready with the result and filtered summary', () => {
    const result = makeResult();
    const model = resolveAppContentModel(makeInput({ result }));

    expect(model).toEqual({ kind: 'ready', result, summary: READY_SUMMARY });
  });
});
