const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

function compareVersions(a, b) {
  const left = String(a)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b)
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function resolveUpdateUrl(serverOrigin, value) {
  return new URL(value, `${serverOrigin.replace(/\/+$/, "")}/`).toString();
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const request = (url.startsWith("https:") ? https : http).get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), destination)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const file = fs.createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function rollbackDetail(manifest) {
  if (!manifest?.previousInstallerUrl) return "";

  const version = manifest.previousVersion ? ` ${manifest.previousVersion}` : "";
  return [
    "",
    `Rollback available: install previous version${version} from:`,
    manifest.previousInstallerUrl,
  ].join("\n");
}

async function defaultFetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 503) return null;
  if (!response.ok) throw new Error(`Update manifest returned HTTP ${response.status}`);
  return response.json();
}

function createUpdater({ app, dialog, shell, isDev = false, fetchJson = defaultFetchJson }) {
  let updateCheckInProgress = false;

  async function fetchUpdateManifest(serverOrigin) {
    const manifestUrl = resolveUpdateUrl(serverOrigin, "/updates/latest.json");
    return fetchJson(manifestUrl);
  }

  async function recordFailure(error, manifest) {
    const payload = {
      failedAt: new Date().toISOString(),
      version: manifest?.version,
      previousVersion: manifest?.previousVersion,
      previousInstallerUrl: manifest?.previousInstallerUrl,
      error: error instanceof Error ? error.message : String(error),
    };

    try {
      const logPath = path.join(app.getPath("userData"), "textura-update-failure.json");
      fs.writeFileSync(logPath, JSON.stringify(payload, null, 2));
    } catch {
      // Best-effort local diagnostics only.
    }
  }

  async function checkForUpdates(serverOrigin) {
    if (isDev || updateCheckInProgress || !serverOrigin) return { status: "skipped" };
    updateCheckInProgress = true;
    let manifest;

    try {
      manifest = await fetchUpdateManifest(serverOrigin);
      if (!manifest?.version || !manifest?.installerUrl || !manifest?.sha256) {
        return { status: "unavailable" };
      }

      const currentVersion = app.getVersion();
      const newerAvailable = compareVersions(manifest.version, currentVersion) > 0;
      const belowMinimum =
        manifest.minSupportedVersion &&
        compareVersions(currentVersion, manifest.minSupportedVersion) < 0;

      if (!newerAvailable && !belowMinimum) return { status: "current", currentVersion };

      const mandatory = Boolean(manifest.mandatory || belowMinimum);

      return {
        status: "available",
        manifest,
        currentVersion,
        mandatory,
      };
    } catch (error) {
      await recordFailure(error, manifest);
      return { status: "error", error: error instanceof Error ? error.message : String(error) };
    } finally {
      updateCheckInProgress = false;
    }
  }

  async function downloadAndInstallUpdate(serverOrigin, manifest) {
    if (!serverOrigin || !manifest?.installerUrl || !manifest?.sha256) {
      return { status: "error", error: "Invalid update manifest provided." };
    }

    try {
      const installerUrl = resolveUpdateUrl(serverOrigin, manifest.installerUrl);
      const fileName =
        decodeURIComponent(path.basename(new URL(installerUrl).pathname)) ||
        `Textura-ERP-${manifest.version}.exe`;
      const updateDir = path.join(app.getPath("temp"), "textura-updates");
      const installerPath = path.join(updateDir, fileName);

      fs.mkdirSync(updateDir, { recursive: true });
      await downloadFile(installerUrl, installerPath);

      const checksum = await sha256File(installerPath);
      if (checksum.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
        fs.rmSync(installerPath, { force: true });
        throw new Error("Downloaded update failed checksum verification.");
      }

      const openError = await shell.openPath(installerPath);
      if (openError) throw new Error(openError);

      app.quit();
      return { status: "installing", installerPath };
    } catch (error) {
      await recordFailure(error, manifest);
      dialog.showErrorBox(
        "Update failed",
        `${error instanceof Error ? error.message : "Unable to install the update."}${rollbackDetail(
          manifest,
        )}`,
      );
      return { status: "error", error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { checkForUpdates, downloadAndInstallUpdate, fetchUpdateManifest };
}

module.exports = {
  compareVersions,
  createUpdater,
  downloadFile,
  resolveUpdateUrl,
  sha256File,
};
