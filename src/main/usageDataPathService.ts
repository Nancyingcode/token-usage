/**
 * @file 用量数据路径服务
 * @description 校验、持久化并应用用户选择的只读 Codex 会话目录。
 */

import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';
import type {
  UsageDataPathIssueCode,
  UsageDataPathSettings,
  UsageDataPathUpdateResult,
} from '../shared/usageDataPathTypes';
import type { UsageScanResult } from '../shared/usageTypes';
import type { UsageDataPathStore } from './usageDataPathStore';

export interface UsageDataPathServiceDependencies {
  defaultSessionsDir: string;
  initialSessionsDir: string;
  store: UsageDataPathStore;
  validateDirectory?: (sessionsDir: string) => Promise<void>;
  updateSessionsDir: (sessionsDir: string) => Promise<UsageScanResult>;
}

export interface UsageDataPathService {
  getSettings: () => UsageDataPathSettings;
  update: (sessionsDir: unknown) => Promise<UsageDataPathUpdateResult>;
  reset: () => Promise<UsageDataPathUpdateResult>;
}

export class UsageDataPathServiceError extends Error {
  readonly code: UsageDataPathIssueCode;

  constructor(code: UsageDataPathIssueCode) {
    super(code);
    this.name = 'UsageDataPathServiceError';
    this.code = code;
  }
}

const validateReadableDirectory = async (sessionsDir: string): Promise<void> => {
  const pathStat = await stat(sessionsDir);

  if (!pathStat.isDirectory()) {
    throw new TypeError('Usage data path is not a directory.');
  }

  await access(sessionsDir, constants.R_OK);
};

export const createUsageDataPathService = (
  dependencies: UsageDataPathServiceDependencies
): UsageDataPathService => {
  const validateDirectory = dependencies.validateDirectory ?? validateReadableDirectory;
  const normalizedDefault = normalize(dependencies.defaultSessionsDir);
  let currentSessionsDir = normalize(dependencies.initialSessionsDir);

  const getSettings = (): UsageDataPathSettings => ({
    sessionsDir: currentSessionsDir,
    defaultSessionsDir: normalizedDefault,
    usingDefault: currentSessionsDir === normalizedDefault,
  });

  const apply = async (input: unknown): Promise<UsageDataPathUpdateResult> => {
    if (typeof input !== 'string' || input.trim().length === 0) {
      throw new UsageDataPathServiceError('path-required');
    }

    const trimmedPath = input.trim();

    if (!isAbsolute(trimmedPath)) {
      throw new UsageDataPathServiceError('path-not-absolute');
    }

    const sessionsDir = normalize(trimmedPath);

    try {
      await validateDirectory(sessionsDir);
    } catch {
      throw new UsageDataPathServiceError('path-unreadable');
    }

    const previousSessionsDir = currentSessionsDir;
    const previousOverride =
      previousSessionsDir === normalizedDefault ? undefined : previousSessionsDir;
    await dependencies.store.save(sessionsDir === normalizedDefault ? undefined : sessionsDir);
    currentSessionsDir = sessionsDir;

    let result: UsageScanResult;

    try {
      result = await dependencies.updateSessionsDir(sessionsDir);
    } catch (error) {
      currentSessionsDir = previousSessionsDir;

      try {
        await dependencies.store.save(previousOverride);
      } catch {
        // Preserve the original scan error; the in-memory path still returns to the last good value.
      }

      try {
        await dependencies.updateSessionsDir(previousSessionsDir);
      } catch {
        // The last successful result remains available even if the rollback refresh also fails.
      }

      throw error;
    }

    return { settings: getSettings(), result };
  };

  return {
    getSettings,
    update: apply,
    reset: () => apply(normalizedDefault),
  };
};
