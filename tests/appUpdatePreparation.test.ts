/** @file 安装前暂停顺序与失败恢复回归。 */
import { describe, expect, it, vi } from 'vitest';
import { createAppUpdatePreparation } from '../src/main/appUpdatePreparation';

describe('app update preparation', () => {
  it('finishes existing IPC before pausing its scan dependencies', async () => {
    const order: string[] = [];
    const participant = (name: string) => ({
      pause: () => {
        order.push(`pause-${name}`);
        return () => {
          order.push(`resume-${name}`);
        };
      },
      drain: async () => {
        order.push(`drain-${name}`);
      },
    });
    const prepare = createAppUpdatePreparation(
      participant('ipc'),
      participant('pricing'),
      participant('app')
    );
    const resume = await prepare();
    expect(order).toEqual([
      'pause-ipc',
      'drain-ipc',
      'pause-pricing',
      'pause-app',
      'drain-pricing',
      'drain-app',
    ]);
    resume();
    resume();
    expect(order.slice(6)).toEqual(['resume-app', 'resume-pricing', 'resume-ipc']);
  });

  it('waits for both participants and restores all paused work after failure', async () => {
    const restore = vi.fn();
    const gate = { pause: () => restore, drain: async () => undefined };
    const pricing = {
      pause: () => restore,
      drain: async () => {
        throw new Error('save failed');
      },
    };
    const app = { pause: () => restore, drain: vi.fn().mockResolvedValue(undefined) };
    await expect(createAppUpdatePreparation(gate, pricing, app)()).rejects.toThrow('save failed');
    expect(app.drain).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledTimes(3);
  });

  it('treats a rejection without a reason as a failed save', async () => {
    const restore = vi.fn();
    const gate = { pause: () => restore, drain: async () => undefined };
    const pricing = { pause: () => restore, drain: () => Promise.reject(undefined) };
    await expect(createAppUpdatePreparation(gate, pricing, gate)()).rejects.toBeUndefined();
    expect(restore).toHaveBeenCalledTimes(3);
  });
});
