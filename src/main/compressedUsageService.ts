/**
 * @file 压缩数据手动导入与用量合并
 * @description 独立维护实时来源和本地原文副本，只发布去重后的有效来源变更；目录切换隔离在途任务。
 */
import { normalize } from 'node:path';
import type {
  CompressedDataStatus,
  CompressedImportResult,
  ImportedSessionSnapshot,
} from '../shared/compressedDataTypes';
import type { UsageSourceChange } from '../shared/costOptimizationTypes';
import getSessionId from '../shared/sessionId';
import { buildUsageSummary } from '../shared/usageMath';
import type { CompressedSessionStore } from './compressedSessionStore';
import { findCompressedSessionFiles, type UsageScanCycle } from './usageScanner';

export interface CompressedUsageServiceDependencies {
  initialSessionsDir: string;
  store: CompressedSessionStore;
  scanCycle: (sessionsDir: string) => Promise<UsageScanCycle>;
  discoverCompressedFiles?: (sessionsDir: string) => Promise<string[]>;
}

export interface CompressedUsageService {
  scanCycle: (sessionsDir: string) => Promise<UsageScanCycle>;
  setDirectory: (sessionsDir: string) => void;
  getStatus: () => CompressedDataStatus;
  refresh: () => Promise<CompressedDataStatus>;
  subscribe: (listener: (status: CompressedDataStatus) => void) => () => void;
  subscribeCycle: (listener: (cycle: UsageScanCycle) => void) => () => void;
  stop: () => void;
}

const sourceIdentity = (sourceFile: string): string => {
  const path = normalize(sourceFile).replace(/\.zst$/, '');
  return process.platform === 'win32' ? path.toLowerCase() : path;
};

const initialStatus = (sessionsDir: string): CompressedDataStatus => ({
  sessionsDir,
  phase: 'idle',
  discoveredCount: 0,
  unimportedCount: 0,
  importedCount: 0,
  processedCount: 0,
  totalCount: 0,
});

export const createCompressedUsageService = (
  dependencies: CompressedUsageServiceDependencies
): CompressedUsageService => {
  const discover = dependencies.discoverCompressedFiles ?? findCompressedSessionFiles;
  const listeners = new Set<(status: CompressedDataStatus) => void>();
  const cycleListeners = new Set<(cycle: UsageScanCycle) => void>();
  // 服务实例拥有当前目录、两份集合与任务世代；切换目录或停止时使旧任务失效。
  let sessionsDir = normalize(dependencies.initialSessionsDir);
  let generation = 0;
  let sequence = 0;
  let status = initialStatus(sessionsDir);
  let discoveredFiles: string[] = [];
  let localSnapshot: ImportedSessionSnapshot | undefined;
  let localLoading: Promise<ImportedSessionSnapshot> | undefined;
  let localError: string | undefined;
  let liveCycle: UsageScanCycle | undefined;
  let liveScanFailed = false;
  let pendingPublication: CompressedImportResult | undefined;
  let effectiveSources = new Map<string, UsageSourceChange>();
  let publishedDirectory: string | undefined;
  let activeImport: { generation: number; promise: Promise<CompressedDataStatus> } | undefined;
  let activeScan: { generation: number; promise: Promise<UsageScanCycle> } | undefined;

  const updateStatus = (patch: Partial<CompressedDataStatus>): void => {
    const importedIdentities = new Set(
      localSnapshot?.sources.map(({ sourceFile }) => sourceIdentity(sourceFile))
    );
    status = {
      ...status,
      ...patch,
      discoveredCount: discoveredFiles.length,
      unimportedCount: discoveredFiles.filter(
        (file) => !importedIdentities.has(sourceIdentity(file))
      ).length,
      importedCount: localSnapshot?.sources.length ?? 0,
      lastImportedAt: localSnapshot?.lastImportedAt,
    };
    listeners.forEach((listener) => listener(status));
  };

  const setDirectory = (nextDirectory: string): void => {
    const normalized = normalize(nextDirectory);
    if (normalized === sessionsDir) {
      return;
    }
    generation += 1;
    sessionsDir = normalized;
    status = initialStatus(sessionsDir);
    localSnapshot = undefined;
    localLoading = undefined;
    localError = undefined;
    liveCycle = undefined;
    liveScanFailed = false;
    pendingPublication = undefined;
    discoveredFiles = [];
    updateStatus({});
  };

  const finishImportPublication = (imported: CompressedImportResult): void => {
    const { report } = imported;
    const hasFailures = report.failures.length > 0;
    const hasSuccessfulFiles = report.added + report.updated + report.unchanged > 0;
    pendingPublication = undefined;
    updateStatus({
      phase: hasFailures ? (hasSuccessfulFiles ? 'partial' : 'error') : 'ready',
      report,
      lastCheckedAt: imported.checkedAt,
      error: undefined,
    });
  };

  const loadLocal = async (directory: string, taskGeneration: number): Promise<void> => {
    if (localSnapshot) {
      return;
    }
    if (!localLoading) {
      const loading = dependencies.store.load(directory).catch((error: unknown) => {
        if (localLoading === loading) {
          localLoading = undefined;
        }
        throw error;
      });
      localLoading = loading;
    }
    const loaded = await localLoading;
    if (generation === taskGeneration && !localSnapshot) {
      localSnapshot = loaded;
      if (localError && status.error === localError) {
        updateStatus({ phase: 'idle', error: undefined });
      }
      localError = undefined;
    }
  };

  const mergeCycle = (live: UsageScanCycle): UsageScanCycle => {
    const plainFiles = new Set(
      (
        live.plainSourceFiles ?? live.result.summary.sessions.map(({ sourceFile }) => sourceFile)
      ).map(sourceIdentity)
    );
    const liveSources =
      live.sources ??
      live.result.summary.sessions.map((session) => ({
        sourceFile: session.sourceFile,
        fingerprint: JSON.stringify(session),
        session,
      }));
    // 已发现但不可读的普通来源同样遮蔽旧副本，不能把历史数据冒充成功的实时读取。
    const importedSources = (localSnapshot?.sources ?? [])
      .filter(({ sourceFile }) => !plainFiles.has(sourceIdentity(sourceFile)))
      .map((entry) => ({
        ...entry,
        session: {
          ...entry.session,
          threadName: live.threadNames?.[getSessionId(entry.sourceFile)],
        },
      }));
    const sources = [...liveSources, ...importedSources].sort((first, second) =>
      first.sourceFile.localeCompare(second.sourceFile)
    );
    const nextSources = new Map(sources.map((entry) => [entry.sourceFile, entry]));
    const requiresFullRebuild = publishedDirectory !== live.result.sessionsDir;
    const upserted = sources.filter((entry) => {
      const previous = effectiveSources.get(entry.sourceFile);
      return (
        requiresFullRebuild ||
        !previous ||
        previous.fingerprint !== entry.fingerprint ||
        previous.session.threadName !== entry.session.threadName
      );
    });
    const removedSourceFiles = [...effectiveSources.keys()].filter(
      (file) => !nextSources.has(file)
    );
    const merged: UsageScanCycle = {
      ...live,
      sequence: ++sequence,
      sources,
      result: {
        ...live.result,
        summary: buildUsageSummary(sources.map(({ session }) => session)),
        warnings: [
          ...live.result.warnings,
          ...importedSources.flatMap(({ session }) => session.warnings),
        ],
      },
      changes: { upserted, removedSourceFiles, requiresFullRebuild },
    };
    effectiveSources = nextSources;
    publishedDirectory = live.result.sessionsDir;
    // 在提交有效集合的同一同步阶段发布，避免扫描 Promise 返回前被导入周期越过而漏发差异。
    cycleListeners.forEach((listener) => listener(merged));
    return merged;
  };

  const scanCycle = (directory: string): Promise<UsageScanCycle> => {
    setDirectory(directory);
    const taskGeneration = generation;
    const scanDirectory = sessionsDir;
    if (activeScan?.generation === taskGeneration) {
      return activeScan.promise;
    }
    const promise = (async () => {
      const [live] = await Promise.all([
        dependencies.scanCycle(scanDirectory),
        loadLocal(scanDirectory, taskGeneration).catch((error: unknown) => {
          if (generation === taskGeneration) {
            localError = error instanceof Error ? error.message : String(error);
            updateStatus({ phase: 'error', error: localError });
          }
        }),
      ]);
      if (taskGeneration !== generation) {
        throw new Error('Usage data directory changed during scanning.');
      }
      liveCycle = live;
      liveScanFailed = false;
      discoveredFiles = live.compressedSourceFiles ?? [];
      updateStatus({});
      const merged = mergeCycle(live);
      if (pendingPublication) {
        finishImportPublication(pendingPublication);
      }
      return merged;
    })()
      .catch((error: unknown) => {
        if (taskGeneration === generation) {
          liveScanFailed = true;
        }
        throw error;
      })
      .finally(() => {
        if (activeScan?.promise === promise) {
          activeScan = undefined;
        }
      });
    activeScan = { generation: taskGeneration, promise };
    return promise;
  };

  const refresh = (): Promise<CompressedDataStatus> => {
    if (activeImport?.generation === generation) {
      return activeImport.promise;
    }
    const taskGeneration = generation;
    const importDirectory = sessionsDir;
    const isCurrent = (): boolean => generation === taskGeneration;
    const promise = (async () => {
      pendingPublication = undefined;
      updateStatus({
        phase: 'checking',
        report: undefined,
        error: undefined,
        processedCount: 0,
        totalCount: 0,
      });
      try {
        await loadLocal(importDirectory, taskGeneration);
        const files = await discover(importDirectory);
        if (!isCurrent()) {
          return status;
        }
        discoveredFiles = files;
        updateStatus({ phase: 'importing', totalCount: files.length });
        const imported = await dependencies.store.importFiles(
          importDirectory,
          files,
          (processedCount, totalCount) => {
            if (isCurrent()) {
              updateStatus({ processedCount, totalCount });
            }
          },
          isCurrent
        );
        if (!isCurrent()) {
          return status;
        }
        localSnapshot = imported.snapshot;
        pendingPublication = imported;
        updateStatus({ report: imported.report, lastCheckedAt: imported.checkedAt });
        // 只在原文与清单提交后发布，合并采用此刻最新的实时集合。
        // 失败后的旧集合不能重新标记为新鲜，必须先取得一次成功的实时扫描。
        if (liveCycle && !liveScanFailed) {
          mergeCycle(liveCycle);
        } else {
          await scanCycle(importDirectory);
        }
        if (!isCurrent()) {
          return status;
        }
        if (pendingPublication === imported) {
          finishImportPublication(imported);
        }
      } catch (error) {
        if (isCurrent()) {
          updateStatus({
            phase: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return status;
    })().finally(() => {
      if (activeImport?.promise === promise) {
        activeImport = undefined;
      }
    });
    activeImport = { generation: taskGeneration, promise };
    return promise;
  };

  return {
    scanCycle,
    setDirectory,
    getStatus: () => status,
    refresh,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeCycle: (listener) => {
      cycleListeners.add(listener);
      return () => {
        cycleListeners.delete(listener);
      };
    },
    stop: () => {
      generation += 1;
      listeners.clear();
      cycleListeners.clear();
    },
  };
};
