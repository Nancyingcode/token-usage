/**
 * @file 线程速度设置历史与用量
 * @description 汇总线程设置下记录的用量。速度设置仅描述线程配置。
 */
import { isRecord } from '../shared/runtimeTypes';
import type { SessionSpeedUsage, ThreadSpeedChange, ThreadSpeedCounts } from '../shared/usageTypes';

interface SpeedChangePosition extends ThreadSpeedChange {
  line: number;
  tokensBefore: number;
}

interface SpeedUsageInput {
  totalTokens: number;
  hasIncrementalUsage: boolean;
  turnStartLines: Array<number | undefined>;
}

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const getThreadSpeed = (tier: string | null | undefined) => (tier === 'priority' ? 'fast' : tier);

const getSpeedBucket = (tier: string | null | undefined): keyof ThreadSpeedCounts => {
  const speed = getThreadSpeed(tier);
  if (speed === 'default') return 'standard';
  if (speed === 'fast' || speed === 'ultrafast') return speed;
  return 'unknown';
};

const emptySpeedCounts = (): ThreadSpeedCounts => ({
  standard: 0,
  fast: 0,
  ultrafast: 0,
  unknown: 0,
});

const getTurnStartBucket = (
  changes: SpeedChangePosition[],
  line: number | undefined
): keyof ThreadSpeedCounts => {
  if (line === undefined) return 'unknown';
  // 回合与快照可能共享时间戳，最近的设置由文件行序确定。
  let start = 0;
  let end = changes.length;
  while (start < end) {
    const middle = Math.floor((start + end) / 2);
    if (changes[middle].line < line) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return getSpeedBucket(changes[start - 1]?.serviceTier);
};

export const createThreadSpeedHistory = (rolloutId: string | undefined) => {
  const metadataIds = new Set<string>();
  const changesByThread = new Map<string, SpeedChangePosition[]>();

  const observe = (
    {
      type,
      payload,
      timestamp,
    }: {
      type?: string;
      payload?: Record<string, unknown>;
      timestamp?: string;
    },
    line: number,
    tokensBefore: number
  ): void => {
    if (type === 'session_meta' && !rolloutId) {
      // 重命名后的文件可能含有继承的元数据，直到文件结束才能确认身份是否唯一。
      for (const candidate of [payload?.session_id, payload?.id]) {
        const id = readString(candidate);
        if (id) {
          metadataIds.add(id);
        }
      }
      return;
    }

    if (type !== 'event_msg' || payload?.type !== 'thread_settings_applied') {
      return;
    }

    const threadId = readString(payload.thread_id);
    if (!threadId || (rolloutId && threadId !== rolloutId) || !isRecord(payload.thread_settings)) {
      return;
    }

    const serviceTier = readString(payload.thread_settings.service_tier);
    const changes = changesByThread.get(threadId) ?? [];
    if (getThreadSpeed(changes.at(-1)?.serviceTier) === getThreadSpeed(serviceTier)) {
      return;
    }

    const occurredAt = timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
    changes.push({ serviceTier, occurredAt, line, tokensBefore });
    changesByThread.set(threadId, changes);
  };

  const finish = ({
    totalTokens,
    hasIncrementalUsage,
    turnStartLines,
  }: SpeedUsageInput): { speedHistory: ThreadSpeedChange[]; speedUsage: SessionSpeedUsage } => {
    // 分叉文件中最近的元数据可能来自父线程；标准 rollout 文件名直接标识所属线程。
    const owner =
      rolloutId ?? (metadataIds.size === 1 ? metadataIds.values().next().value : undefined);
    const changes = (owner ? changesByThread.get(owner) : undefined) ?? [];
    const tokens = emptySpeedCounts();
    // 快照之间的差值只包含已计入会话的增量。只有累计总量时没有分段依据。
    let bucket: keyof ThreadSpeedCounts = 'unknown';
    let previousTotal = 0;
    if (hasIncrementalUsage) {
      for (const change of changes) {
        tokens[bucket] += change.tokensBefore - previousTotal;
        bucket = getSpeedBucket(change.serviceTier);
        previousTotal = change.tokensBefore;
      }
    }
    tokens[bucket] += totalTokens - previousTotal;

    const turns = emptySpeedCounts();
    for (const startLine of turnStartLines) {
      turns[getTurnStartBucket(changes, startLine)] += 1;
    }

    return {
      speedHistory: changes.map(({ occurredAt, serviceTier }) => ({ occurredAt, serviceTier })),
      speedUsage: { tokens, turns },
    };
  };

  return { observe, finish };
};
