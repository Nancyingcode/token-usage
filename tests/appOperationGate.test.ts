/** @file 更新退出前的业务操作门禁测试。 */
import { describe, expect, it, vi } from 'vitest';
import { createAppOperationGate } from '../src/main/appOperationGate';

describe('update operation gate', () => {
  it('rejects new work while waiting for an already running save', async () => {
    const gate = createAppOperationGate();
    let finish!: () => void;
    const work = gate.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const resume = gate.pause();
    const next = vi.fn();
    await expect(gate.run(next)).rejects.toThrow();
    const drained = vi.fn();
    const waiting = gate.drain().then(drained);
    await Promise.resolve();
    expect(drained).not.toHaveBeenCalled();
    finish();
    await work;
    await waiting;
    resume();
    await gate.run(next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('reports an in-flight failure and can resume after failed preparation', async () => {
    const gate = createAppOperationGate();
    let fail!: (reason: Error) => void;
    const work = gate.run(
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        })
    );
    const handled = work.catch(() => undefined);
    const resume = gate.pause();
    const waiting = gate.drain();
    fail(new Error('disk full'));
    await expect(waiting).rejects.toThrow('disk full');
    await handled;
    resume();
    await expect(gate.run(() => 'recovered')).resolves.toBe('recovered');
  });

  it('does not mistake a rejection without a reason for a successful save', async () => {
    const gate = createAppOperationGate();
    const work = gate.run(() => Promise.reject(undefined));
    const handled = work.catch(() => undefined);
    gate.pause();
    await expect(gate.drain()).rejects.toBeUndefined();
    await handled;
  });
});
