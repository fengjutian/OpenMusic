/**
 * Stage 9.6 + 10 hardening — `runOnTx` abort handling.
 *
 * The pre-fix driver resolved the outer promise as soon as the caller's
 * `fn(objectStore)` returned, then tried to reject on `tx.onerror` /
 * `tx.onabort` even though the promise had already settled. Real
 * `IndexedDB` fires `onerror` *after* the individual request's
 * `onsuccess` in some scenarios (deferred constraint checks, mid-tx
 * `onversionchange` aborts), so the bug produced a silent-success path
 * that left callers believing the write landed when it had not.
 *
 * These tests pin the contract:
 *   - happy path: `fn` resolves + `tx.oncomplete` → outer resolves
 *   - `tx.abort()` after `fn` resolves: outer must reject, not resolve
 *   - `fn` rejects: outer must reject
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from '@rstest/core';

import { runOnTx } from '../indexeddb-driver.js';

const STORE = 'tracks';

let testCounter = 0;
function uniqueDbName(prefix: string): string {
  testCounter += 1;
  return `${prefix}-${Date.now()}-${testCounter}`;
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

describe('runOnTx (stage 9.6 hardening)', () => {
  let db: IDBDatabase;
  let dbName: string;
  beforeEach(async () => {
    dbName = uniqueDbName('openmusic-runOnTx');
    db = await openDb(dbName);
  });
  afterEach(() => {
    db.close();
  });

  it('resolves only after tx.oncomplete fires', async () => {
    const result = await runOnTx(db, STORE, 'readwrite', (objectStore) => {
      return new Promise<number>((resolve, reject) => {
        const req = objectStore.put({ id: 't1', name: 'a' });
        req.onsuccess = () => resolve(1);
        req.onerror = () => reject(req.error);
      });
    });
    expect(result).toBe(1);
  });

  it('rejects when fn rejects (constraint-error in fn chain)', async () => {
    await expect(
      runOnTx(db, STORE, 'readwrite', () =>
        Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom');
  });

  it('rejects when the tx is aborted AFTER fn resolves (the pre-fix bug)', async () => {
    // The previous version of runOnTx would resolve the outer promise as
    // soon as fn's promise resolved, so this test would fail. After the
    // fix, the outer promise must wait for tx.oncomplete (which never
    // fires after a manual abort, so we must reject via tx.onabort).
    const outer = runOnTx(db, STORE, 'readwrite', (objectStore) => {
      // objectStore.transaction is the parent IDBTransaction; abort it
      // on the next microtask AFTER fn has resolved.
      const tx = objectStore.transaction;
      queueMicrotask(() => tx.abort());
      return Promise.resolve(42);
    });
    await expect(outer).rejects.toThrow();
  });
});
