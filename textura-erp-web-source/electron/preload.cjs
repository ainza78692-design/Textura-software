const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("texturaDesktop", {
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  checkForUpdates: (serverOrigin) => ipcRenderer.invoke("updates:check", serverOrigin),
});
