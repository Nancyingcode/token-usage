import type { UsageScanResult } from './usageTypes';

export type UsageDataPathIssueCode =
  'path-required' | 'path-not-absolute' | 'path-unreadable' | 'unexpected';

export interface UsageDataPathSettings {
  sessionsDir: string;
  defaultSessionsDir: string;
  usingDefault: boolean;
}

export interface UsageDataPathUpdateResult {
  settings: UsageDataPathSettings;
  result: UsageScanResult;
}

export type UsageDataPathIpcResponse<Result> =
  { ok: true; value: Result } | { ok: false; error: { code: UsageDataPathIssueCode } };
