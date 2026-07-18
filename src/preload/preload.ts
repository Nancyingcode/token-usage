import { contextBridge, ipcRenderer } from 'electron';
import { USAGE_SCAN_CHANNEL } from '../shared/ipcChannels';

contextBridge.exposeInMainWorld('codexUsage', {
  scan: () => ipcRenderer.invoke(USAGE_SCAN_CHANNEL),
});
