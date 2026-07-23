export type UsageWarningCode =
  | 'malformed-jsonl'
  | 'invalid-jsonl-record'
  | 'invalid-token-usage'
  | 'session-file-unreadable'
  | 'sessions-directory-unreadable'
  | 'malformed-session-index';

export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface UsageWarning {
  sourceFile?: string;
  code: UsageWarningCode;
  message: string;
  line?: number;
  details?: string;
}

export interface UsageSlice extends TokenUsage {
  occurredAt: string;
  modelId?: string;
}

export interface UsageSession extends TokenUsage {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  threadName?: string;
  usageSlices: UsageSlice[];
  eventCount: number;
  sourceFile: string;
  warnings: UsageWarning[];
}

export interface UsageProject extends TokenUsage {
  projectPath: string;
  projectName: string;
  sessionCount: number;
  lastActivityAt: string;
  shareOfTotal: number;
}

export interface UsageDay extends TokenUsage {
  date: string;
  sessionCount: number;
}

export type UsagePeriod = 'today' | 'week' | 'month';

export interface UsageSummary {
  totals: TokenUsage;
  byDay: UsageDay[];
  byProject: UsageProject[];
  sessions: UsageSession[];
}

export interface UsageScanResult {
  sessionsDir: string;
  scannedAt: string;
  summary: UsageSummary;
  warnings: UsageWarning[];
}
