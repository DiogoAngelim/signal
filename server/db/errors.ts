export class SignalDBError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.name = "SignalDBError";
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, SignalDBError.prototype);
  }
}

export class SignalConflictError extends SignalDBError {
  constructor(message = "Resource conflict") {
    super("CONFLICT", message, 409);
    this.name = "SignalConflictError";
    Object.setPrototypeOf(this, SignalConflictError.prototype);
  }
}

export class SignalVersionMismatchError extends SignalDBError {
  readonly expectedVersion?: number;
  readonly actualVersion?: number;

  constructor(
    message = "Version mismatch",
    expectedVersion?: number,
    actualVersion?: number,
  ) {
    super("VERSION_MISMATCH", message, 409);
    this.name = "SignalVersionMismatchError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
    Object.setPrototypeOf(this, SignalVersionMismatchError.prototype);
  }
}
