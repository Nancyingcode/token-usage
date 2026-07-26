import { describe, expect, it } from 'vitest';
import {
  applyUsageChangeSet,
  createEmptyCostOptimizationIndex,
} from '../src/shared/costOptimizationIndex';
import { FIXED_NOW, makeSourceChange } from './helpers/costOptimizationFixtures';

describe('cost optimization index', () => {
  it('reverses old contributions before applying a changed source', () => {
    const empty = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);
    const first = applyUsageChangeSet(
      empty,
      {
        upserted: [makeSourceChange('usage.jsonl', '1', 100)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const changed = applyUsageChangeSet(
      first,
      {
        upserted: [makeSourceChange('usage.jsonl', '2', 250)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );

    expect(
      Object.values(changed.dayModelBuckets).reduce(
        (total, bucket) => total + bucket.totalTokens,
        0
      )
    ).toBe(250);
    expect(changed.sources['usage.jsonl'].fingerprint).toBe('2');
  });

  it('removes source contributions and zero buckets', () => {
    const indexed = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: [makeSourceChange('usage.jsonl', '1', 100)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const removed = applyUsageChangeSet(
      indexed,
      {
        upserted: [],
        removedSourceFiles: ['usage.jsonl'],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );

    expect(removed.sources).toEqual({});
    expect(removed.dayModelBuckets).toEqual({});
    expect(removed.projectDayModelBuckets).toEqual({});
    expect(removed.sessionModelBuckets).toEqual({});
  });

  it('does not mutate the previous index while applying changes', () => {
    const empty = createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW);
    const changed = applyUsageChangeSet(
      empty,
      {
        upserted: [makeSourceChange('usage.jsonl', '1', 100)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );

    expect(empty.sources).toEqual({});
    expect(empty.dayModelBuckets).toEqual({});
    expect(changed.sources).not.toBe(empty.sources);
  });

  it('drops sources absent from a requested full rebuild', () => {
    const indexed = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: [
          makeSourceChange('keep.jsonl', '1', 100),
          makeSourceChange('drop.jsonl', '1', 200),
        ],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const rebuilt = applyUsageChangeSet(
      indexed,
      {
        upserted: [makeSourceChange('keep.jsonl', '2', 300)],
        removedSourceFiles: [],
        requiresFullRebuild: true,
      },
      FIXED_NOW
    );

    expect(Object.keys(rebuilt.sources)).toEqual(['keep.jsonl']);
    expect(
      Object.values(rebuilt.dayModelBuckets).reduce(
        (total, bucket) => total + bucket.totalTokens,
        0
      )
    ).toBe(300);
  });

  it('returns the same index for an empty change set', () => {
    const indexed = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: [makeSourceChange('usage.jsonl', '1', 100)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );

    const unchanged = applyUsageChangeSet(
      indexed,
      {
        upserted: [],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      new Date(FIXED_NOW.getTime() + 1)
    );

    expect(unchanged).toBe(indexed);
  });

  it('preserves untouched bucket references during a single-source replacement', () => {
    const earlierSource = makeSourceChange('earlier.jsonl', '1', 100);
    earlierSource.session.startedAt = '2026-07-23T12:00:00.000Z';
    earlierSource.session.endedAt = '2026-07-23T12:00:00.000Z';
    earlierSource.session.usageSlices[0].occurredAt = '2026-07-23T12:00:00.000Z';
    const indexed = applyUsageChangeSet(
      createEmptyCostOptimizationIndex('C:\\sessions', FIXED_NOW),
      {
        upserted: [earlierSource, makeSourceChange('latest.jsonl', '1', 200)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );
    const untouchedBucket = Object.values(indexed.dayModelBuckets).find(
      ({ date }) => date === '2026-07-23'
    );
    const touchedBucket = Object.values(indexed.dayModelBuckets).find(
      ({ date }) => date === '2026-07-24'
    );

    const changed = applyUsageChangeSet(
      indexed,
      {
        upserted: [makeSourceChange('latest.jsonl', '2', 300)],
        removedSourceFiles: [],
        requiresFullRebuild: false,
      },
      FIXED_NOW
    );

    expect(Object.values(changed.dayModelBuckets).find(({ date }) => date === '2026-07-23')).toBe(
      untouchedBucket
    );
    expect(
      Object.values(changed.dayModelBuckets).find(({ date }) => date === '2026-07-24')
    ).not.toBe(touchedBucket);
  });
});
