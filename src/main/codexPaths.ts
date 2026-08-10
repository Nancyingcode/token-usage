/**
 * @file Codex 数据路径解析
 * @description 统一计算默认会话目录和索引路径，仅返回路径，不执行文件系统写操作。
 */
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const getCodexHomeDir = (): string => join(homedir(), '.codex');

export const getDefaultCodexSessionsDir = (): string => join(getCodexHomeDir(), 'sessions');

export const getDefaultSessionIndexPath = (): string =>
  join(getCodexHomeDir(), 'session_index.jsonl');

export const getSessionIndexPathForSessionsDir = (sessionsDir: string): string =>
  join(dirname(sessionsDir), 'session_index.jsonl');
