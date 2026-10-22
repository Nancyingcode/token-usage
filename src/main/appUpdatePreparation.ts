/**
 * @file 安装前数据排空协调
 * @description 已开始的目录切换仍需扫描才能完成；先关闭 IPC 并等待它们，再暂停后台生产与等待保存。
 */
interface PausableWork {
  pause: () => () => void;
  drain: () => Promise<void>;
}

export const createAppUpdatePreparation =
  (
    gate: PausableWork,
    pricing: PausableWork,
    application: PausableWork
  ): (() => Promise<() => void>) =>
  async () => {
    const restorers: Array<() => void> = [gate.pause()];
    let restored = false;
    const resume = (): void => {
      if (restored) return;
      restored = true;
      restorers.reverse().forEach((restore) => restore());
    };
    try {
      await gate.drain();
      restorers.push(pricing.pause(), application.pause());
      // 价格更新可能追加预算与成本保存，必须先收尾价格任务，再排空应用分析。
      let pricingFailure: { error: unknown } | undefined;
      try {
        await pricing.drain();
      } catch (error) {
        pricingFailure = { error };
      }
      await application.drain();
      if (pricingFailure) throw pricingFailure.error;
      return resume;
    } catch (error) {
      resume();
      throw error;
    }
  };
