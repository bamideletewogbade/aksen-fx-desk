/**
 * Errors the domain raises on purpose. Route handlers turn these into JSON
 * responses with a stable `code`; anything else becomes a 500 with no detail.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID'
  | 'CONFLICT'
  | 'STALE'
  | 'EXPIRED'
  | 'RATE_LIMITED'
  | 'FOUR_EYES';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID: 422,
  CONFLICT: 409,
  STALE: 409,
  EXPIRED: 410,
  RATE_LIMITED: 429,
  FOUR_EYES: 403,
};

export class DomainError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code];
  }
}

export const fail = (code: ErrorCode, message: string, details?: Record<string, unknown>): never => {
  throw new DomainError(code, message, details);
};
