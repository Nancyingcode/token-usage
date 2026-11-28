/**
 * @file 会话模型与思考强度用量
 * @description 根据回合身份、上下文和请求增量归属用量，保留缺失字段和冲突证据。
 */
import type { SessionEffortUsage } from '../shared/usageTypes';
import { isRecord } from '../shared/runtimeTypes';

type Metrics = Pick<SessionEffortUsage, 'totalTokens' | 'reasoningOutputTokens'>;

type ContextValue = string | null | undefined;

interface EffortGroup {
  turnCount: number;
  usage?: Metrics;
}

const readLabel = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() || undefined : undefined;

// 字段无记录时仍可接受后续上下文，已冲突的字段不能由后续单条记录重新确认。
const mergeContextValue = (current: ContextValue, next: ContextValue): ContextValue => {
  if (current === undefined) return next;
  if (next === undefined || next === current) return current;
  return null;
};

const unknownLast = (first: string | null, second: string | null): number =>
  Number(first === null) - Number(second === null);

class EffortTurn {
  modelId: ContextValue;
  effort: ContextValue;
  firstStartLine?: number;
  ended = false;
  usage?: Metrics;

  recordContext(modelId: ContextValue, effort: ContextValue): void {
    this.modelId = mergeContextValue(this.modelId, modelId);
    this.effort = mergeContextValue(this.effort, effort);
  }
}

// total_tokens 与会话总计相同，仅累加已记录值。推理明细有缺口时无法给出整档的推理总数。
const addUsage = (current: Metrics | undefined, next: Metrics): Metrics => ({
  totalTokens:
    next.totalTokens === null
      ? (current?.totalTokens ?? null)
      : (current?.totalTokens ?? 0) + next.totalTokens,
  reasoningOutputTokens:
    current?.reasoningOutputTokens === null || next.reasoningOutputTokens === null
      ? null
      : (current?.reasoningOutputTokens ?? 0) + next.reasoningOutputTokens,
});

export const getRecordedEffortMetrics = (raw: unknown): Metrics => ({
  totalTokens: isRecord(raw) && typeof raw.total_tokens === 'number' ? raw.total_tokens : null,
  reasoningOutputTokens:
    isRecord(raw) && typeof raw.reasoning_output_tokens === 'number'
      ? raw.reasoning_output_tokens
      : null,
});

export const createSessionEffortUsage = () => {
  // 同一回合可能重复写入上下文，甚至在后面出现矛盾值。按回合保留小计，解析结束后再分档。
  const turns = new Map<string | symbol, EffortTurn>();
  let startedKey: string | symbol | undefined;
  let requestTurn: EffortTurn | undefined;
  let unknownUsage: Metrics | undefined;

  const getTurn = (key: string | symbol): EffortTurn => {
    let turn = turns.get(key);
    if (!turn) {
      turn = new EffortTurn();
      turns.set(key, turn);
    }
    return turn;
  };

  const resolveTurn = (id?: string): EffortTurn | undefined => {
    if (id === undefined) {
      return startedKey === undefined ? undefined : getTurn(startedKey);
    }
    // 部分记录到上下文、用量或终止事件才提供 ID；一旦身份明确应按同一轮计数。
    if (typeof startedKey === 'symbol') {
      const anonymous = getTurn(startedKey);
      turns.delete(startedKey);
      startedKey = id;
      const existing = turns.get(id);
      if (!existing) {
        turns.set(id, anonymous);
      } else {
        existing.recordContext(anonymous.modelId, anonymous.effort);
        existing.firstStartLine ??= anonymous.firstStartLine;
        if (anonymous.usage) existing.usage = addUsage(existing.usage, anonymous.usage);
        if (requestTurn === anonymous) requestTurn = existing;
      }
    }
    return getTurn(id);
  };

  const resetBoundary = (): void => {
    startedKey = undefined;
    requestTurn = undefined;
  };

  return {
    resetBoundary,
    start(id: string | undefined, line: number): void {
      startedKey = id ?? Symbol();
      const turn = getTurn(startedKey);
      turn.firstStartLine ??= line;
      if (requestTurn !== turn || turn.ended) requestTurn = undefined;
      turn.ended = false;
    },
    context(id: string | undefined, rawModel: unknown, rawEffort: unknown): void {
      const turn = resolveTurn(id);
      turn?.recordContext(readLabel(rawModel), readLabel(rawEffort));
      // 上下文可独立标识一轮。若显式的开始事件与上下文不一致，紧随其后的用量没有唯一归属。
      const mismatchedStart = startedKey !== undefined && id !== undefined && startedKey !== id;
      requestTurn = turn && !turn.ended && !mismatchedStart ? turn : undefined;
    },
    end(id?: string): void {
      const active = startedKey === undefined ? requestTurn : getTurn(startedKey);
      const previous = id === undefined ? undefined : turns.get(id);
      // 已结束回合的重复通知可能穿插在下一轮中，此时仍应使用下一轮的上下文。
      if (previous?.ended && previous !== active) return;
      const turn = resolveTurn(id) ?? requestTurn;
      if (turn) turn.ended = true;
      if (requestTurn !== turn) requestTurn = undefined;
      startedKey = undefined;
    },
    increment(id: string | undefined, usage: Metrics): void {
      if (id !== undefined && typeof startedKey === 'symbol' && !turns.has(id)) {
        resolveTurn(id);
      }
      // 结束后迟到的用量仍可携带本轮 ID；只有显式匹配才跨越结束事件，新的回合或元数据会解除关联。
      const matchesContext = id === undefined ? !requestTurn?.ended : turns.get(id) === requestTurn;
      if (requestTurn && matchesContext) {
        requestTurn.usage = addUsage(requestTurn.usage, usage);
      } else {
        unknownUsage = addUsage(unknownUsage, usage);
      }
    },
    finish(aggregate?: Metrics): {
      reasoningEfforts: SessionEffortUsage[];
      turnStartLines: Array<number | undefined>;
    } {
      const groups = new Map<string | null, Map<string | null, EffortGroup>>();
      const turnStartLines: Array<number | undefined> = [];
      const collect = (
        modelId: string | null,
        effort: string | null,
        count: number,
        usage?: Metrics
      ): void => {
        const efforts = groups.get(modelId) ?? new Map<string | null, EffortGroup>();
        const group = efforts.get(effort) ?? { turnCount: 0 };
        group.turnCount += count;
        if (usage) group.usage = addUsage(group.usage, usage);
        efforts.set(effort, group);
        groups.set(modelId, efforts);
      };
      for (const turn of turns.values()) {
        collect(turn.modelId ?? null, turn.effort ?? null, 1, turn.usage);
        turnStartLines.push(turn.firstStartLine);
      }
      // 累计回退包含多个回合，只能成为“未知”用量；所在记录的上下文仅标识最后一轮。
      const unassigned = aggregate ?? unknownUsage;
      if (unassigned) collect(null, null, 0, unassigned);
      const reasoningEfforts = Array.from(groups)
        .sort(([first], [second]) => unknownLast(first, second))
        .flatMap(([modelId, efforts]) =>
          Array.from(efforts, ([effort, { turnCount, usage }]) => ({
            modelId,
            effort,
            turnCount,
            totalTokens: usage?.totalTokens ?? null,
            reasoningOutputTokens: usage?.reasoningOutputTokens ?? null,
          })).sort((first, second) => unknownLast(first.effort, second.effort))
        );
      return { reasoningEfforts, turnStartLines };
    },
  };
};
