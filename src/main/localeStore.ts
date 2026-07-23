/**
 * @file 语言偏好存储
 * @description 在 Electron 用户数据目录原子读写显式语言选择，损坏内容安全回退到系统语言。
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  isSupportedLocale,
  resolveSystemLocale,
  type SupportedLocale,
} from '../shared/i18n/locale';
import { isRecord } from '../shared/runtimeTypes';

const LOCALE_PREFERENCES_SCHEMA_VERSION = 1;
const JSON_INDENT_SPACES = 2;
const TEMP_FILE_SUFFIX = '.tmp';

interface PersistedLocalePreferences {
  schemaVersion: typeof LOCALE_PREFERENCES_SCHEMA_VERSION;
  locale: SupportedLocale;
}

export interface LocaleFileSystem {
  readFile: (path: string, encoding: 'utf8') => Promise<string>;
  mkdir: (path: string, options: { recursive: true }) => Promise<string | undefined>;
  writeFile: (path: string, data: string, encoding: 'utf8') => Promise<void>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options: { force: true }) => Promise<void>;
}

export interface LocaleStore {
  load: (systemLocale: string | undefined) => Promise<SupportedLocale>;
  save: (locale: SupportedLocale) => Promise<void>;
}

const DEFAULT_FILE_SYSTEM: LocaleFileSystem = {
  readFile: (path, encoding) => readFile(path, encoding),
  mkdir: (path, options) => mkdir(path, options),
  writeFile: (path, data, encoding) => writeFile(path, data, encoding),
  rename: (oldPath, newPath) => rename(oldPath, newPath),
  rm: (path, options) => rm(path, options),
};

const decodeLocalePreferences = (content: string): PersistedLocalePreferences => {
  const raw: unknown = JSON.parse(content);

  if (
    !isRecord(raw) ||
    raw.schemaVersion !== LOCALE_PREFERENCES_SCHEMA_VERSION ||
    !isSupportedLocale(raw.locale)
  ) {
    throw new TypeError('Locale preferences have an invalid schema.');
  }

  return {
    schemaVersion: LOCALE_PREFERENCES_SCHEMA_VERSION,
    locale: raw.locale,
  };
};

export const createLocaleStore = (
  configPath: string,
  fileSystem: LocaleFileSystem = DEFAULT_FILE_SYSTEM
): LocaleStore => {
  const load = async (systemLocale: string | undefined): Promise<SupportedLocale> => {
    try {
      const content = await fileSystem.readFile(configPath, 'utf8');
      return decodeLocalePreferences(content).locale;
    } catch {
      return resolveSystemLocale(systemLocale);
    }
  };

  const save = async (locale: SupportedLocale): Promise<void> => {
    if (!isSupportedLocale(locale)) {
      throw new TypeError('Unsupported locale.');
    }

    const preferences: PersistedLocalePreferences = {
      schemaVersion: LOCALE_PREFERENCES_SCHEMA_VERSION,
      locale,
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
