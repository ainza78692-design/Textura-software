import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createUpdater } = require("../electron/updater.cjs");

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "textura-updater-test-"));
const updateDir = path.join(tmpRoot, "updates");
const userDataDir = path.join(tmpRoot, "user-data");
const tempDir = path.join(tmpRoot, "temp");

await fs.mkdir(updateDir, { recursive: true });
await fs.mkdir(userDataDir, { recursive: true });
await fs.mkdir(tempDir, { recursive: true });

const installerName = "Textura ERP Setup 0.1.1.exe";
const previousInstallerName = "Textura ERP Setup 0.1.0.exe";
const installerContent = Buffer.from("dummy installer content for updater test");
const previousInstallerContent = Buffer.from("previous dummy installer content");

await fs.writeFile(path.join(updateDir, installerName), installerContent);
await fs.writeFile(path.join(updateDir, previousInstallerName), previousInstallerContent);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

let manifest = {
  version: "0.1.1",
  mandatory: false,
  minSupportedVersion: "0.1.0",
  installerUrl: `/updates/downloads/${encodeURIComponent(installerName)}`,
  sha256: sha256(installerContent),
  previousVersion: "0.1.0",
  previousInstallerUrl: `/updates/downloads/${encodeURIComponent(previousInstallerName)}`,
  previousSha256: sha256(previousInstallerContent),
  releaseNotes: "Updater test release",
  publishedAt: new Date().toISOString(),
};

const server = http.createServer(async (req, res) => {
  if (req.url === "/updates/latest.json") {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(manifest));
    return;
  }

  if (req.url?.startsWith("/updates/downloads/")) {
    const name = decodeURIComponent(req.url.slice("/updates/downloads/".length));
    const file = await fs.readFile(path.join(updateDir, name));
    res.setHeader("content-type", "application/octet-stream");
    res.end(file);
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const serverOrigin = `http://127.0.0.1:${port}`;

const calls = {
  prompts: [],
  errors: [],
  openedPaths: [],
  quit: 0,
};

const app = {
  getVersion: () => "0.1.0",
  getPath: (name) => {
    if (name === "userData") return userDataDir;
    if (name === "temp") return tempDir;
    throw new Error(`Unexpected app path: ${name}`);
  },
  quit: () => {
    calls.quit += 1;
  },
};

const dialog = {
  showMessageBox: async (options) => {
    calls.prompts.push(options);
    return { response: 0 };
  },
  showErrorBox: (title, detail) => {
    calls.errors.push({ title, detail });
  },
};

const shell = {
  openPath: async (installerPath) => {
    calls.openedPaths.push(installerPath);
    return "";
  },
};

try {
  const updater = createUpdater({ app, dialog, shell });
  const success = await updater.checkForUpdates(serverOrigin);

  assert.equal(success.status, "installing");
  assert.equal(calls.prompts.length, 1);
  assert.equal(calls.prompts[0].message, "New update available");
  assert.equal(calls.openedPaths.length, 1);
  assert.equal(path.basename(calls.openedPaths[0]), installerName);
  assert.equal(calls.quit, 1);

  manifest = { ...manifest, version: "0.1.2", sha256: "bad-checksum" };
  const failed = await updater.checkForUpdates(serverOrigin);

  assert.equal(failed.status, "error");
  assert.equal(calls.errors.length, 1);
  assert.match(calls.errors[0].detail, /checksum/i);
  assert.match(calls.errors[0].detail, /Rollback available/i);

  const failureLog = JSON.parse(
    await fs.readFile(path.join(userDataDir, "textura-update-failure.json"), "utf8"),
  );
  assert.equal(failureLog.version, "0.1.2");

  console.log("Updater flow test passed");
} finally {
  server.close();
  await fs.rm(tmpRoot, { recursive: true, force: true });
}

void rootDir;
