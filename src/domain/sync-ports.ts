/**
 * Stage 10 ports — sync outbox, auth, entitlements.
 *
 * These interfaces live next to the rest of the domain ports so the
 * application layer (PlayerCoordinator, library store, etc.) can depend on
 * them without crossing into infrastructure. The in-memory / no-network
 * implementations satisfy the contracts so unit tests and the demo build
 * stay runnable offline; production code can swap in real server-backed
 * implementations without changing call sites.
 *
 * Why the outbox lives in domain (not infrastructure)
 * ----------------------------------------------------
 * The contract is "queue a change, get a key, dedupe, optionally tombstone"
 * — the language of the spec (technical spec §21). Concrete storage
 * (IndexedDB row, REST POST, server-side queue) is the implementation's
 * problem, not the contract's. Keeping the port here means tests can
 * validate the queueing logic without a database.
 */

import type { ID } from './models.js';
import type { Unsubscribe } from './ports.js';

// ---------------------------------------------------------------------------
// Sync outbox
// ---------------------------------------------------------------------------

/**
 * One change the user made locally that *may* need to be uploaded. Tombstoned
 * entries represent deletions (`entityDeleted: true`).
 */
export interface OutboxEntry<TPayload> {
  /** Stable across retries so the server can dedupe. */
  readonly key: string;
  /** What kind of change this is. `liked` / `playlists` / `tracks` etc. */
  readonly entity: string;
  /** `true` when the local change is a deletion. */
  readonly entityDeleted: boolean;
  /** Wall-clock at enqueue. The server uses it as the conflict-resolution tie-breaker. */
  readonly enqueuedAt: number;
  /** The change payload. `undefined` for tombstones. */
  readonly payload?: TPayload;
  /**
   * How many times this entry has been attempted. A bounded counter that
   * tests can read; implementations should reject when it crosses the
   * `maxAttempts` ceiling.
   */
  readonly attempts: number;
}

export interface OutboxEnqueueOptions {
  /** Use the same `key` for a retry; the entry must be deduped, not appended. */
  key?: string;
  /** Wall-clock; tests inject deterministic values. */
  enqueuedAt?: number;
}

export interface OutboxDequeueResult<TPayload> {
  readonly entry: OutboxEntry<TPayload>;
  /**
   * Stop the dequeue loop on the next iteration. The transport signals
   * "transient" (server busy, network down) and asks the queue to back off
   * instead of draining.
   */
  readonly transient: boolean;
}

export type OutboxHandler<TPayload> = (
  entry: OutboxEntry<TPayload>,
) => Promise<OutboxDequeueResult<TPayload> | void>;

/** Resolver picks which side wins for an entity. Default = last-write-wins. */
export type ConflictResolver<TPayload> = (
  local: OutboxEntry<TPayload>,
  server: TPayload | null,
) => OutboxEntry<TPayload> | null;

/**
 * Bounded queue for "what changed locally that still needs to be uploaded".
 *
 * Implementation rules (see execution handbook §13 stage-10 item 4):
 *   - idempotent: re-enqueueing the same `key` does NOT create a second entry
 *   - tombstone-friendly: deletions are first-class entries
 *   - bounded retry: the transport signals attempts and the queue respects
 *     a `maxAttempts` ceiling
 *   - conflict-aware: the resolver picks last-write-wins by `enqueuedAt` and
 *     surfaces a structured conflict the caller can persist + retry
 */
export interface SyncOutboxPort<TPayload = unknown> {
  enqueue(
    entity: string,
    payload: TPayload,
    options?: OutboxEnqueueOptions,
  ): Promise<OutboxEntry<TPayload>>;
  tombstone(
    entity: string,
    options?: OutboxEnqueueOptions,
  ): Promise<OutboxEntry<TPayload>>;
  /**
   * Drain entries one at a time, calling `handler` for each. Stops when the
   * queue is empty OR when `handler` returns a `transient: true` result.
   * Returns the number of entries that were successfully drained.
   */
  drain(handler: OutboxHandler<TPayload>): Promise<{ drained: number; transient: boolean }>;
  /** Inspect — for tests + observability. */
  size(): number;
  peek(limit?: number): readonly OutboxEntry<TPayload>[];
  /**
   * Resolve a conflict between the local entry and a server-side snapshot.
   * Returns the entry that should be uploaded. The default strategy is
   * last-write-wins by `enqueuedAt`; the host may register a custom resolver
   * via `setConflictResolver` for entity-specific merge logic.
   */
  resolveConflict(
    local: OutboxEntry<TPayload>,
    server: TPayload | null,
  ): OutboxEntry<TPayload> | null;
  setConflictResolver(resolver: ConflictResolver<TPayload>): void;
  /** Drop an entry by key (e.g., server confirmed receipt). */
  acknowledge(key: string): void;
  /** Drop everything (used by sign-out / "reset sync state"). */
  clear(): void;
  /**
   * Bounded retry cap. Re-enqueueing past this count surfaces an `AppError`
   * instead of silently keeping the entry forever.
   */
  setMaxAttempts(value: number): void;
}

// ---------------------------------------------------------------------------
// Auth + entitlements
// ---------------------------------------------------------------------------

export type AuthState =
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; userId: ID; displayName: string; tokenExpiresAt: number }
  | { kind: 'expired'; userId: ID };

/**
 * Stage 10 opt-in account. Default `MockAuth` satisfies the contract without
 * talking to a server, so the rest of the app can wire auth-aware behaviour
 * (Pro gating, sync) before the real backend exists. The contract deliberately
 * does NOT carry the access token across the boundary — production code reads
 * the token through `SecureStoragePort`, never through this object.
 */
export interface AuthPort {
  current(): Promise<AuthState>;
  /**
   * Initiate a sign-in. The implementation is responsible for any redirect,
   * OAuth dance, or credential exchange. Returns the resulting `AuthState`.
   */
  signIn(): Promise<AuthState>;
  /** Drop credentials locally + on the server (best-effort). */
  signOut(): Promise<void>;
  /** Re-validate the stored token; produces `expired` if it no longer works. */
  refresh(): Promise<AuthState>;
  onChange(listener: (state: AuthState) => void): Unsubscribe;
}

/**
 * What the signed-in user is allowed to do. Local playback, library
 * organization, and data export must remain available without Pro — the
 * execution handbook §13 stage-10 item 8 makes that a hard requirement.
 */
export interface EntitlementsPort {
  /** True when the user can use Pro-only features. False on signed-out. */
  isPro(): Promise<boolean>;
  /** Source label for the UI ("free" / "trial" / "pro-monthly" / "pro-lifetime"). */
  tier(): Promise<string>;
  onChange(listener: (tier: string) => void): Unsubscribe;
}
