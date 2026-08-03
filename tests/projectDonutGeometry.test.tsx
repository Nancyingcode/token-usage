/**
 * @file Project donut geometry tests
 * @description Verifies immutable token-share geometry for renderer project donut segments.
 */

import { describe, expect, it } from 'vitest';
import { buildProjectDonutSegments } from '../src/renderer/components/ProjectsView';
import type { UsageProject } from '../src/shared/usageTypes';

const makeProject = (projectName: string, totalTokens: number): UsageProject => ({
  projectPath: `C:\\${projectName}`,
  projectName,
  sessionCount: 1,
  lastActivityAt: '2026-08-04T10:00:00.000Z',
  inputTokens: totalTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens,
  shareOfTotal: 0,
});

describe('buildProjectDonutSegments', () => {
  it('calculates token shares and cumulative offsets without mutating projects', () => {
    const projects = [makeProject('alpha', 300), makeProject('beta', 100)];
    const snapshot = structuredClone(projects);

    const segments = buildProjectDonutSegments(projects);

    expect(
      segments.map(({ percentage, startPercentage, toneIndex }) => ({
        percentage,
        startPercentage,
        toneIndex,
      }))
    ).toEqual([
      { percentage: 75, startPercentage: 0, toneIndex: 1 },
      { percentage: 25, startPercentage: 75, toneIndex: 2 },
    ]);
    expect(segments[0]?.tooltipXPercent).toBeGreaterThan(50);
    expect(segments[0]?.tooltipYPercent).toBeGreaterThan(50);
    expect(segments[1]?.tooltipXPercent).toBeLessThan(50);
    expect(segments[1]?.tooltipYPercent).toBeLessThan(50);
    expect(projects).toEqual(snapshot);
  });

  it('omits non-interactive segments when the total is zero', () => {
    expect(buildProjectDonutSegments([makeProject('empty', 0)])).toEqual([]);
  });
});
