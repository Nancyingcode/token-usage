/** @file 业务 IPC 协议失败与安装门禁回归，使用内存操作模拟保存。 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { createAppOperationGate } from '../src/main/appOperationGate';
import { createOperationHandler } from '../src/main/ipcOperationHandler';

const ipc = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: ipc }));

const register = (operation: () => unknown) => {
  const gate = createAppOperationGate();
  createOperationHandler(gate)('fixture:operation', operation);
  const invoke = ipc.handle.mock.calls[0]![1] as (event: IpcMainInvokeEvent) => Promise<unknown>;
  return { gate, invoke: () => invoke({} as IpcMainInvokeEvent) };
};

describe('IPC operation update gate', () => {
  beforeEach(() => ipc.handle.mockClear());

  it.each([
    { ok: false, error: { kind: 'unexpected', message: 'Save failed.', issues: [] } },
    { ok: false, error: { code: 'unexpected' } },
  ])(
    'blocks installation for a failed save while preserving its IPC response',
    async (response) => {
      let complete!: (value: typeof response) => void;
      const { gate, invoke } = register(
        () =>
          new Promise<typeof response>((resolve) => {
            complete = resolve;
          })
      );
      const operation = invoke();
      const resume = gate.pause();
      const draining = gate.drain();
      complete(response);
      await expect(operation).resolves.toBe(response);
      await expect(draining).rejects.toThrow('operation');
      resume();
      await expect(gate.run(() => 'recovered')).resolves.toBe('recovered');
    }
  );

  it.each([
    { ok: true, value: 'saved' },
    { phase: 'partial', report: { failures: [{ message: 'Invalid compressed source.' }] } },
    { phase: 'error', report: { failures: [{ message: 'Invalid compressed source.' }] } },
  ])(
    'preserves successful operations and does not reinterpret parser reports',
    async (response) => {
      const { gate, invoke } = register(async () => response);
      const operation = invoke();
      gate.pause();
      await expect(operation).resolves.toBe(response);
      await expect(gate.drain()).resolves.toBeUndefined();
    }
  );

  it('preserves exceptions and prevents invoking new work while paused', async () => {
    const failure = new Error('fixture disk full');
    const operation = vi.fn(async () => {
      throw failure;
    });
    const { gate, invoke } = register(operation);
    const result = invoke();
    gate.pause();
    await expect(result).rejects.toBe(failure);
    await expect(gate.drain()).rejects.toBe(failure);
    await expect(invoke()).rejects.toThrow('preparing');
    expect(operation).toHaveBeenCalledOnce();
  });
});
