/**
 * @file 主题偏好存储
 * @description 在 Electron 用户数据目录原子读写显式主题偏好，损坏内容安全回退到跟随系统。
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_THEME_PREFERENCE, isThemePreference, type ThemePreference } from '../shared/theme';
import { isRecord } from '../shared/runtimeTypes';

const THEME_PREFERENCES_SCHEMA_VERSION = 1;
const JSON_INDENT_SPACES = 2;
const TEMP_FILE_SUFFIX = '.tmp';

interface PersistedThemePreferences {
  schemaVersion: typeof THEME_PREFERENCES_SCHEMA_VERSION;
  preference: ThemePreference;
}

export interface ThemeFileSystem {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  mkdir: (path: string, options: { recursive: true }) => Promise<string | undefined>;
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options: { force: true }) => Promise<void>;
}

export interface ThemeStore {
  load: () => Promise<ThemePreference>;
  save: (preference: ThemePreference) => Promise<void>;
}

const DEFAULT_FILE_SYSTEM: ThemeFileSystem = {
  readFile: (path, encoding) => readFile(path, encoding),
  mkdir: (path, options) => mkdir(path, options),
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
  rename: (oldPath, newPath) => rename(oldPath, newPath),
  rm: (path, options) => rm(path, options),
};

const decodeThemePreferences = (content: string): PersistedThemePreferences => {
  const raw: unknown = JSON.parse(content);

  if (
    !isRecord(raw) ||
    raw.schemaVersion !== THEME_PREFERENCES_SCHEMA_VERSION ||
    !isThemePreference(raw.preference)
  ) {
    throw new TypeError('Theme preferences have an invalid schema.');
  }

  return {
    schemaVersion: THEME_PREFERENCES_SCHEMA_VERSION,
    preference: raw.preference,
  };
};

export const createThemeStore = (
  configPath: string,
  fileSystem: ThemeFileSystem = DEFAULT_FILE_SYSTEM
): ThemeStore => {
  const load = async (): Promise<ThemePreference> => {
    try {
      const content = await fileSystem.readFile(configPath, 'utf8');
      return decodeThemePreferences(content).preference;
    } catch {
      return DEFAULT_THEME_PREFERENCE;
    }
  };

  const save = async (preference: ThemePreference): Promise<void> => {
    if (!isThemePreference(preference)) {
      throw new TypeError('Unsupported theme preference.');
    }

    const preferences: PersistedThemePreferences = {
      schemaVersion: THEME_PREFERENCES_SCHEMA_VERSION,
      preference,
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
