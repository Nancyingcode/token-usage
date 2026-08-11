/**
 * @file 应用持久化路径
 * @description
 * 固定已发布应用的 userData 所有权，避免产品显示名称变化后现有配置变得不可见。
 * 该路径只承载应用配置和可重建缓存，不得指向或操作只读 Codex 会话数据源。
 */
import { join } from 'node:path';

const STABLE_USER_DATA_DIRECTORY = 'codex-token-usage';

interface PathJoiner {
  join: (...paths: string[]) => string;
}

interface ApplicationPathApi {
  getPath: (name: 'appData') => string;
  setPath: (name: 'userData', path: string) => void;
}

const DEFAULT_PATH_JOINER: PathJoiner = { join };

export const resolveStableUserDataPath = (
  appDataPath: string,
  pathJoiner: PathJoiner = DEFAULT_PATH_JOINER
): string => pathJoiner.join(appDataPath, STABLE_USER_DATA_DIRECTORY);

export const configureStableUserDataPath = (
  application: ApplicationPathApi,
  pathJoiner: PathJoiner = DEFAULT_PATH_JOINER
): string => {
  const userDataPath = resolveStableUserDataPath(application.getPath('appData'), pathJoiner);
  application.setPath('userData', userDataPath);
  return userDataPath;
};
