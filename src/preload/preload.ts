import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("codexUsage", {
  scan: () => ipcRenderer.invoke("usage:scan")
});
