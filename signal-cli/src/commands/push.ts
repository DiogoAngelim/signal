/**
 * SIGNAL Local Verification System — Push Command (v1)
 *
 * Deterministic release pipeline orchestrator.
 * Executes verification, replay, audit, build, and git operations
 * in a strict fail-fast sequence.
 *
 * This command is orchestration-only:
 * - Does NOT import internal verifier/replay/audit modules
 * - Calls CLI commands via subprocess only
 * - Does NOT mutate state logic
 * - Does NOT bypass contract gate
 * - Fails on any non-zero exit
 * - Deterministic across runs
 */

import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve CLI path relative to this file so it works from any CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SIGNAL = `npx tsx ${resolve(__dirname, "../cli/index.ts")}`;

/**
 * Execute a command via execSync with stdio inherit.
 * Throws on non-zero exit (natural fail-fast).
 */
function run(cmd: string): void {
  execSync(cmd, {
    stdio: "inherit",
  });
}

/**
 * Execute the `signal push` command.
 * Runs the full deterministic verification + git pipeline.
 * Any failure halts execution immediately — no recovery, no continuation.
 */
export function pushCommand(): void {
  try {
    console.log("SIGNAL: Starting deterministic push pipeline...");
    console.log("");

    // ─── STEP 1: Verify ──────────────────────────────────────────────────
    console.log("SIGNAL: [1/4] Running verification...");
    run(`${SIGNAL} verify`);
    console.log("");

    // ─── STEP 2: Replay (full deterministic range) ────────────────────────
    console.log("SIGNAL: [2/4] Running replay (full range)...");
    run(`${SIGNAL} replay`);
    console.log("");

    // ─── STEP 3: Audit ───────────────────────────────────────────────────
    console.log("SIGNAL: [3/4] Running audit...");
    run(`${SIGNAL} audit`);
    console.log("");

    // ─── STEP 4: Build ───────────────────────────────────────────────────
    console.log("SIGNAL: [4/4] Running build...");
    run(`${SIGNAL} build`);
    console.log("");

    // ─── COMMIT + PUSH ───────────────────────────────────────────────────
    console.log("SIGNAL: Committing and pushing...");
    run("git add -A");
    run(`git commit -m "feat: deterministic contract pipeline push"`);
    run("git push origin main");
    console.log("");

    // ─── SUCCESS ──────────────────────────────────────────────────────────
    console.log("✅ SIGNAL PUSH COMPLETE");
  } catch {
    // Any non-zero exit from run() throws — caught here
    // NO retries, NO fallback, NO partial continuation
    console.error("❌ SIGNAL PUSH FAILED");
    process.exit(1);
  }
}
