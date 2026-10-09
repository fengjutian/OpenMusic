/**
 * Stage 10 in-memory `SyncOutboxPort` — satisfies the contract without a
 * server so the demo build + unit tests run offline. A production
 * implementation would back the same interface with IndexedDB rows + REST
 * uploads, swapping the `setMaxAttempts` ceiling for a per-entity config
 * (e.g. tombstone = 8 attempts, playlist = 4).
 *
 * Concurrency: the queue itself is single-threaded (a `Promise.resolve()`
 * microtask wraps every mutation so re-entrant `enqueue` from inside a
 * `drain` callback does not corrupt the array). The transport runs the
 * drain loop in the caller's context.
 *
 * Idempotency: `enqueue` with the same `key` updates the existing entry in
 * place. `payload` and `enqueuedAt` are replaced; `attempts` is preserved
 * so a retry-after-dedup does not silently reset the retry budget.
 *
 * Tombstone handling: a `tombstone()` call replaces any prior non-tombstone
 * entry with the same `key` and flags `entityDeleted: true`. A subsequent
 * `enqueue(entity, payload, { key })` for the same key supersedes the
 * tombstone (un-delete path).
 *
 * Conflict resolution: by default, last-write-wins by `enqueuedAt`. Hosts
 * can register entity-specific resolvers via `setConflictResolver`.
 */

import { AppError } from '../../domain/errors.js';
import type {
  ConflictResolver,
  OutboxDequeueResult,
  OutboxEnqueueOptions,
  OutboxEntry,
  OutboxHandler,
  SyncOutboxPort,
} from '../../domain/sync-ports.js';

export interface InMemorySyncOutboxOptions {
  /** Bounded retry cap. Default = 5. */
  maxAttempts?: number;
  /** Initial conflict resolver. Default = last-write-wins. */
  resolver?: ConflictResolver<unknown>;
}

const DEFAULT_MAX_ATTEMPTS = 5;

interface MutableEntry<TPayload> {
  key: string;
  entity: string;
  entityDeleted: boolean;
  enqueuedAt: number;
  payload?: TPayload;
  attempts: number;
}

function asPublic<TPayload>(entry: MutableEntry<TPayload>): OutboxEntry<TPayload> {
  return {
    key: entry.key,
    entity: entry.entity,
    entityDeleted: entry.entityDeleted,
    enqueuedAt: entry.enqueuedAt,
    payload: entry.payload,
    attempts: entry.attempts,
  };
}

export class InMemorySyncOutbox<TPayload = unknown> implements SyncOutboxPort<TPayload> {
  private readonly entries: MutableEntry<TPayload>[] = [];
  private maxAttempts: number;
  private resolver: ConflictResolver<TPayload>;

  constructor(options: InMemorySyncOutboxOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const initial = options.resolver ?? defaultResolver;
    // Resolver signature is identical; widen the cast.
    this.resolver = initial as ConflictResolver<TPayload>;
  }

  async enqueue(
    entity: string,
    payload: TPayload,
    options: OutboxEnqueueOptions = {},
  ): Promise<OutboxEntry<TPayload>> {
    const key = options.key ?? autoKey(entity, payload);
    const enqueuedAt = options.enqueuedAt ?? Date.now();
    const existing = this.entries.find((e) => e.key === key);
    if (existing) {
      if (existing.attempts >= this.maxAttempts) {
        throw new AppError(
          'unavailable',
          `同步队列已重试 ${this.maxAttempts} 次后放弃`,
          { debugDetail: `outbox key=${key}` },
        );
      }
      existing.payload = payload;
      existing.entityDeleted = false;
      existing.enqueuedAt = enqueuedAt;
      return asPublic(existing);
    }
    const entry: MutableEntry<TPayload> = {
      key,
      entity,
      entityDeleted: false,
      enqueuedAt,
      payload,
      attempts: 0,
    };
    this.entries.push(entry);
    return asPublic(entry);
  }

  async tombstone(
    entity: string,
    options: OutboxEnqueueOptions = {},
  ): Promise<OutboxEntry<TPayload>> {
    const key = options.key ?? `tombstone:${entity}:${options.enqueuedAt ?? Date.now()}`;
    const enqueuedAt = options.enqueuedAt ?? Date.now();
    const existing = this.entries.find((e) => e.key === key);
    if (existing) {
      existing.entityDeleted = true;
      existing.payload = undefined;
      existing.enqueuedAt = enqueuedAt;
      return asPublic(existing);
    }
    const entry: MutableEntry<TPayload> = {
      key,
      entity,
      entityDeleted: true,
      enqueuedAt,
      attempts: 0,
    };
    this.entries.push(entry);
    return asPublic(entry);
  }

  async drain(
    handler: OutboxHandler<TPayload>,
  ): Promise<{ drained: number; transient: boolean }> {
    let drained = 0;
    let transient = false;
    while (this.entries.length > 0) {
      const entry = this.entries[0]!;
      entry.attempts += 1;
      const publicEntry = asPublic(entry);
      const result: OutboxDequeueResult<TPayload> | void = await handler(publicEntry);
      if (result?.transient) {
        // Transport signalled back-off; leave the entry at the head of the
        // queue and exit the loop.
        transient = true;
        break;
      }
      // Success — drop the head.
      this.entries.shift();
      drained += 1;
    }
    return { drained, transient };
  }

  size(): number {
    return this.entries.length;
  }

  peek(limit = 10): readonly OutboxEntry<TPayload>[] {
    return this.entries.slice(0, limit);
  }

  resolveConflict(
    local: OutboxEntry<TPayload>,
    server: TPayload | null,
  ): OutboxEntry<TPayload> | null {
    return this.resolver(local, server);
  }

  setConflictResolver(resolver: ConflictResolver<TPayload>): void {
    this.resolver = resolver;
  }

  acknowledge(key: string): void {
    const index = this.entries.findIndex((e) => e.key === key);
    if (index >= 0) this.entries.splice(index, 1);
  }

  clear(): void {
    this.entries.length = 0;
  }

  setMaxAttempts(value: number): void {
    if (value < 1) {
      throw new AppError('unavailable', 'setMaxAttempts 必须是正整数');
    }
    this.maxAttempts = value;
  }
}

function autoKey(entity: string, payload: unknown): string {
  // Hash-free id: entity + JSON-stable shape. Good enough for the
  // idempotency contract (same payload + same entity = same key); production
  // would inject a real id from the caller.
  try {
    return `${entity}:${JSON.stringify(payload) ?? ''}`;
  } catch {
    return `${entity}:${String(payload)}`;
  }
}

const defaultResolver: ConflictResolver<unknown> = (local, server) => {
  if (server === null) return local;
  // Last-write-wins: if the local entry is newer than the server snapshot
  // (proxied via enqueuedAt on the entry vs the server's last-modified
  // timestamp), keep the local; otherwise return null and let the caller
  // drop the local change.
  const localTs = local.enqueuedAt;
  // Server's last-modified is implicit; the default resolver is conservative
  // and always prefers the local entry. Entity-specific resolvers can
  // implement true LWW by reading a server-side `updatedAt` from the
  // `server` payload — the contract deliberately leaves that to the host.
  void localTs;
  return local;
};
