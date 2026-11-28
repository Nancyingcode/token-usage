/**
 * @file 会话 ID 解析
 * @description 从 rollout JSONL 文件名或普通数据路径中提取稳定的会话标识。
 */
const ROLLOUT_SESSION_FILE_PATTERN =
  /^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl(?:\.zst)?$/;
const JSONL_EXTENSION_PATTERN = /\.jsonl(?:\.zst)?$/;

const getSourceName = (sourcePath: string): string => {
  const normalizedPath = sourcePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() ?? sourcePath;
};

export const getRolloutSessionId = (sourcePath: string): string | undefined =>
  getSourceName(sourcePath).match(ROLLOUT_SESSION_FILE_PATTERN)?.[1];

const getSessionId = (sourcePath: string): string =>
  getRolloutSessionId(sourcePath) ?? getSourceName(sourcePath).replace(JSONL_EXTENSION_PATTERN, '');

export default getSessionId;
