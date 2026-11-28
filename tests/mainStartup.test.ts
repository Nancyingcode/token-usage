/** @file 检查 Electron 就绪前主进程入口加载的运行时依赖。 */
import { expect, it, vi } from 'vitest';
import '../src/main/main';

const { loadUpdater } = vi.hoisted(() => ({ loadUpdater: vi.fn() }));
vi.mock('electron', () => ({
  app: { on: vi.fn(), whenReady: () => new Promise<void>(() => undefined) },
  autoUpdater: { on: vi.fn() },
}));
vi.mock('electron-updater', () => {
  loadUpdater();
  return { default: { NsisUpdater: class {} } };
});

it('loads the application entry without evaluating the optional updater', () => {
  expect(loadUpdater).not.toHaveBeenCalled();
});
