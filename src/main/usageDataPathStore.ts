/**
 * @file 用量数据路径存储
 * @description 在 Electron 用户数据目录中原子保存可选的自定义 Codex 会话目录。
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isRecord } from '../shared/runtimeTypes';

const USAGE_DATA_PATH_SCHEMA_VERSION = 1;
const JSON_INDENT_SPACES = 2;
const TEMP_FILE_SUFFIX = '.tmp';

interface PersistedUsageDataPath {
  schemaVersion: typeof USAGE_DATA_PATH_SCHEMA_VERSION;
  sessionsDir?: string;
}

export interface UsageDataPathFileSystem {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  mkdir: (path: string, options: { recursive: true }) => Promise<string | undefined>;
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options: { force: true }) => Promise<void>;
}

export interface UsageDataPathStore {
  load: () => Promise<string | undefined>;
  save: (sessionsDir: string | undefined) => Promise<void>;
}

const DEFAULT_FILE_SYSTEM: UsageDataPathFileSystem = {
  readFile: (path, encoding) => readFile(path, encoding),
  mkdir: (path, options) => mkdir(path, options),
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
  rename: (oldPath, newPath) => rename(oldPath, newPath),
  rm: (path, options) => rm(path, options),
};

const decodeUsageDataPath = (content: string): PersistedUsageDataPath => {
  const raw: unknown = JSON.parse(content);
  const sessionsDirIsValid =
    isRecord(raw) &&
    (raw.sessionsDir === undefined ||
      (typeof raw.sessionsDir === 'string' && raw.sessionsDir.trim().length > 0));

  if (
    !isRecord(raw) ||
    raw.schemaVersion !== USAGE_DATA_PATH_SCHEMA_VERSION ||
    !sessionsDirIsValid
  ) {
    throw new TypeError('Usage data path preferences have an invalid schema.');
  }

  return {
    schemaVersion: USAGE_DATA_PATH_SCHEMA_VERSION,
    ...(typeof raw.sessionsDir === 'string' ? { sessionsDir: raw.sessionsDir } : {}),
  };
};

export const createUsageDataPathStore = (
  configPath: string,
  fileSystem: UsageDataPathFileSystem = DEFAULT_FILE_SYSTEM
): UsageDataPathStore => {
  const load = async (): Promise<string | undefined> => {
    try {
      return decodeUsageDataPath(await fileSystem.readFile(configPath, 'utf8')).sessionsDir;
    } catch {
      return undefined;
    }
  };

  const save = async (sessionsDir: string | undefined): Promise<void> => {
    const preferences: PersistedUsageDataPath = {
      schemaVersion: USAGE_DATA_PATH_SCHEMA_VERSION,
      ...(sessionsDir ? { sessionsDir } : {}),
    };
    const tempPath = `${configPath}${TEMP_FILE_SUFFIX}`;

    await fileSystem.mkdir(dirname(configPath), { recursive: true });

    try {
      await fileSystem.writeFile(
        tempPath,
        `${JSON.stringify(preferences, null, JSON_INDENT_SPACES)}\n`,
        'utf8'
      );
      await fileSystem.rename(tempPath, configPath);
    } finally {
      await fileSystem.rm(tempPath, { force: true });
    }
  };

  return { load, save };
};
