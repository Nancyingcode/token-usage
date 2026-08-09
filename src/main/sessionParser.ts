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
import type {
  TokenUsage,
  UsageSession,
  UsageSlice,
  UsageTurnError,
  UsageTurnOutcome,
  UsageWarning,
} from '../shared/usageTypes';

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

interface ActiveTurn {
  key: string;
  turnId?: string;
  pendingError?: UsageTurnError;
}

const TURN_STARTED_EVENT_TYPES = new Set(['task_started', 'turn_started']);
const TURN_COMPLETE_EVENT_TYPES = new Set(['task_complete', 'turn_complete']);
const NON_TERMINAL_ERROR_CODES = new Set(['active_turn_not_steerable', 'thread_rollback_failed']);
const MILLISECONDS_PER_SECOND = 1_000;

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

const getOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const getErrorCode = (value: unknown): string | undefined => {
  const directCode = getOptionalString(value);

  if (directCode) {
    return directCode;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return Object.keys(value)[0];
};

const toTurnError = (value: unknown): UsageTurnError | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const message = typeof value.message === 'string' ? value.message : '';
  const code = getErrorCode(value.codex_error_info);

  return {
    ...(code ? { code } : {}),
    message,
  };
};

const errorAffectsTurnStatus = (error: UsageTurnError): boolean =>
  !error.code || !NON_TERMINAL_ERROR_CODES.has(error.code);

const getTurnEventTimestamp = (record: ParsedLine, field: unknown): string => {
  if (typeof field === 'number' && Number.isFinite(field)) {
    return new Date(field * MILLISECONDS_PER_SECOND).toISOString();
  }

  return record.timestamp || new Date(0).toISOString();
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
  let activeTurn: ActiveTurn | undefined;
  let anonymousTurnSequence = 0;
  let summedUsage = emptyTokenUsage();
  let largestTotalUsage = emptyTokenUsage();
  let largestTotalSlice: UsageSlice | undefined;
  const incrementalSlices: UsageSlice[] = [];
  const turnOutcomes: UsageTurnOutcome[] = [];
  const turnOutcomeIndexes = new Map<string, number>();

  const nextAnonymousTurnKey = (): string => {
    anonymousTurnSequence += 1;
    return `anonymous-turn-${anonymousTurnSequence}`;
  };
  const saveTurnOutcome = (key: string, outcome: UsageTurnOutcome): void => {
    const existingIndex = turnOutcomeIndexes.get(key);

    if (existingIndex === undefined) {
      turnOutcomeIndexes.set(key, turnOutcomes.length);
      turnOutcomes.push(outcome);
      return;
    }

    turnOutcomes[existingIndex] = outcome;
  };
  const resolveTurnIdentity = (turnId?: string): { key: string; turnId?: string } => {
    const matchingActiveTurn =
      activeTurn && (!turnId || !activeTurn.turnId || activeTurn.turnId === turnId)
        ? activeTurn
        : undefined;
    const outcomeTurnId = turnId ?? matchingActiveTurn?.turnId;

    return {
      key: matchingActiveTurn?.key ?? turnId ?? nextAnonymousTurnKey(),
      ...(outcomeTurnId ? { turnId: outcomeTurnId } : {}),
    };
  };

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

    const eventType =
      record.type === 'event_msg' ? getOptionalString(record.payload?.type) : undefined;

    if (eventType && TURN_STARTED_EVENT_TYPES.has(eventType)) {
      const turnId = getOptionalString(record.payload?.turn_id);
      activeTurn = {
        key: turnId ?? nextAnonymousTurnKey(),
        ...(turnId ? { turnId } : {}),
      };
      return;
    }

    if (eventType === 'error' && activeTurn) {
      const error = toTurnError(record.payload);

      if (error && errorAffectsTurnStatus(error)) {
        activeTurn.pendingError = error;
      }
      return;
    }

    if (eventType && TURN_COMPLETE_EVENT_TYPES.has(eventType)) {
      const turnId = getOptionalString(record.payload?.turn_id);
      const identity = resolveTurnIdentity(turnId);
      const terminalError = toTurnError(record.payload?.error);
      const error =
        terminalError && errorAffectsTurnStatus(terminalError)
          ? terminalError
          : activeTurn?.key === identity.key
            ? activeTurn.pendingError
            : undefined;
      const outcome: UsageTurnOutcome = {
        ...(identity.turnId ? { turnId: identity.turnId } : {}),
        occurredAt: getTurnEventTimestamp(record, record.payload?.completed_at),
        status: error ? 'failed' : 'completed',
        ...(error ? { error } : {}),
      };

      saveTurnOutcome(identity.key, outcome);
      activeTurn = undefined;
      return;
    }

    if (eventType === 'turn_aborted') {
      const turnId = getOptionalString(record.payload?.turn_id);
      const identity = resolveTurnIdentity(turnId);
      const interruptReason = getOptionalString(record.payload?.reason);

      saveTurnOutcome(identity.key, {
        ...(identity.turnId ? { turnId: identity.turnId } : {}),
        occurredAt: getTurnEventTimestamp(record, record.payload?.completed_at),
        status: 'interrupted',
        ...(interruptReason ? { interruptReason } : {}),
      });
      activeTurn = undefined;
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
    turnOutcomes,
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
