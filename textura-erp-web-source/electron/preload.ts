import { contextBridge, ipcRenderer } from "electron";

export const texturaDesktopAPI = {
  checkForUpdates: (manifestUrl: string) => ipcRenderer.invoke("textura:check-for-updates", manifestUrl),
  downloadUpdate: (manifest: any) => ipcRenderer.invoke("textura:download-update", manifest),
  installUpdate: (filePath: string) => ipcRenderer.invoke("textura:install-update", filePath),
};

contextBridge.exposeInMainWorld("texturaDesktop", texturaDesktopAPI);
