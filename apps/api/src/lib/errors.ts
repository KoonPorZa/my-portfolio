export type ApiErrorCode =
  | "invalid_owner_code"
  | "invalid_payload"
  | "invalid_token"
  | "not_configured"
  | "not_found"
  | "forbidden"
  | "too_frequent"
  | "rate_limited"
  | "internal_error";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function errorBody(code: ApiErrorCode, message: string) {
  return {
    error: code,
    message,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}
