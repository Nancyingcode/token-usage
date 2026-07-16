import { basename } from "node:path";
import { addTokenUsage, emptyTokenUsage, getProjectName } from "../shared/usageMath";
import type { TokenUsage, UsageSession, UsageWarning } from "../shared/usageTypes";

interface RawTokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

interface ParsedLine {
  timestamp?: string;
  type?: string;
  payload?: {
    session_id?: string;
    id?: string;
    cwd?: string;
    type?: string;
    info?: {
      last_token_usage?: RawTokenUsage;
      total_token_usage?: RawTokenUsage;
    };
  };
}

export function parseSessionJsonl(
  sourceFile: string,
  content: string,
  threadName?: string
): UsageSession {
  const warnings: UsageWarning[] = [];
  const sourceName = basename(sourceFile);
  const lines = content.split(/\r?\n/);

  let sessionId = sessionIdFromFile(sourceName);
  let projectPath = "";
  let startedAt = "";
  let endedAt = "";
  let eventCount = 0;
  let hasIncrementalUsage = false;
  let summedUsage = emptyTokenUsage();
  let largestTotalUsage = emptyTokenUsage();

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let record: ParsedLine;

    try {
      record = JSON.parse(trimmed) as ParsedLine;
    } catch {
      warnings.push({
        sourceFile,
        line: index + 1,
        message: "Malformed JSONL line skipped."
      });
      return;
    }

    if (record.timestamp) {
      startedAt = earliestTimestamp(startedAt, record.timestamp);
      endedAt = latestTimestamp(endedAt, record.timestamp);
    }

    if (record.type === "session_meta") {
      sessionId = record.payload?.session_id ?? record.payload?.id ?? sessionId;
      projectPath = record.payload?.cwd ?? projectPath;
      return;
    }

    if (record.type === "event_msg" && record.payload?.type === "token_count") {
      const info = record.payload.info;
      const lastUsage = toTokenUsage(info?.last_token_usage);
      const totalUsage = toTokenUsage(info?.total_token_usage);

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
  const safeProjectPath = projectPath || "Unknown Project";

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
    warnings
  };
}

function toTokenUsage(raw?: RawTokenUsage): TokenUsage | undefined {
  if (!raw) {
    return undefined;
  }

  return {
    inputTokens: raw.input_tokens ?? 0,
    cachedInputTokens: raw.cached_input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    reasoningOutputTokens: raw.reasoning_output_tokens ?? 0,
    totalTokens: raw.total_tokens ?? 0
  };
}

function sessionIdFromFile(sourceName: string): string {
  const match = sourceName.match(/rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/);
  return match?.[1] ?? sourceName.replace(/\.jsonl$/, "");
}

function earliestTimestamp(current: string, candidate: string): string {
  if (!current) {
    return candidate;
  }

  return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
}

function latestTimestamp(current: string, candidate: string): string {
  if (!current) {
    return candidate;
  }

  return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}
