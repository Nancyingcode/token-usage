import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const getCodexHomeDir = (): string => join(homedir(), '.codex');

export const getDefaultCodexSessionsDir = (): string => join(getCodexHomeDir(), 'sessions');

export const getDefaultSessionIndexPath = (): string =>
  join(getCodexHomeDir(), 'session_index.jsonl');

export const getSessionIndexPathForSessionsDir = (sessionsDir: string): string =>
  join(dirname(sessionsDir), 'session_index.jsonl');
