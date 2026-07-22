import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Overview, { buildTrendPoints } from '../src/renderer/components/Overview';
import type { CostEstimate, ModelPricingEntry } from '../src/shared/budgetTypes';
import { buildUsageSummary } from '../src/shared/usageMath';
import type { UsageDay, UsageSession } from '../src/shared/usageTypes';

describe('buildTrendPoints', () => {
  it('maps boundaries, cost, and placement for chart points', () => {
    const dailyCosts = new Map<string, CostEstimate>([
      ['2026-07-14', { pricedCostUsd: 0.25, unpricedTokens: 0, unpricedModelIds: [] }],
    ]);
    const points = buildTrendPoints(
      [makeDay('2026-07-14', 100), makeDay('2026-07-15', 50), makeDay('2026-07-16', 25)],
      100,
      dailyCosts
    );

    expect(points.map(({ x }) => x)).toEqual([24, 292, 560]);
    expect(points.map(({ placement }) => placement)).toEqual(['left', 'center', 'right']);
    expect(points[0].y).toBe(42);
    expect(points[0].cost).toBe(0.25);
    expect(points[0].pricingIncomplete).toBe(false);
    expect(points[1].pricingIncomplete).toBe(false);
    expect(points[0].day.inputTokens).toBe(60);
    expect(points[0].day.outputTokens).toBe(25);
    expect(points[0].day.cachedInputTokens).toBe(15);
  });

  it('returns no points for an empty period', () => {
    expect(buildTrendPoints([], 1, new Map())).toEqual([]);
  });

  it('renders model-priced total cost and incomplete pricing state', () => {
    const markup = renderToStaticMarkup(
      <Overview summary={buildUsageSummary([PRICED_SESSION, UNKNOWN_SESSION])} pricing={PRICING} />
    );

    expect(markup).toContain('$0.0003');
    expect(markup).toContain('Pricing incomplete');
  });
});

const PRICING: ModelPricingEntry[] = [
  {
    modelId: 'gpt-test',
    aliases: [],
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 10,
    effectiveAt: '2026-07-20',
    sourceKind: 'built-in',
  },
];

const makeSession = (sessionId: string, modelId: string | undefined): UsageSession => ({
  sessionId,
  startedAt: '2026-07-20T10:00:00.000Z',
  endedAt: '2026-07-20T10:00:00.000Z',
  projectPath: 'C:\\repo',
  projectName: 'repo',
  usageSlices: [
    {
      occurredAt: '2026-07-20T10:00:00.000Z',
      modelId,
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 10,
      reasoningOutputTokens: 2,
      totalTokens: 110,
    },
  ],
  inputTokens: 100,
  cachedInputTokens: 0,
  outputTokens: 10,
  reasoningOutputTokens: 2,
  totalTokens: 110,
  eventCount: 1,
  sourceFile: `${sessionId}.jsonl`,
  warnings: [],
});

const PRICED_SESSION = makeSession('priced', 'gpt-test');
const UNKNOWN_SESSION = makeSession('unknown', undefined);

const makeDay = (date: string, totalTokens: number): UsageDay => ({
  date,
  inputTokens: 60,
  cachedInputTokens: 15,
  outputTokens: 25,
  reasoningOutputTokens: 10,
  totalTokens,
  sessionCount: 1,
});
