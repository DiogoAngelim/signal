/**
 * Signal Configuration
 * 
 * Centralized config passed to Signal.configure()
 */

import { SignalConfig, SignalDB, SignalTransport, SignalLogger } from "./Types";
import { deepFreeze } from "../utils/deepFreeze";

export class Config {
  readonly db: SignalDB;
  readonly transport?: SignalTransport;
  readonly logger?: SignalLogger;
  readonly env?: Record<string, any>;

  constructor(input: SignalConfig) {
    this.db = input.db;
    this.transport = input.transport;
    this.logger = input.logger;
    this.env = input.env ? { ...input.env } : undefined;

    // Freeze config after creation, but exclude transport and logger which need to be mutable
    deepFreeze(this.db);
    if (this.env) deepFreeze(this.env);
    Object.freeze(this);
  }

  /**
   * Get a config value by path (e.g., "db.host")
   */
  get(path: string): any {
    const parts = path.split(".");
    let value: any = this;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }
}
