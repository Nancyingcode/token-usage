/**
 * @file 线程速度设置历史
 * @description 从线程设置快照保留首次观测和变化。每次解析独立收集，速度仅描述线程配置。
 */
import { isRecord } from '../shared/runtimeTypes';
import { getRolloutSessionId } from '../shared/sessionId';
import type { ThreadSpeedChange } from '../shared/usageTypes';

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const getThreadSpeed = (tier: string | null | undefined) => (tier === 'priority' ? 'fast' : tier);

export const createThreadSpeedHistory = (sourceFile: string) => {
  const rolloutId = getRolloutSessionId(sourceFile);
  const metadataIds = new Set<string>();
  const changesByThread = new Map<string, ThreadSpeedChange[]>();

  const observe = (
    type: string | undefined,
    payload: Record<string, unknown> | undefined,
    timestamp: string | undefined
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
    changes.push({ serviceTier, occurredAt });
    changesByThread.set(threadId, changes);
  };

  const finish = (): ThreadSpeedChange[] => {
    // 分叉文件中最近的元数据可能来自父线程；标准 rollout 文件名直接标识所属线程。
    const owner =
      rolloutId ?? (metadataIds.size === 1 ? metadataIds.values().next().value : undefined);
    return owner ? (changesByThread.get(owner) ?? []) : [];
  };

  return { observe, finish };
};
