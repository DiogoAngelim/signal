export function ok<T>(data: T, meta?: Record<string, unknown>) {
  return {
    data,
    meta,
    error: null
  };
}

export function fail(code: string, message: string, details?: unknown) {
  return {
    data: null,
    error: {
      code,
      message,
      details
    }
  };
}
