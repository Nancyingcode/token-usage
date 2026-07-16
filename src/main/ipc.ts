import { ipcMain } from 'electron';
import { scanCodexUsage } from './usageScanner';

export default function registerUsageIpc(): void {
  ipcMain.handle('usage:scan', () => scanCodexUsage());
}
