/**
 * Signal Lifecycle
 * 
 * Manages explicit lifecycle phases:
 * - CONFIGURING: Setting up Signal instance
 * - REGISTERING: Registering collections, queries, mutations
 * - RUNNING: Operational, registry locked
 * - FAILED: Unrecoverable error
 */

import { SignalPhase } from "./Types";
import { SignalLifecycleError } from "./Errors";
import { invariant } from "../utils/invariant";

const phaseMap = new WeakMap<Lifecycle, SignalPhase>();
const errorMap = new WeakMap<Lifecycle, Error>();

export class Lifecycle {
  constructor() {
    phaseMap.set(this, SignalPhase.CONFIGURING);
  }

  /**
   * Get current phase
   */
  getPhase(): SignalPhase {
    return phaseMap.get(this) || SignalPhase.CONFIGURING;
  }

  /**
   * Check if in a specific phase
   */
  is(phase: SignalPhase): boolean {
    return (phaseMap.get(this) || SignalPhase.CONFIGURING) === phase;
  }

  /**
   * Check if framework is running
   */
  isRunning(): boolean {
    return (phaseMap.get(this) || SignalPhase.CONFIGURING) === SignalPhase.RUNNING;
  }

  /**
   * Check if failed
   */
  isFailed(): boolean {
    return (phaseMap.get(this) || SignalPhase.CONFIGURING) === SignalPhase.FAILED;
  }

  /**
   * Transition from CONFIGURING to REGISTERING
   */
  startRegistering(): void {
    const currentPhase = phaseMap.get(this) || SignalPhase.CONFIGURING;
    invariant(
      currentPhase === SignalPhase.CONFIGURING,
      `Cannot start registering from phase ${currentPhase}`
    );
    phaseMap.set(this, SignalPhase.REGISTERING);
  }

  /**
   * Transition from REGISTERING to RUNNING
   */
  start(): void {
    const currentPhase = phaseMap.get(this) || SignalPhase.CONFIGURING;
    invariant(
      currentPhase === SignalPhase.REGISTERING,
      `Cannot start from phase ${currentPhase}`
    );
    phaseMap.set(this, SignalPhase.RUNNING);
  }

  /**
   * Mark as failed
   */
  fail(error: Error): void {
    phaseMap.set(this, SignalPhase.FAILED);
    errorMap.set(this, error);
  }

  /**
   * Get error if failed
   */
  getError(): Error | undefined {
    return errorMap.get(this);
  }

  /**
   * Require a specific phase, throw if not in it
   */
  require(phase: SignalPhase, action: string): void {
    const currentPhase = phaseMap.get(this) || SignalPhase.CONFIGURING;
    if (currentPhase !== phase) {
      throw new SignalLifecycleError(
        `Cannot ${action} in phase ${currentPhase}, expected ${phase}`
      );
    }
  }

  /**
   * Require we're in REGISTERING or earlier
   */
  requireRegistrationPhase(action: string): void {
    const currentPhase = phaseMap.get(this) || SignalPhase.CONFIGURING;
    if (currentPhase !== SignalPhase.CONFIGURING && currentPhase !== SignalPhase.REGISTERING) {
      throw new SignalLifecycleError(
        `Cannot ${action} after startup. Current phase: ${currentPhase}`
      );
    }
  }

  /**
   * Require we're RUNNING
   */
  requireRunning(action: string): void {
    const currentPhase = phaseMap.get(this) || SignalPhase.CONFIGURING;
    if (currentPhase !== SignalPhase.RUNNING) {
      throw new SignalLifecycleError(
        `Cannot ${action} before startup. Current phase: ${currentPhase}`
      );
    }
  }
}
