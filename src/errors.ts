export class CliError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super("AUTH_ERROR", message);
    this.name = "AuthError";
  }
}

export class ValidationError extends CliError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class ApiError extends CliError {
  readonly status?: number;
  readonly errors?: unknown[];

  constructor(message: string, status?: number, errors?: unknown[]) {
    super("API_ERROR", message, { status, errors });
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}
