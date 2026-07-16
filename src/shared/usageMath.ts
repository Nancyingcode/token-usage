import type { TokenUsage, UsageDay, UsageProject, UsageSession, UsageSummary } from "./usageTypes";

export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0
  };
}

export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningOutputTokens: a.reasoningOutputTokens + b.reasoningOutputTokens,
    totalTokens: a.totalTokens + b.totalTokens
  };
}

export function getProjectName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const name = normalized.split("/").filter(Boolean).pop();
  return name || projectPath || "Unknown Project";
}

export function getLocalDateKey(timestamp: string): string {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown Date";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildUsageSummary(sessions: UsageSession[]): UsageSummary {
  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return {
    totals: buildTotals(sortedSessions),
    byDay: buildDailyTotals(sortedSessions),
    byProject: buildProjectTotals(sortedSessions),
    sessions: sortedSessions
  };
}

function buildTotals(sessions: UsageSession[]): TokenUsage {
  return sessions.reduce<TokenUsage>(
    (total, session) => addTokenUsage(total, session),
    emptyTokenUsage()
  );
}

function buildDailyTotals(sessions: UsageSession[]): UsageDay[] {
  const days = new Map<string, UsageDay>();

  for (const session of sessions) {
    const date = getLocalDateKey(session.startedAt);
    const current = days.get(date) ?? {
      date,
      sessionCount: 0,
      ...emptyTokenUsage()
    };

    const next = {
      ...addTokenUsage(current, session),
      date,
      sessionCount: current.sessionCount + 1
    };

    days.set(date, next);
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildProjectTotals(sessions: UsageSession[]): UsageProject[] {
  const projects = new Map<string, UsageProject>();
  const grandTotal = buildTotals(sessions).totalTokens;

  for (const session of sessions) {
    const projectPath = session.projectPath || "Unknown Project";
    const current = projects.get(projectPath) ?? {
      projectPath,
      projectName: session.projectName || getProjectName(projectPath),
      sessionCount: 0,
      lastActivityAt: session.endedAt,
      shareOfTotal: 0,
      ...emptyTokenUsage()
    };

    const lastActivityAt =
      new Date(session.endedAt).getTime() > new Date(current.lastActivityAt).getTime()
        ? session.endedAt
        : current.lastActivityAt;

    projects.set(projectPath, {
      ...addTokenUsage(current, session),
      projectPath,
      projectName: current.projectName,
      sessionCount: current.sessionCount + 1,
      lastActivityAt,
      shareOfTotal: 0
    });
  }

  return [...projects.values()]
    .map((project) => ({
      ...project,
      shareOfTotal: grandTotal > 0 ? project.totalTokens / grandTotal : 0
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}
