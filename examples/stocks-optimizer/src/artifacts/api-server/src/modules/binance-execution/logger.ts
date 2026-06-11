const REDACT_KEYS = new Set([
  "apikey",
  "api_key",
  "secret",
  "apisecret",
  "api_secret",
  "signature",
  "token",
  "authorization",
]);

export type BinanceExecutionLogger = {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
  debug(payload: unknown, message?: string): void;
};

export function redactSecrets<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactValue(entry, seen);
    }
  }

  return output;
}

function write(
  level: "info" | "warn" | "error" | "debug",
  payload: unknown,
  message?: string,
) {
  const clean = redactSecrets(payload);
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : level === "debug"
          ? console.debug
          : console.log;
  if (message) fn(message, clean);
  else fn(clean);
}

export const binanceExecutionLogger: BinanceExecutionLogger = {
  info: (payload, message) => write("info", payload, message),
  warn: (payload, message) => write("warn", payload, message),
  error: (payload, message) => write("error", payload, message),
  debug: (payload, message) => write("debug", payload, message),
};
