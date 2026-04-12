import type {
  SignalFrameworkError,
  SignalFrameworkErrorCode,
} from "./contracts";

export function createFrameworkError(
  code: SignalFrameworkErrorCode,
  message: string,
  options: { traceId?: string; details?: unknown } = {},
): SignalFrameworkError {
  return {
    code,
    message,
    traceId: options.traceId,
    details: options.details,
  };
}

export function createFrameworkErrorCause(
  code: SignalFrameworkErrorCode,
  message: string,
  options: { traceId?: string; details?: unknown } = {},
): Error & SignalFrameworkError {
  const error = new Error(message) as Error & SignalFrameworkError;
  error.code = code;
  error.traceId = options.traceId;
  error.details = options.details;
  return error;
}
