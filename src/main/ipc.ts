import { ipcMain } from 'electron';
import { USAGE_SCAN_CHANNEL } from '../shared/ipcChannels';
import { scanCodexUsage } from './usageScanner';

const registerUsageIpc = (): void => {
  ipcMain.handle(USAGE_SCAN_CHANNEL, () => scanCodexUsage());
};

export default registerUsageIpc;
