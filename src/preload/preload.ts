import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("codexUsage", {
  scan: async () => {
    throw new Error("Usage scanner is not wired yet.");
  }
});
