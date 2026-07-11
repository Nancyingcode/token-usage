import { homedir } from "node:os";
import { join } from "node:path";

export function getCodexHomeDir(): string {
  return join(homedir(), ".codex");
}

export function getDefaultCodexSessionsDir(): string {
  return join(getCodexHomeDir(), "sessions");
}

export function getDefaultSessionIndexPath(): string {
  return join(getCodexHomeDir(), "session_index.jsonl");
}
