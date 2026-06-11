/**
 * SIGNAL Local Verification System — State Store
 *
 * JSON file persistence for .signal/ directory.
 * Manages state.json, hashes.json, logs.json, and snapshots/.
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  GENESIS_HASH,
  STATE_VERSION,
  getHashesPath,
  getLogsPath,
  getSignalDir,
  getSnapshotsDir,
  getStatePath,
} from "../core/constants.js";
import { deterministicStringify } from "../core/hashChain.js";
import type {
  HashLogEntry,
  PhaseState,
  SignalHashes,
  SignalState,
} from "./types.js";

// ─── Directory Initialization ───────────────────────────────────────────────

export function initSignalDir(root: string = process.cwd()): void {
  const signalDir = getSignalDir(root);

  if (!existsSync(signalDir)) {
    mkdirSync(signalDir, { recursive: true });
  }

  const snapshotsDir = getSnapshotsDir(root);
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  // Initialize state.json if it doesn't exist
  const statePath = getStatePath(root);
  if (!existsSync(statePath)) {
    const initialState: SignalState = {
      version: STATE_VERSION,
      phases: [],
    };
    writeFileSync(
      statePath,
      `${deterministicStringify(initialState)}\n`,
      "utf8",
    );
  }

  // Initialize hashes.json if it doesn't exist
  const hashesPath = getHashesPath(root);
  if (!existsSync(hashesPath)) {
    const initialHashes: SignalHashes = { entries: {} };
    writeFileSync(
      hashesPath,
      `${deterministicStringify(initialHashes)}\n`,
      "utf8",
    );
  }

  // Initialize logs.json if it doesn't exist
  const logsPath = getLogsPath(root);
  if (!existsSync(logsPath)) {
    const initialLogs: HashLogEntry[] = [];
    writeFileSync(logsPath, `${deterministicStringify(initialLogs)}\n`, "utf8");
  }
}

// ─── State Read/Write ──────────────────────────────────────────────────────

export function readState(root: string = process.cwd()): SignalState {
  const statePath = getStatePath(root);

  if (!existsSync(statePath)) {
    return { version: STATE_VERSION, phases: [] };
  }

  const raw = readFileSync(statePath, "utf8");
  return JSON.parse(raw) as SignalState;
}

export function writeState(
  state: SignalState,
  root: string = process.cwd(),
): void {
  const statePath = getStatePath(root);
  writeFileSync(statePath, `${deterministicStringify(state)}\n`, "utf8");
}

// ─── Phase Management ──────────────────────────────────────────────────────

export function addPhase(
  phase: PhaseState,
  root: string = process.cwd(),
): void {
  const state = readState(root);
  const phases = [...state.phases, phase];
  writeState({ ...state, phases }, root);
}

export function getPhase(
  phaseNumber: number,
  root: string = process.cwd(),
): PhaseState | undefined {
  const state = readState(root);
  return state.phases.find((p) => p.phase === phaseNumber);
}

export function getPhases(root: string = process.cwd()): readonly PhaseState[] {
  return readState(root).phases;
}

// ─── Hashes Read/Write ─────────────────────────────────────────────────────

export function readHashes(root: string = process.cwd()): SignalHashes {
  const hashesPath = getHashesPath(root);
  if (!existsSync(hashesPath)) {
    return { entries: {} };
  }
  const raw = readFileSync(hashesPath, "utf8");
  return JSON.parse(raw) as SignalHashes;
}

export function writeHashes(
  hashes: SignalHashes,
  root: string = process.cwd(),
): void {
  const hashesPath = getHashesPath(root);
  writeFileSync(hashesPath, `${deterministicStringify(hashes)}\n`, "utf8");
}

export function addHashEntry(
  key: string,
  hash: string,
  root: string = process.cwd(),
): void {
  const hashes = readHashes(root);
  hashes.entries[key] = hash;
  writeHashes(hashes, root);
}

// ─── Logs Read/Write ───────────────────────────────────────────────────────

export function readLogs(root: string = process.cwd()): HashLogEntry[] {
  const logsPath = getLogsPath(root);
  if (!existsSync(logsPath)) {
    return [];
  }
  const raw = readFileSync(logsPath, "utf8");
  return JSON.parse(raw) as HashLogEntry[];
}

export function addLogEntry(
  entry: HashLogEntry,
  root: string = process.cwd(),
): void {
  const logs = readLogs(root);
  logs.push(entry);
  const logsPath = getLogsPath(root);
  writeFileSync(logsPath, `${deterministicStringify(logs)}\n`, "utf8");
}

// ─── Snapshots ─────────────────────────────────────────────────────────────

export function createSnapshot(
  label: string,
  root: string = process.cwd(),
): void {
  const snapshotsDir = getSnapshotsDir(root);
  const statePath = getStatePath(root);

  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  const snapshotPath = join(snapshotsDir, `${label}.json`);
  if (existsSync(statePath)) {
    copyFileSync(statePath, snapshotPath);
  }
}

export function listSnapshots(root: string = process.cwd()): string[] {
  const snapshotsDir = getSnapshotsDir(root);
  if (!existsSync(snapshotsDir)) {
    return [];
  }
  return readdirSync(snapshotsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

// ─── State Validation Helpers ───────────────────────────────────────────────

export function stateExists(root: string = process.cwd()): boolean {
  return existsSync(getStatePath(root));
}

export function getLastPhase(
  root: string = process.cwd(),
): PhaseState | undefined {
  const phases = getPhases(root);
  if (phases.length === 0) return undefined;
  return phases[phases.length - 1];
}

export function getLastPhaseHash(root: string = process.cwd()): string {
  const last = getLastPhase(root);
  if (!last) return GENESIS_HASH;
  return last.hash;
}
