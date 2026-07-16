export interface TokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface UsageWarning {
  sourceFile?: string;
  message: string;
  line?: number;
}

export interface UsageSession extends TokenUsage {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  projectPath: string;
  projectName: string;
  threadName?: string;
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
