import type { UsageSourceChange } from './costOptimizationTypes';

export interface CompressedImportFailure {
  sourceFile?: string;
  message: string;
}

export interface CompressedImportReport {
  added: number;
  updated: number;
  unchanged: number;
  failures: CompressedImportFailure[];
}

export interface CompressedDataStatus {
  sessionsDir: string;
  phase: 'idle' | 'checking' | 'importing' | 'ready' | 'partial' | 'error';
  discoveredCount: number;
  unimportedCount: number;
  importedCount: number;
  processedCount: number;
  totalCount: number;
  lastImportedAt?: string;
  lastCheckedAt?: string;
  report?: CompressedImportReport;
  error?: string;
}

export interface CompressedDataApi {
  getStatus: () => Promise<CompressedDataStatus>;
  refresh: () => Promise<CompressedDataStatus>;
  onUpdated: (listener: (status: CompressedDataStatus) => void) => () => void;
}

export interface ImportedSessionSnapshot {
  sessionsDir: string;
  sources: UsageSourceChange[];
  lastImportedAt?: string;
}

export interface CompressedImportResult {
  snapshot: ImportedSessionSnapshot;
  report: CompressedImportReport;
  checkedAt: string;
}
