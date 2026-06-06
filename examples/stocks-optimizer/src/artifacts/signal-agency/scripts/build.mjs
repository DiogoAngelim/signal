import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const lockPath = new URL("../.build-lock/", import.meta.url);

const acquireLock = async () => {
  for (;;) {
    try {
      await mkdir(lockPath);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") {
        throw error;
      }

      await setTimeout(100);
    }
  }
};

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL("../", import.meta.url),
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });

await acquireLock();

try {
  await run("tsc", ["-p", "tsconfig.json"]);
} finally {
  await rm(lockPath, { recursive: true, force: true });
}
