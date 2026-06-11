/**
 * SIGNAL Local Verification System — Constants
 */

import { resolve } from "node:path";

// Genesis hash — the starting point of the chain
export const GENESIS_HASH = "0".repeat(64);

// .signal directory name
export const SIGNAL_DIR_NAME = ".signal";

// Get the .signal directory path (relative to cwd or specified root)
export function getSignalDir(root: string = process.cwd()): string {
  return resolve(root, SIGNAL_DIR_NAME);
}

// State file paths
export function getStatePath(root: string = process.cwd()): string {
  return resolve(getSignalDir(root), "state.json");
}

export function getHashesPath(root: string = process.cwd()): string {
  return resolve(getSignalDir(root), "hashes.json");
}

export function getLogsPath(root: string = process.cwd()): string {
  return resolve(getSignalDir(root), "logs.json");
}

export function getSnapshotsDir(root: string = process.cwd()): string {
  return resolve(getSignalDir(root), "snapshots");
}

// Contract snapshot paths
export function getContractSnapshotsDir(root: string = process.cwd()): string {
  return resolve(getSignalDir(root), "contract-snapshots");
}

export function getContractSnapshotPath(root: string = process.cwd()): string {
  return resolve(getContractSnapshotsDir(root), "v1.json");
}

// Hardening directory
export const HARDENING_DIR_NAME = "hardening";

export function getHardeningDir(root: string = process.cwd()): string {
  return resolve(root, HARDENING_DIR_NAME);
}

// Directory patterns to ignore when hashing (v17 #3)
export const IGNORED_PATTERNS = [
  "node_modules",
  "dist",
  ".git",
  ".map",
  "logs",
  ".signal",
  "coverage",
  ".turbo",
];

// File extensions to ignore when hashing
export const IGNORED_EXTENSIONS = new Set([
  ".map",
]);

// State version
export const STATE_VERSION = 1;

// Default commands
export const DEFAULT_TEST_COMMAND = "pnpm test";
export const DEFAULT_BUILD_COMMAND = "pnpm build";