import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { createPricingSyncService } from '../src/main/pricingSyncService';
import { catalogFixture } from './helpers/pricingFixture';
import { decodePricingCatalog } from '../src/shared/pricingCatalog';
import {
  PRICING_GET_CHANNEL,
  PRICING_REFRESH_CHANNEL,
  PRICING_SET_AUTO_CHANNEL,
  PRICING_UPDATED_CHANNEL,
} from '../src/shared/ipcChannels';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  removeHandler: vi.fn(),
}));
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(channel, handler),
    removeHandler: mocks.removeHandler,
  },
}));
import { registerPricingIpc } from '../src/main/pricingIpc';

describe('pricing IPC', () => {
  it('validates preference input, broadcasts updates and releases handlers', async () => {
    const service = createPricingSyncService({
      store: { load: async () => ({ autoUpdate: true }), save: async () => undefined },
      builtIn: [],
      applyPrices: () => undefined,
      download: async () => decodePricingCatalog(catalogFixture()),
    });
    await service.initialize();
    const send = vi.fn();
    const dispose = registerPricingIpc(
      service,
      () => ({ isDestroyed: () => false, webContents: { send } }) as unknown as BrowserWindow
    );
    expect(mocks.handlers.get(PRICING_GET_CHANNEL)?.()).toMatchObject({ autoUpdate: true });
    await expect(mocks.handlers.get(PRICING_SET_AUTO_CHANNEL)?.({}, 'false')).rejects.toThrow();
    await mocks.handlers.get(PRICING_REFRESH_CHANNEL)?.();
    expect(send).toHaveBeenCalledWith(
      PRICING_UPDATED_CHANNEL,
      expect.objectContaining({ status: 'ready' })
    );
    dispose();
    expect(mocks.removeHandler).toHaveBeenCalledWith(PRICING_REFRESH_CHANNEL);
    send.mockClear();
    await service.setAutoUpdate(false);
    expect(send).not.toHaveBeenCalled();
    service.destroy();
  });
});
