/**
 * SIGNAL Local Verification System — Install Hooks Command
 *
 * Injects npm scripts wrapper into package.json:
 * {
 *   "scripts": {
 *     "test": "signal test",
 *     "build": "signal build",
 *     "verify": "signal verify"
 *   }
 * }
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deterministicStringify } from "../core/hashChain.js";

const SIGNAL_SCRIPTS: Record<string, string> = {
  test: "signal test",
  build: "signal build",
  verify: "signal verify",
};

/**
 * Execute the `signal install-hooks` command.
 * Modifies package.json to add signal script wrappers.
 */
export function executeInstallHooks(root: string = process.cwd()): boolean {
  const packageJsonPath = resolve(root, "package.json");

  if (!existsSync(packageJsonPath)) {
    console.error("SIGNAL: No package.json found in current directory.");
    return false;
  }

  let packageJson: Record<string, unknown>;

  try {
    const raw = readFileSync(packageJsonPath, "utf8");
    packageJson = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.error(`SIGNAL: Failed to parse package.json: ${String(err)}`);
    return false;
  }

  // Get or create scripts section
  const scripts = (packageJson.scripts ?? {}) as Record<string, string>;
  let modified = false;

  for (const [key, value] of Object.entries(SIGNAL_SCRIPTS)) {
    if (scripts[key] !== value) {
      const oldValue = scripts[key];
      scripts[key] = value;
      if (oldValue) {
        console.log(`  Updated "${key}": "${oldValue}" → "${value}"`);
      } else {
        console.log(`  Added "${key}": "${value}"`);
      }
      modified = true;
    } else {
      console.log(`  Already set "${key}": "${value}"`);
    }
  }

  if (modified) {
    packageJson.scripts = scripts;
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8",
    );
    console.log("");
    console.log("SIGNAL: ✓ package.json updated with signal scripts.");
  } else {
    console.log("");
    console.log("SIGNAL: All signal scripts already installed.");
  }

  return true;
}
