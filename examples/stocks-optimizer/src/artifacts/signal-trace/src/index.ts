/**
 * index.ts — Barrel export for signal-trace
 */

export { canonicalize } from "./canonicalize.js";
export { hashSync, hash } from "./hash.js";
export { traceExecution, createEngineSteps } from "./trace.js";
export type { StepTrace, TraceResult, StepDef, EngineFn } from "./trace.js";
export { replayAndValidate, compareTraces } from "./replay.js";
export type { ReplayResult, StepComparison } from "./replay.js";
export { verify, replay, audit } from "./adapter.js";
export type { TraceConfig, VerifyResult, AuditResult } from "./adapter.js";