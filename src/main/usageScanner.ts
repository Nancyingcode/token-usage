import { promises as fs } from "node:fs";
import { join } from "node:path";
import { getDefaultCodexSessionsDir, getDefaultSessionIndexPath } from "./codexPaths";
import { parseSessionJsonl } from "./sessionParser";
import { buildUsageSummary } from "../shared/usageMath";
import type { UsageScanResult, UsageSession, UsageWarning } from "../shared/usageTypes";

export interface ScanOptions {
  sessionsDir?: string;
}

interface SessionIndexLine {
  id?: string;
  thread_name?: string;
}

export async function scanCodexUsage(options: ScanOptions = {}): Promise<UsageScanResult> {
  const sessionsDir = options.sessionsDir ?? getDefaultCodexSessionsDir();
  const warnings: UsageWarning[] = [];
  const threadNames = await loadThreadNames(getDefaultSessionIndexPath(), warnings);
  const files = await findJsonlFiles(sessionsDir, warnings);
  const sessions: UsageSession[] = [];

  for (const file of files) {
    try {
      const content = await fs.readFile(file, "utf8");
      const sourceSessionId = sessionIdFromPath(file);
      const session = parseSessionJsonl(file, content, threadNames.get(sourceSessionId));
      sessions.push(session);
      warnings.push(...session.warnings);
    } catch (error) {
      warnings.push({
        sourceFile: file,
        message: `Unable to read session file: ${errorMessage(error)}`
      });
    }
  }

  return {
    sessionsDir,
    scannedAt: new Date().toISOString(),
    summary: buildUsageSummary(sessions),
    warnings
  };
}

async function findJsonlFiles(dir: string, warnings: UsageWarning[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await findJsonlFiles(fullPath, warnings)));
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    warnings.push({
      sourceFile: dir,
      message: `Unable to scan Codex sessions directory: ${errorMessage(error)}`
    });
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function loadThreadNames(
  sessionIndexPath: string,
  warnings: UsageWarning[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();

  try {
    const content = await fs.readFile(sessionIndexPath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return;
      }

      try {
        const record = JSON.parse(trimmed) as SessionIndexLine;

        if (record.id && record.thread_name) {
          names.set(record.id, record.thread_name);
        }
      } catch {
        warnings.push({
          sourceFile: sessionIndexPath,
          line: index + 1,
          message: "Malformed session index line skipped."
        });
      }
    });
  } catch {
    return names;
  }

  return names;
}

function sessionIdFromPath(file: string): string {
  const match = file.match(
    /rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/
  );
  return match?.[1] ?? file.replace(/\.jsonl$/, "");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
