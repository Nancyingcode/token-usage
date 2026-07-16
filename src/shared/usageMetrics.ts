import type { UsageSession } from './usageTypes';

const TOKENS_PER_MILLION = 1_000_000;
const ESTIMATED_COST_PER_MILLION_TOKENS = 1.35;
const PERCENT_SCALE = 100;

export function estimateTokenCost(totalTokens: number): number {
  return (totalTokens / TOKENS_PER_MILLION) * ESTIMATED_COST_PER_MILLION_TOKENS;
}

export function getCachePercentage(inputTokens: number, cachedInputTokens: number): number {
  if (inputTokens <= 0) {
    return 0;
  }

  return Math.round((cachedInputTokens / inputTokens) * PERCENT_SCALE);
}

export function countSessionWarnings(sessions: UsageSession[]): number {
  return sessions.reduce((total, session) => total + session.warnings.length, 0);
}

export function getWarningRate(sessions: UsageSession[]): number {
  if (sessions.length === 0) {
    return 0;
  }

  return (countSessionWarnings(sessions) / sessions.length) * PERCENT_SCALE;
}
