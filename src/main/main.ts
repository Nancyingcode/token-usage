import { app, BrowserWindow, Menu } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerUsageIpc } from "./ipc";
import { getApplicationMenuPolicy } from "./menuPolicy";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function createWindow(): void {
  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#f8f7f4",
    autoHideMenuBar: menuPolicy.autoHideMenuBar,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerUsageIpc();

  const menuPolicy = getApplicationMenuPolicy(app.isPackaged);
  if (menuPolicy.removeApplicationMenu) {
    Menu.setApplicationMenu(null);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
