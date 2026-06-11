export class BinanceExecutionError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BinanceExecutionError";
    this.code = code;
    this.details = details;
  }
}

export class BinanceRateLimitError extends BinanceExecutionError {
  readonly retryAfterMs?: number;
  readonly banned: boolean;

  constructor(
    message: string,
    options: { retryAfterMs?: number; banned?: boolean } = {},
  ) {
    super(
      options.banned ? "BINANCE_IP_BANNED" : "BINANCE_RATE_LIMIT",
      message,
      options,
    );
    this.name = "BinanceRateLimitError";
    this.retryAfterMs = options.retryAfterMs;
    this.banned = options.banned === true;
  }
}

export class BinanceApiError extends BinanceExecutionError {
  readonly status: number;

  constructor(status: number, message: string, details?: unknown) {
    super("BINANCE_API_ERROR", message, details);
    this.name = "BinanceApiError";
    this.status = status;
  }
}

export class BinanceValidationError extends BinanceExecutionError {
  constructor(message: string, details?: unknown) {
    super("BINANCE_VALIDATION_ERROR", message, details);
    this.name = "BinanceValidationError";
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
