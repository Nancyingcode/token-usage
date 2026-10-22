/**
 * @file 更新退出授权
 * @description updater 在异步启动安装器后排定退出，已收到失败时必须阻止这一次退出，保留后续正常退出。
 * 上游能自行取消失败后排定的退出时，可移除更新退出标记；安装准备期间的退出保护仍须保留。
 */
import type { AppUpdatePhase } from '../shared/appUpdateTypes';

export const createAppUpdateQuitGuard = (getPhase: () => AppUpdatePhase | undefined) => {
  // 每个应用进程拥有一个标记，只在上游更新退出事件设置，并由紧随其后的退出请求消费。
  let updateQuitRequested = false;
  return {
    markUpdateQuit: (): void => {
      updateQuitRequested = true;
    },
    preventQuit: (): boolean => {
      const wasUpdateQuit = updateQuitRequested;
      updateQuitRequested = false;
      const phase = getPhase();
      return phase === 'preparing' || (wasUpdateQuit && phase !== 'installing');
    },
  };
};
