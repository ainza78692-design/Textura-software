import { ipcMain, app, shell } from "electron";
import path from "path";
import os from "os";
import fs from "fs";
import crypto from "crypto";

// Helper to calculate SHA-256 of a file
async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const data = await fs.promises.readFile(filePath);
  hash.update(data);
  return hash.digest("hex");
}

// Custom simple semver comparison: e.g. "1.0.7" > "1.0.6"
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export function setupAutoUpdater() {
  // 1. Check for updates
  ipcMain.handle("textura:check-for-updates", async (_event, manifestUrl: string) => {
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch manifest: ${response.statusText}`);
      }
      
      const manifest = await response.json();
      const currentVersion = app.getVersion();
      const latestVersion = manifest.latestVersion || manifest.version;
      
      const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
      
      // Determine if the update is mandatory
      let mandatory = Boolean(manifest.mandatory);
      if (manifest.minimumSupportedVersion && compareVersions(currentVersion, manifest.minimumSupportedVersion) < 0) {
        mandatory = true;
      }

      return { 
        currentVersion, 
        updateAvailable, 
        mandatory, 
        manifest 
      };
    } catch (error) {
      console.error("Auto-updater: Failed to check for updates", error);
      return { updateAvailable: false, error: String(error) };
    }
  });

  // 2. Download the update to a temp folder
  ipcMain.handle("textura:download-update", async (_event, manifest) => {
    let targetPath = "";
    try {
      const fileName = path.basename(new URL(manifest.installerUrl).pathname) || "Textura-Setup.exe";
      targetPath = path.join(os.tmpdir(), fileName);
      
      console.log(`Auto-updater: Downloading ${manifest.installerUrl} to ${targetPath}`);
      
      const response = await fetch(manifest.installerUrl);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to download installer: ${response.statusText}`);
      }
      
      // Load file into memory and write to disk (assuming installer is ~50-100MB)
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.promises.writeFile(targetPath, buffer);
      
      console.log("Auto-updater: Download complete. Verifying SHA-256...");

      const actualHash = await sha256File(targetPath);
      if (actualHash.toLowerCase() !== manifest.sha256.toLowerCase()) {
        throw new Error(`SHA-256 verification failed! Expected: ${manifest.sha256}, Got: ${actualHash}`);
      }

      console.log("Auto-updater: Verification successful.");
      return { filePath: targetPath };
    } catch (error) {
      console.error("Auto-updater: Download failed", error);
      if (targetPath && fs.existsSync(targetPath)) {
        await fs.promises.rm(targetPath, { force: true });
      }
      throw error;
    }
  });

  // 3. Launch installer and quit
  ipcMain.handle("textura:install-update", async (_event, filePath: string) => {
    console.log(`Auto-updater: Launching installer at ${filePath}`);
    const error = await shell.openPath(filePath);
    if (error) {
      console.error(`Auto-updater: Failed to open installer: ${error}`);
      throw new Error(error);
    }
    
    // Give the OS a brief moment to start the executable before we kill the app
    setTimeout(() => {
      app.quit();
    }, 1000);
  });
}
