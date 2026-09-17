/**
 * Shared error taxonomy для field↔backend sync.
 *
 * Сервер повертає у тілі помилки структуру `{ error: ErrorCode, message, details? }`.
 * Mobile dispatcher читає `error` і обирає поведінку:
 *   - TRANSIENT: retry (exponential backoff через attempts++)
 *   - PERMANENT: показати inspector причину
 *   - AUTH: trigger re-auth (redirect → Login)
 *   - VALIDATION: показати причину невалідності квитка
 */

export const ERROR_CODES = {
  // Auth (401/403)
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',
  AUTH_CAPABILITY_MISSING: 'AUTH_CAPABILITY_MISSING',

  // Validation (400/422)
  VALIDATION_SCHEMA: 'VALIDATION_SCHEMA',
  VALIDATION_TICKET_NOT_FOUND: 'VALIDATION_TICKET_NOT_FOUND',
  VALIDATION_TICKET_EXPIRED: 'VALIDATION_TICKET_EXPIRED',
  VALIDATION_TICKET_USED: 'VALIDATION_TICKET_USED',
  VALIDATION_TICKET_NOT_ACTIVE: 'VALIDATION_TICKET_NOT_ACTIVE',
  VALIDATION_HASH_MISMATCH: 'VALIDATION_HASH_MISMATCH',
  VALIDATION_ROUTE_MISMATCH: 'VALIDATION_ROUTE_MISMATCH',

  // Conflict (409)
  CONFLICT_ALREADY_EXISTS: 'CONFLICT_ALREADY_EXISTS',
  CONFLICT_STATE_TRANSITION: 'CONFLICT_STATE_TRANSITION',

  // Transient (5xx)
  TRANSIENT_DB: 'TRANSIENT_DB',
  TRANSIENT_PROVIDER: 'TRANSIENT_PROVIDER',
  TRANSIENT_UNKNOWN: 'TRANSIENT_UNKNOWN',

  // Rate limit (429)
  RATE_LIMITED: 'RATE_LIMITED',

  // Not found (404)
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ErrorCategory =
  | 'auth'
  | 'validation'
  | 'conflict'
  | 'transient'
  | 'rate-limited'
  | 'not-found';

export function categorize(code: ErrorCode | string): ErrorCategory {
  const c = code as ErrorCode;
  if (c.startsWith('AUTH_')) return 'auth';
  if (c.startsWith('VALIDATION_')) return 'validation';
  if (c.startsWith('CONFLICT_')) return 'conflict';
  if (c.startsWith('TRANSIENT_')) return 'transient';
  if (c === 'RATE_LIMITED') return 'rate-limited';
  if (c === 'NOT_FOUND') return 'not-found';
  return 'transient';
}

export function isRetryable(code: ErrorCode | string): boolean {
  const cat = categorize(code);
  return cat === 'transient' || cat === 'rate-limited';
}

export interface StructuredError {
  error: ErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
  retryAfterSec?: number;
}
