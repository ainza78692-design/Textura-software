import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCommand = process.platform === "win32" ? "electron.cmd" : "electron";
const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;

let electronProcess;
let shuttingDown = false;

const viteProcess = spawn(npmCommand, ["run", "dev", "--", "--host", "127.0.0.1"], {
  stdio: ["inherit", "pipe", "pipe"],
  shell: true,
});

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  electronProcess?.kill();
  viteProcess.kill();
  process.exit(exitCode);
}

function startElectron(rendererUrl) {
  if (electronProcess) return;

  electronProcess = spawn(electronCommand, ["."], {
    stdio: "inherit",
    shell: true,
    env: {
      ...electronEnv,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
  });

  electronProcess.on("exit", (code) => stopAll(code ?? 0));
}

function handleViteOutput(buffer) {
  const text = buffer.toString();
  process.stdout.write(text);

  const match = text.match(/http:\/\/(?:localhost|127\.0\.0\.1):\d+\//);
  if (match) startElectron(match[0]);
}

viteProcess.stdout.on("data", handleViteOutput);
viteProcess.stderr.on("data", (buffer) => {
  process.stderr.write(buffer.toString());
});

viteProcess.on("exit", (code) => {
  if (!shuttingDown) stopAll(code ?? 1);
});

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
