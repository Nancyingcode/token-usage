import getSessionId from '../shared/sessionId';
import { isRecord } from '../shared/runtimeTypes';
import { addTokenUsage, emptyTokenUsage, getProjectName } from '../shared/usageMath';
import type { TokenUsage, UsageSession, UsageWarning } from '../shared/usageTypes';

interface ParsedLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

const TOKEN_USAGE_KEYS = [
  'input_tokens',
  'cached_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'total_tokens',
] as const;

type TokenUsageRecord = Record<(typeof TOKEN_USAGE_KEYS)[number], number | undefined>;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isParsedLine = (value: unknown): value is ParsedLine => {
  if (!isRecord(value)) {
    return false;
  }

  if (!isOptionalString(value.timestamp) || !isOptionalString(value.type)) {
    return false;
  }

  return value.payload === undefined || isRecord(value.payload);
};

const isValidTokenValue = (value: unknown): value is number | undefined =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0);

const isTokenUsageRecord = (raw: Record<string, unknown>): raw is TokenUsageRecord =>
  TOKEN_USAGE_KEYS.every((key) => isValidTokenValue(raw[key]));

const toTokenUsage = (raw: unknown): TokenUsage | undefined => {
  if (!isRecord(raw) || !isTokenUsageRecord(raw)) {
    return undefined;
  }

  return {
    inputTokens: raw.input_tokens ?? 0,
    cachedInputTokens: raw.cached_input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    reasoningOutputTokens: raw.reasoning_output_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0,
  };
};

export const parseSessionJsonl = (
  sourceFile: string,
  content: string,
  threadName?: string
): UsageSession => {
  const warnings: UsageWarning[] = [];
  const lines = content.split(/\r?\n/);

  let sessionId = getSessionId(sourceFile);
  let projectPath = '';
  let startedAt = '';
  let endedAt = '';
  let eventCount = 0;
  let hasIncrementalUsage = false;
  let summedUsage = emptyTokenUsage();
  let largestTotalUsage = emptyTokenUsage();

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let record: unknown;

    try {
      record = JSON.parse(trimmed);
    } catch {
      warnings.push({
        sourceFile,
        line: index + 1,
        message: 'Malformed JSONL line skipped.',
      });
      return;
    }

    if (!isParsedLine(record)) {
      warnings.push({
        sourceFile,
        line: index + 1,
        message: 'Invalid JSONL record skipped.',
      });
      return;
    }

    if (record.timestamp) {
      startedAt = earliestTimestamp(startedAt, record.timestamp);
      endedAt = latestTimestamp(endedAt, record.timestamp);
    }

    if (record.type === 'session_meta') {
      const sessionIdValue = record.payload?.session_id ?? record.payload?.id;
      const projectPathValue = record.payload?.cwd;

      if (typeof sessionIdValue === 'string') {
        sessionId = sessionIdValue;
      }

      if (typeof projectPathValue === 'string') {
        projectPath = projectPathValue;
      }

      return;
    }

    if (record.type === 'event_msg' && record.payload?.type === 'token_count') {
      const info = isRecord(record.payload.info) ? record.payload.info : undefined;
      const lastTokenUsage = info?.last_token_usage;
      const totalTokenUsage = info?.total_token_usage;
      const lastUsage = lastTokenUsage === undefined ? undefined : toTokenUsage(lastTokenUsage);
      const totalUsage = totalTokenUsage === undefined ? undefined : toTokenUsage(totalTokenUsage);

      if (
        (lastTokenUsage !== undefined && !lastUsage) ||
        (totalTokenUsage !== undefined && !totalUsage)
      ) {
        warnings.push({
          sourceFile,
          line: index + 1,
          message: 'Invalid token usage skipped.',
        });
        return;
      }

      if (!lastUsage && !totalUsage) {
        return;
      }

      eventCount += 1;

      if (lastUsage) {
        hasIncrementalUsage = true;
        summedUsage = addTokenUsage(summedUsage, lastUsage);
      }

      if (totalUsage && totalUsage.totalTokens >= largestTotalUsage.totalTokens) {
        largestTotalUsage = totalUsage;
      }
    }
  });

  const usage = hasIncrementalUsage ? summedUsage : largestTotalUsage;
  const fallbackTimestamp = new Date(0).toISOString();
  const safeStartedAt = startedAt || endedAt || fallbackTimestamp;
  const safeEndedAt = endedAt || startedAt || fallbackTimestamp;
  const safeProjectPath = projectPath || 'Unknown Project';

  return {
    sessionId,
    startedAt: safeStartedAt,
    endedAt: safeEndedAt,
    projectPath: safeProjectPath,
    projectName: getProjectName(safeProjectPath),
    threadName,
    ...usage,
    eventCount,
    sourceFile,
    warnings,
  };
};

export default parseSessionJsonl;

const earliestTimestamp = (current: string, candidate: string): string => {
  if (!current) {
    return candidate;
  }

  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
};

const latestTimestamp = (current: string, candidate: string): string => {
  if (!current) {
    return candidate;
  }

  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
};
