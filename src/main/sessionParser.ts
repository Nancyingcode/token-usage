/**
 * @file Codex 会话解析器
 * @description
 * 将 JSONL 会话记录转换为可聚合的用量会话，并收集无法解析或不完整记录的警告。
 */
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import getSessionId, { getRolloutSessionId } from '../shared/sessionId';
import { isRecord } from '../shared/runtimeTypes';
import type { UsagePricingContext } from '../shared/conditionalPricingTypes';
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
import { createSessionEffortUsage, getRecordedEffortMetrics } from './sessionEffortUsage';
import { createThreadSpeedHistory } from './threadSpeedHistory';

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

const getPricingContext = (
  raw: unknown,
  granularity: UsagePricingContext['granularity']
): UsagePricingContext => {
  const writes = isRecord(raw) ? raw.cache_write_input_tokens : undefined;
  const validWrites = typeof writes === 'number' && Number.isFinite(writes) && writes >= 0;
  // 当前 Codex 日志未证明实际服务等级与正数写入分区语义；保留事实，不把 API 字段或请求意图冒充响应证据。
  return {
    granularity,
    mode: 'unknown',
    modeSource: 'missing',
    ...(writes === undefined
      ? {}
      : validWrites
        ? { cacheWriteInputTokens: writes, cacheWriteSemantics: 'unverified' }
        : { cacheWriteInvalid: true }),
  };
};

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

// 限制单批行数和字符串长度（UTF-16 单元），避免大量短行或长行持续占用主进程。
const MAX_PARSE_BATCH_LINES = 128;
const MAX_PARSE_BATCH_CHARACTERS = 262_144;

const parseSessionBatches = function* (
  sourceFile: string,
  content: string,
  threadName?: string
): Generator<void, UsageSession, void> {
  const warnings: UsageWarning[] = [];
  const rolloutId = getRolloutSessionId(sourceFile);
  const effortUsage = createSessionEffortUsage();
  const speedHistory = createThreadSpeedHistory(rolloutId);
  let sessionId = rolloutId ?? getSessionId(sourceFile);
  let projectPath = '';
  let startedAt = '';
  let endedAt = '';
  let startedAtMs: number | undefined;
  let endedAtMs: number | undefined;
  let eventCount = 0;
  let hasIncrementalUsage = false;
  let activeModelId: string | undefined;
  let activeTurn: ActiveTurn | undefined;
  let anonymousTurnSequence = 0;
  let summedUsage = emptyTokenUsage();
  let previousCumulativeTokens: number | undefined;
  let largestTotalUsage = emptyTokenUsage();
  let largestTotalSlice: UsageSlice | undefined;
  let largestTotalEffortMetrics: ReturnType<typeof getRecordedEffortMetrics> | undefined;
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

  const processLine = (line: string, index: number): void => {
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
      const timestampMs = Date.parse(record.timestamp);
      if (Number.isFinite(timestampMs)) {
        if (startedAtMs === undefined || timestampMs < startedAtMs) {
          startedAt = record.timestamp;
          startedAtMs = timestampMs;
        }
        if (endedAtMs === undefined || timestampMs > endedAtMs) {
          endedAt = record.timestamp;
          endedAtMs = timestampMs;
        }
      }
    }

    speedHistory.observe(record, index, summedUsage.totalTokens);
    const recordModelId = record.payload?.model;

    if (
      (record.type === 'turn_context' || record.type === 'session_meta') &&
      typeof recordModelId === 'string' &&
      recordModelId.trim()
    ) {
      activeModelId = recordModelId.trim();
    }

    if (record.type === 'session_meta') {
      effortUsage.resetBoundary();
      const sessionIdValue = record.payload?.session_id ?? record.payload?.id;
      const projectPathValue = record.payload?.cwd;

      // 分叉会话可能重放父线程的元数据，规范文件名标识实际拥有该记录的线程。
      if (!rolloutId && typeof sessionIdValue === 'string') {
        sessionId = sessionIdValue;
      }

      if (typeof projectPathValue === 'string') {
        projectPath = projectPathValue;
      }

      return;
    }

    const turnId = getOptionalString(record.payload?.turn_id);
    if (record.type === 'turn_context') {
      effortUsage.context(turnId, recordModelId, record.payload?.effort);
      return;
    }

    const eventType =
      record.type === 'event_msg' ? getOptionalString(record.payload?.type) : undefined;

    if (eventType && TURN_STARTED_EVENT_TYPES.has(eventType)) {
      effortUsage.start(turnId, index);
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
      effortUsage.end(turnId);
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
      effortUsage.end(turnId);
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

      const reportedTotal = isRecord(totalTokenUsage) ? totalTokenUsage.total_tokens : undefined;
      const cumulativeTokens = typeof reportedTotal === 'number' ? reportedTotal : undefined;
      // 重发累计快照时可能携带之前的单次用量。须用原始字段判断，避免将缺失值补齐的零当成快照。
      const repeatsCumulativeTotal =
        cumulativeTokens !== undefined && cumulativeTokens === previousCumulativeTokens;
      previousCumulativeTokens = cumulativeTokens ?? previousCumulativeTokens;

      if (lastUsage && !repeatsCumulativeTotal) {
        hasIncrementalUsage = true;
        effortUsage.increment(turnId, getRecordedEffortMetrics(lastTokenUsage));
        summedUsage = addTokenUsage(summedUsage, lastUsage);
        incrementalSlices.push({
          ...lastUsage,
          pricingContext: getPricingContext(lastTokenUsage, 'request'),
          occurredAt: getUsageTimestamp(record.timestamp, endedAt),
          modelId: activeModelId,
        });
      }

      if (totalUsage && totalUsage.totalTokens >= largestTotalUsage.totalTokens) {
        largestTotalUsage = totalUsage;
        largestTotalEffortMetrics = getRecordedEffortMetrics(totalTokenUsage);
        largestTotalSlice = {
          ...totalUsage,
          pricingContext: getPricingContext(totalTokenUsage, 'aggregate'),
          occurredAt: getUsageTimestamp(record.timestamp, endedAt),
          modelId: activeModelId,
        };
      }
    }
  };

  let offset = 0;
  let lineIndex = 0;
  let batchLines = 0;
  let batchCharacters = 0;
  while (offset <= content.length) {
    const newline = content.indexOf('\n', offset);
    const end = newline === -1 ? content.length : newline;
    processLine(content.slice(offset, end), lineIndex);
    lineIndex += 1;
    batchLines += 1;
    batchCharacters += end - offset;
    if (batchLines >= MAX_PARSE_BATCH_LINES || batchCharacters >= MAX_PARSE_BATCH_CHARACTERS) {
      yield;
      batchLines = 0;
      batchCharacters = 0;
    }
    if (newline === -1) {
      break;
    }
    offset = newline + 1;
  }

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
  const { reasoningEfforts, turnStartLines } = effortUsage.finish(
    hasIncrementalUsage ? undefined : largestTotalEffortMetrics
  );
  const speed = speedHistory.finish({
    totalTokens: usage.totalTokens,
    hasIncrementalUsage,
    turnStartLines,
  });

  return {
    sessionId,
    startedAt: safeStartedAt,
    endedAt: safeEndedAt,
    projectPath: safeProjectPath,
    projectName: getProjectName(safeProjectPath),
    threadName,
    usageSlices,
    turnOutcomes,
    reasoningEfforts,
    ...speed,
    ...usage,
    eventCount,
    sourceFile,
    warnings,
  };
};

export const parseSessionJsonl = (
  sourceFile: string,
  content: string,
  threadName?: string
): UsageSession => {
  const parser = parseSessionBatches(sourceFile, content, threadName);
  let result = parser.next();
  while (!result.done) {
    result = parser.next();
  }
  return result.value;
};

const getUsageTimestamp = (recordTimestamp: string | undefined, endedAt: string): string =>
  recordTimestamp || endedAt || new Date(0).toISOString();

export default parseSessionJsonl;

export const parseSessionJsonlAsync = async (
  sourceFile: string,
  content: string,
  threadName?: string
): Promise<UsageSession> => {
  const parser = parseSessionBatches(sourceFile, content, threadName);
  let result = parser.next();
  while (!result.done) {
    // 必须让出到下一轮事件循环；仅 await 已完成的 Promise 无法处理窗口事件和 I/O。
    await yieldToEventLoop();
    result = parser.next();
  }
  return result.value;
};
