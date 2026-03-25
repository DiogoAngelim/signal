/**
 * Utility: Logger
 * 
 * Structured logging with configurable level and output
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface SignalLogger {
  debug(msg: string, data?: any): void;
  info(msg: string, data?: any): void;
  warn(msg: string, data?: any): void;
  error(msg: string, data?: any): void;
}

/**
 * Default console logger
 */
export class ConsoleLogger implements SignalLogger {
  private level: LogLevel;
  private prefix: string;

  constructor(level = LogLevel.INFO, prefix = "[Signal]") {
    this.level = level;
    this.prefix = prefix;
  }

  debug(msg: string, data?: any) {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`${this.prefix} DEBUG: ${msg}`, data || "");
    }
  }

  info(msg: string, data?: any) {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} INFO: ${msg}`, data || "");
    }
  }

  warn(msg: string, data?: any) {
    if (this.level <= LogLevel.WARN) {
      console.warn(`${this.prefix} WARN: ${msg}`, data || "");
    }
  }

  error(msg: string, data?: any) {
    if (this.level <= LogLevel.ERROR) {
      console.error(`${this.prefix} ERROR: ${msg}`, data || "");
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }
}

/**
 * No-op logger for testing
 */
export class NoOpLogger implements SignalLogger {
  debug(_msg?: string, _data?: any) { }
  info(_msg?: string, _data?: any) { }
  warn(_msg?: string, _data?: any) { }
  error(_msg?: string, _data?: any) { }
}

