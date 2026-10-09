/**
 * Stage 10 in-memory sync outbox tests. Covers the four hard requirements
 * the execution handbook §13 stage-10 item 4 names: idempotency, tombstones,
 * bounded retry, and conflict resolution.
 */

import { describe, expect, it } from '@rstest/core';

import { AppError } from '../../../domain/errors.js';
import type { OutboxEntry } from '../../../domain/sync-ports.js';
import {
  InMemorySyncOutbox,
} from '../in-memory-sync-outbox.js';

describe('InMemorySyncOutbox', () => {
  it('enqueue is idempotent on the same key', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    await box.enqueue('liked', { name: 'a' }, { key: 'k1' });
    const second = await box.enqueue('liked', { name: 'b' }, { key: 'k1' });
    // The contract exposes read-only snapshots; equality is verified via
    // the underlying queue size and the returned payload.
    expect(box.size()).toBe(1);
    expect(second.payload).toEqual({ name: 'b' });
  });

  it('tombstone replaces an existing non-tombstone entry with the same key', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    await box.enqueue('liked', { name: 'a' }, { key: 'tr_01' });
    const tomb = await box.tombstone('liked', { key: 'tr_01' });
    expect(tomb.entityDeleted).toBe(true);
    expect(tomb.payload).toBeUndefined();
    expect(box.size()).toBe(1);
  });

  it('drain increments attempts and drops on success', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    await box.enqueue('liked', { name: 'a' }, { key: 'k1', enqueuedAt: 1 });
    await box.enqueue('liked', { name: 'b' }, { key: 'k2', enqueuedAt: 2 });
    const drained: string[] = [];
    const result = await box.drain(async (entry) => {
      drained.push(entry.key);
    });
    expect(drained).toEqual(['k1', 'k2']);
    expect(result).toEqual({ drained: 2, transient: false });
    expect(box.size()).toBe(0);
  });

  it('drain stops on transient: true and leaves the head of the queue', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    await box.enqueue('liked', { name: 'a' }, { key: 'k1' });
    await box.enqueue('liked', { name: 'b' }, { key: 'k2' });
    const result = await box.drain(async (entry) => {
      if (entry.key === 'k1') {
        return { entry, transient: true };
      }
      void entry;
    });
    expect(result).toEqual({ drained: 0, transient: true });
    expect(box.size()).toBe(2);
    expect(box.peek()[0]?.key).toBe('k1');
    // The head entry's attempt counter must have been bumped.
    expect(box.peek()[0]?.attempts).toBe(1);
  });

  it('rejects enqueue past the bounded retry cap', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>({ maxAttempts: 2 });
    await box.enqueue('liked', { name: 'a' }, { key: 'k1' });
    // Bump attempts by calling drain with a transient handler.
    await box.drain(async () => ({ entry: box.peek()[0]!, transient: true }));
    await box.drain(async () => ({ entry: box.peek()[0]!, transient: true }));
    // Now attempts === 2 (== maxAttempts). The next enqueue with the same
    // key should throw.
    await expect(
      box.enqueue('liked', { name: 'b' }, { key: 'k1' }),
    ).rejects.toThrow(/已重试/);
    expect(box.size()).toBe(1);
  });

  it('default conflict resolver is last-write-wins (returns the local entry)', () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    const local: OutboxEntry<{ name: string }> = {
      key: 'k1',
      entity: 'liked',
      entityDeleted: false,
      enqueuedAt: 1_000,
      payload: { name: 'local' },
      attempts: 0,
    };
    const server = { name: 'server' };
    const resolved = box.resolveConflict(local, server);
    expect(resolved).toBe(local);
  });

  it('host-registered resolver can drop the local change', () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    box.setConflictResolver(() => null);
    const local: OutboxEntry<{ name: string }> = {
      key: 'k1',
      entity: 'liked',
      entityDeleted: false,
      enqueuedAt: 1_000,
      payload: { name: 'local' },
      attempts: 0,
    };
    expect(box.resolveConflict(local, { name: 'server' })).toBeNull();
  });

  it('acknowledge drops an entry by key', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    await box.enqueue('liked', { name: 'a' }, { key: 'k1' });
    await box.enqueue('liked', { name: 'b' }, { key: 'k2' });
    box.acknowledge('k1');
    expect(box.size()).toBe(1);
    expect(box.peek()[0]?.key).toBe('k2');
  });

  it('clear empties the queue', async () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    await box.enqueue('liked', { name: 'a' });
    await box.enqueue('liked', { name: 'b' });
    box.clear();
    expect(box.size()).toBe(0);
  });

  it('setMaxAttempts throws on non-positive values', () => {
    const box = new InMemorySyncOutbox<{ name: string }>();
    expect(() => box.setMaxAttempts(0)).toThrow(AppError);
    expect(() => box.setMaxAttempts(-1)).toThrow(AppError);
  });
});
