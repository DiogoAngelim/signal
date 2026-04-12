import pino from "pino";
import type { Env } from "./config/env.js";

export function createLogger(env: Env) {
  return pino({
    level: env.LOG_LEVEL,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
