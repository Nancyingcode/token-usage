import { homedir } from 'node:os';
import { join } from 'node:path';

export const getCodexHomeDir = (): string => join(homedir(), '.codex');

export const getDefaultCodexSessionsDir = (): string => join(getCodexHomeDir(), 'sessions');

export const getDefaultSessionIndexPath = (): string =>
  join(getCodexHomeDir(), 'session_index.jsonl');
