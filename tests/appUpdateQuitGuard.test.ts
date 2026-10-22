/** @file 防止安装启动失败后仍执行上游排定的退出。 */
import { describe, expect, it } from 'vitest';
import type { AppUpdatePhase } from '../src/shared/appUpdateTypes';
import { createAppUpdateQuitGuard } from '../src/main/appUpdateQuitGuard';

describe('update quit coordination', () => {
  it('cancels a queued updater quit after startup failure without blocking later normal exit', () => {
    let phase: AppUpdatePhase = 'installing';
    const guard = createAppUpdateQuitGuard(() => phase);
    phase = 'error';
    guard.markUpdateQuit();
    expect(guard.preventQuit()).toBe(true);
    expect(guard.preventQuit()).toBe(false);
  });

  it('keeps saving work alive and permits the authorized updater handoff after saving', () => {
    let phase: AppUpdatePhase = 'preparing';
    const guard = createAppUpdateQuitGuard(() => phase);
    expect(guard.preventQuit()).toBe(true);
    phase = 'installing';
    guard.markUpdateQuit();
    expect(guard.preventQuit()).toBe(false);
  });
});
