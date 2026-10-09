/**
 * Single error taxonomy for the whole app (technical spec §10.5).
 *
 * `AppError` is the *only* error type that crosses a port boundary. Every
 * repository / engine implementation is required to translate its native
 * failure into one of these kinds so the UI never has to branch on platform.
 */

export type AppErrorKind =
  | 'network'
  | 'unauthorized'
  | 'unavailable'
  | 'timeout'
  | 'unknown';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  /** Already-localised, user-facing copy. Technical detail never reaches here. */
  readonly userMessage: string;
  /** Debug-only detail. Goes to logs, never to the UI. */
  readonly debugDetail?: string;
  readonly cause?: unknown;

  constructor(
    kind: AppErrorKind,
    userMessage: string,
    options?: { debugDetail?: string; cause?: unknown },
  ) {
    super(`${kind}: ${userMessage}`, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.kind = kind;
    this.userMessage = userMessage;
    this.debugDetail = options?.debugDetail;
    this.cause = options?.cause;
  }

  static from(error: unknown, fallbackMessage = '出了点问题，请重试'): AppError {
    if (error instanceof AppError) return error;
    if (isCancellation(error)) {
      // Cancellation is not a failure; callers normally swallow it, but if it
      // escapes we map it to a silent-ish kind rather than showing an error.
      return new AppError('unknown', fallbackMessage, { cause: error });
    }
    return new AppError('unknown', fallbackMessage, {
      cause: error,
      debugDetail: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Thrown/rejected by cancelled requests; must never render an error state. */
export class CancellationError extends Error {
  constructor(message = 'cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export function isCancellation(error: unknown): boolean {
  return (
    error instanceof CancellationError ||
    (error instanceof AppError && error.cause instanceof CancellationError) ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { name?: string }).name === 'AbortError')
  );
}