/**
 * @file Codex 会话解析器
 * @description
 * 将 JSONL 会话记录转换为可聚合的用量会话，并收集无法解析或不完整记录的警告。
 */
import getSessionId from '../shared/sessionId';
import { isRecord } from '../shared/runtimeTypes';
import {
  addTokenUsage,
  emptyTokenUsage,
  getProjectIdentity,
  getProjectName,
} from '../shared/usageMath';
import type { TokenUsage, UsageSession, UsageSlice, UsageWarning } from '../shared/usageTypes';

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
  let activeModelId: string | undefined;
  let summedUsage = emptyTokenUsage();
  let largestTotalUsage = emptyTokenUsage();
  let largestTotalSlice: UsageSlice | undefined;
  const incrementalSlices: UsageSlice[] = [];

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
        code: 'malformed-jsonl',
      });
      return;
    }

    if (!isParsedLine(record)) {
      warnings.push({
        sourceFile,
        line: index + 1,
        code: 'invalid-jsonl-record',
      });
      return;
    }

    if (record.timestamp) {
      startedAt = earliestTimestamp(startedAt, record.timestamp);
      endedAt = latestTimestamp(endedAt, record.timestamp);
    }

    const recordModelId = record.payload?.model;

    if (
      (record.type === 'turn_context' || record.type === 'session_meta') &&
      typeof recordModelId === 'string' &&
      recordModelId.trim()
    ) {
      activeModelId = recordModelId.trim();
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
          code: 'invalid-token-usage',
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
        incrementalSlices.push({
          ...lastUsage,
          occurredAt: getUsageTimestamp(record.timestamp, endedAt),
          modelId: activeModelId,
        });
      }

      if (totalUsage && totalUsage.totalTokens >= largestTotalUsage.totalTokens) {
        largestTotalUsage = totalUsage;
        largestTotalSlice = {
          ...totalUsage,
          occurredAt: getUsageTimestamp(record.timestamp, endedAt),
          modelId: activeModelId,
        };
      }
    }
  });

  const usage = hasIncrementalUsage ? summedUsage : largestTotalUsage;
  const fallbackTimestamp = new Date(0).toISOString();
  const safeStartedAt = startedAt || endedAt || fallbackTimestamp;
  const safeEndedAt = endedAt || startedAt || fallbackTimestamp;
  const safeProjectPath = getProjectIdentity(projectPath);
  const usageSlices = hasIncrementalUsage
    ? incrementalSlices
    : largestTotalSlice
      ? [largestTotalSlice]
      : [];

  return {
    sessionId,
    startedAt: safeStartedAt,
    endedAt: safeEndedAt,
    projectPath: safeProjectPath,
    projectName: getProjectName(safeProjectPath),
    threadName,
    usageSlices,
    ...usage,
    eventCount,
    sourceFile,
    warnings,
  };
};

const getUsageTimestamp = (recordTimestamp: string | undefined, endedAt: string): string =>
  recordTimestamp || endedAt || new Date(0).toISOString();

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
