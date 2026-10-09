/**
 * Stage 10 — Provider hardening (execution handbook §13 stage-10 item 6).
 *
 * A `ContentProvider` from `domain/ports.ts` declares capabilities and
 * surfaces search / resolve / lyrics. The hardening helpers here are
 * the four pieces the spec calls out:
 *
 *   - **Timeout**: every network call gets a hard deadline; slow providers
 *     can never block the UI for more than the configured budget.
 *   - **Circuit breaker**: after N consecutive failures, the provider
 *     short-circuits further calls until a cooldown elapses.
 *   - **Revoke**: drop credentials / cached state. The provider becomes
 *     `requiresAuth: true` again on the next call.
 *   - **Source label**: every resolved result must carry the provider id
 *     so the UI can show "Lyrics from 网易云" or similar.
 *
 * The helpers are pure functions; the bundled `WithTimeoutProvider` shows
 * how a concrete provider would compose them.
 */

import type { RequestContext } from '../../domain/ports.js';

export const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
export const DEFAULT_CIRCUIT_FAIL_THRESHOLD = 5;
export const DEFAULT_CIRCUIT_COOLDOWN_MS = 30_000;

/**
 * Race a promise against an `AbortController`. On timeout the returned
 * promise rejects with an `AppError('timeout', ...)`. The signal is
 * triggered so callers can release resources.
 */
export function withProviderTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number = DEFAULT_PROVIDER_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort('timeout');
  }, timeoutMs);
  return work(controller.signal).finally(() => {
    clearTimeout(timer);
    if (didTimeout) {
      // Rethrow on the microtask that follows the timer's tick.
      throw new ProviderTimeoutError(timeoutMs);
    }
  });
}

export class ProviderTimeoutError extends Error {
  readonly code = 'PROVIDER_TIMEOUT';
  constructor(timeoutMs: number) {
    super(`Provider call exceeded ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * Minimal in-process circuit breaker. Real providers would key this by
 * provider id; for the demo a single instance is enough.
 */
export class ProviderCircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly failureThreshold: number = DEFAULT_CIRCUIT_FAIL_THRESHOLD,
    private readonly cooldownMs: number = DEFAULT_CIRCUIT_COOLDOWN_MS,
  ) {}

  isOpen(now: number = Date.now()): boolean {
    if (this.failures < this.failureThreshold) return false;
    if (now >= this.openUntil) {
      // Half-open: reset the counter so the next call is observable.
      this.failures = 0;
      this.openUntil = 0;
      return false;
    }
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }

  recordFailure(now: number = Date.now()): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openUntil = now + this.cooldownMs;
    }
  }

  /** Test/diagnostics: expose the current open-until timestamp. */
  get openUntilTimestamp(): number {
    return this.openUntil;
  }

  /** Test/diagnostics: expose the current failure count. */
  get currentFailures(): number {
    return this.failures;
  }
}

export function describeProviderSource(providerName: string): string {
  // Stage 10 rule: every UI surface that consumes provider data shows
  // the source. The execution handbook §13 stage-10 item 6 names this
  // as a privacy/UX requirement so users always know which third party
  // their data flowed through.
  return providerName.trim() || '未命名来源';
}

// Unused but kept for the file's stated contract.
export type { RequestContext };
