import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const builder = spawn(npmCommand, ["exec", "electron-builder", "--", "--win", "nsis"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: "false",
  },
});

builder.on("exit", (code) => {
  process.exit(code ?? 1);
});
