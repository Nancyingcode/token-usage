import { describe, expect, it } from "vitest";
import {
  countSessionWarnings,
  estimateTokenCost,
  getCachePercentage,
  getWarningRate
} from "../src/shared/usageMetrics";
import type { UsageSession } from "../src/shared/usageTypes";

describe("usageMetrics", () => {
  it("estimates cost from total tokens", () => {
    expect(estimateTokenCost(1_000_000)).toBe(1.35);
  });

  it("calculates cache percentage and handles empty input", () => {
    expect(getCachePercentage(200, 50)).toBe(25);
    expect(getCachePercentage(0, 50)).toBe(0);
  });

  it("counts warnings and calculates their session rate", () => {
    const sessions = [makeSession(2), makeSession(0), makeSession(1)];

    expect(countSessionWarnings(sessions)).toBe(3);
    expect(getWarningRate(sessions)).toBe(100);
    expect(getWarningRate([])).toBe(0);
  });
});

function makeSession(warningCount: number): UsageSession {
  return {
    sessionId: `session-${warningCount}`,
    startedAt: "2026-07-16T00:00:00.000Z",
    endedAt: "2026-07-16T00:00:00.000Z",
    projectPath: "C:\\repo",
    projectName: "repo",
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
    eventCount: 0,
    sourceFile: `session-${warningCount}.jsonl`,
    warnings: Array.from({ length: warningCount }, () => ({ message: "warning" }))
  };
}
