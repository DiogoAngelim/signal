/**
 * adapter.ts — Public API for SIGNAL Trace Wrapper
 *
 * Exposes:
 *   verify(input) — Run engine, trace, replay, compare → PASS/FAIL
 *   replay(input) — Rerun same input, rebuild trace, compare
 *   audit(input)  — Full audit with all artifacts written
 *
 * Execution flow:
 *   1. Canonicalize input
 *   2. Run engine (unchanged)
 *   3. Collect step traces
 *   4. Hash all steps
 *   5. Replay same input
 *   6. Compare → PASS/FAIL
 *
 * Outputs:
 *   .signal/trace/run.json
 *   .signal/trace/fingerprint.json
 *   .signal/trace/replay.json
 *
 * Hard stop rule: Any mismatch → immediate failure, no fallback.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { canonicalize } from "./canonicalize.js";
import { hashSync } from "./hash.js";
import { type ReplayResult, replayAndValidate } from "./replay.js";
import {
  type EngineFn,
  type StepDef,
  type TraceResult,
  createEngineSteps,
  traceExecution,
} from "./trace.js";

const TRACE_DIR = ".signal/trace";

function resolveTraceDir(baseDir?: string): string {
  return baseDir ? path.join(baseDir, TRACE_DIR) : TRACE_DIR;
}

function ensureTraceDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  ensureTraceDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export interface TraceConfig {
  engineFn: EngineFn;
  baseDir?: string;
  steps?: StepDef[];
}

export interface VerifyResult {
  pass: boolean;
  trace: TraceResult;
  replay: ReplayResult;
  error?: string;
}

export interface AuditResult {
  pass: boolean;
  trace: TraceResult;
  replay: ReplayResult;
  inputHash: string;
  outputHash: string;
  fingerprint: string;
  artifacts: {
    runJson: string;
    fingerprintJson: string;
    replayJson: string;
  };
  error?: string;
}

/**
 * verify(input) — Run engine with trace, replay, and compare.
 * Returns PASS only if all step hashes match on replay.
 * Hard stop on any mismatch.
 */
export function verify(input: unknown, config: TraceConfig): VerifyResult {
  const steps = config.steps ?? createEngineSteps(config.engineFn);
  const trace = traceExecution(steps, input);
  const replayResult = replayAndValidate(trace, steps, input);

  if (!replayResult.pass) {
    return {
      pass: false,
      trace,
      replay: replayResult,
      error: replayResult.error ?? "Replay verification failed",
    };
  }

  return { pass: true, trace, replay: replayResult };
}

/**
 * replay(input) — Rerun same input, rebuild trace, compare.
 */
export function replay(input: unknown, config: TraceConfig): ReplayResult {
  const steps = config.steps ?? createEngineSteps(config.engineFn);
  const trace = traceExecution(steps, input);
  return replayAndValidate(trace, steps, input);
}

/**
 * audit(input) — Full audit with all artifacts written to disk.
 * Produces .signal/trace/run.json, fingerprint.json, replay.json
 * Hard stop: any mismatch → immediate failure, no fallback.
 */
export function audit(input: unknown, config: TraceConfig): AuditResult {
  const steps = config.steps ?? createEngineSteps(config.engineFn);
  const traceDir = resolveTraceDir(config.baseDir);

  const inputHash = hashSync(input);
  const trace = traceExecution(steps, input);
  const outputHash = trace.outputHash;
  const fingerprint = trace.fingerprint;
  const replayResult = replayAndValidate(trace, steps, input);
  const pass = replayResult.pass;

  const runJsonPath = path.join(traceDir, "run.json");
  const fingerprintJsonPath = path.join(traceDir, "fingerprint.json");
  const replayJsonPath = path.join(traceDir, "replay.json");

  writeJson(runJsonPath, {
    inputHash,
    outputHash,
    steps: trace.steps,
  });

  writeJson(fingerprintJsonPath, {
    fingerprint,
    inputHash,
    outputHash,
    stepCount: trace.steps.length,
    stepFingerprints: trace.steps.map((s) => ({
      step: s.step,
      inputHash: s.inputHash,
      outputHash: s.outputHash,
    })),
  });

  writeJson(replayJsonPath, replayResult);

  if (!pass) {
    return {
      pass: false,
      trace,
      replay: replayResult,
      inputHash,
      outputHash,
      fingerprint,
      artifacts: {
        runJson: runJsonPath,
        fingerprintJson: fingerprintJsonPath,
        replayJson: replayJsonPath,
      },
      error: replayResult.error ?? "Replay verification failed — hard stop",
    };
  }

  return {
    pass: true,
    trace,
    replay: replayResult,
    inputHash,
    outputHash,
    fingerprint,
    artifacts: {
      runJson: runJsonPath,
      fingerprintJson: fingerprintJsonPath,
      replayJson: replayJsonPath,
    },
  };
}

export { canonicalize } from "./canonicalize.js";
export { hashSync, hash } from "./hash.js";
export { traceExecution, createEngineSteps } from "./trace.js";
export { replayAndValidate, compareTraces } from "./replay.js";
