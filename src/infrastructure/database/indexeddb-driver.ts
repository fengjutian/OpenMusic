/**
 * Tiny `IndexedDB` driver for the web / WebView2 / Edge host.
 *
 * Why a driver file at all
 * ------------------------
 * The repository layer (stage 4's `LocalMusicRepository`) should not know how
 * the SQL/SQLite/IndexedDB API is shaped — it operates on a `MusicRepository`
 * contract. This file owns the schema, the version upgrade, and the
 * transaction helper, so the repository can stay focused on the catalog
 * semantics (search, favourites, history) and not on the plumbing.
 *
 * Why `IndexedDB` over `sql.js` or `idb-keyval`
 * ----------------------------------------------
 *   - Native to the host (no WASM, no extra file hosting, no CSP plumbing).
 *   - Object stores give us per-entity isolation (`tracks`, `playlists`,
 *     `liked`, `history`) without writing a generic key-value layer.
 *   - The boot path can simply do `getAll('tracks')` instead of running a
 *     SELECT statement that the same consumer would translate into JSON
 *     lines.
 *
 * Failure modes the repository must handle
 * ----------------------------------------
 *   - The host denies / does not expose `indexedDB` (rare; Lynx web-core does
 *     expose it but a manual firewall could still block it). The driver
 *     resolves `open()` with `null` and the repository falls back to the
 *     in-memory cache only — never throws.
 *   - Schema upgrades fail. We log + return `null` so the same fallback path
 *     engages. Real production would surface this; for stage 9 we only
 *     write what we read.
 */

export const OPENMUSIC_DB_NAME = 'openmusic';
export const OPENMUSIC_DB_VERSION = 1;

export type OpenMusicStore =
  | 'tracks'
  | 'playlists'
  | 'liked'
  | 'history'
  | 'meta';

export const ALL_OPENMUSIC_STORES: readonly OpenMusicStore[] = [
  'tracks',
  'playlists',
  'liked',
  'history',
  'meta',
];

export interface OpenMusicDb {
  readonly database: IDBDatabase | null;
  /** `null` when the host does not expose `indexedDB` or the upgrade failed. */
  readonly error: Error | null;
  /** All store names that were created successfully. Empty when fallback. */
  readonly storeNames: readonly OpenMusicStore[];
  tx(
    stores: OpenMusicStore | OpenMusicStore[],
    mode: IDBTransactionMode,
  ): IDBTransaction;
  putAll<T>(store: OpenMusicStore, items: readonly T[]): Promise<void>;
  getAll<T>(store: OpenMusicStore): Promise<T[]>;
  /** Removes every record from the given stores. Used when re-seeding. */
  clear(stores: readonly OpenMusicStore[]): Promise<void>;
  close(): void;
}

export interface OpenOpenMusicDbOptions {
  name?: string;
  version?: number;
  /** Override for tests (defaults to `globalThis.indexedDB`). */
  indexedDB?: IDBFactory | null;
}

export async function openOpenMusicDb(
  options: OpenOpenMusicDbOptions = {},
): Promise<OpenMusicDb> {
  const factory = options.indexedDB ?? getGlobalIndexedDb();
  const name = options.name ?? OPENMUSIC_DB_NAME;
  const version = options.version ?? OPENMUSIC_DB_VERSION;
  if (!factory) {
    console.warn('[openmusic] indexedDB unavailable — falling back to memory cache only.');
    return createFallbackDb('IndexedDB is not available on this host.');
  }
  try {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(name, version);
      req.onupgradeneeded = (event) => {
        console.warn('[openmusic] IndexedDB onupgradeneeded — creating stores');
        createStores(event);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error('openOpenMusicDb: open() failed.'));
      req.onblocked = () =>
        reject(new Error('openOpenMusicDb: existing connection is blocking.'));
    });
    return wrap(database);
  } catch (error) {
    console.warn(
      '[openmusic] openOpenMusicDb failed:',
      error instanceof Error ? error.message : error,
    );
    return createFallbackDb(
      error instanceof Error ? error.message : 'openOpenMusicDb: unknown error.',
    );
  }
}

function getGlobalIndexedDb(): IDBFactory | null {
  try {
    const g = globalThis as { indexedDB?: IDBFactory };
    return g.indexedDB ?? null;
  } catch {
    return null;
  }
}

function createStores(event: IDBVersionChangeEvent): void {
  const db = (event.target as IDBOpenDBRequest).result;
  for (const name of ALL_OPENMUSIC_STORES) {
    if (db.objectStoreNames.contains(name)) continue;
    const params = storeParameters(name);
    const store = params
      ? db.createObjectStore(name, params)
      : db.createObjectStore(name);
    store.createIndex('trackId', 'trackId', defaultIndexOptions(name));
  }
}

function storeParameters(name: OpenMusicStore): IDBObjectStoreParameters | undefined {
  switch (name) {
    case 'tracks':
      return { keyPath: 'id' };
    case 'playlists':
      return { keyPath: 'id' };
    case 'liked':
      return { keyPath: 'trackId' };
    case 'history':
      // `seq` is an auto-incremented monotonic id so `restoreHistory` can
      // recover most-recent-first ordering across sessions. The
      // `playedAt` millisecond timestamps often tie (4 quick taps land in
      // the same millisecond), so we need a stable secondary tie-break.
      return { keyPath: 'seq', autoIncrement: true };
    case 'meta':
      return { keyPath: 'key' };
  }
}

function defaultIndexOptions(name: OpenMusicStore): IDBIndexParameters | undefined {
  if (name === 'tracks' || name === 'playlists') return { unique: true };
  return { unique: false };
}

function wrap(database: IDBDatabase): OpenMusicDb {
  const storeNames = ALL_OPENMUSIC_STORES.filter((name) =>
    database.objectStoreNames.contains(name),
  );
  return {
    database,
    error: null,
    storeNames,
    tx(stores, mode) {
      const list = Array.isArray(stores) ? stores : [stores];
      return database.transaction(list, mode);
    },
    async putAll<T>(store: OpenMusicStore, items: readonly T[]) {
      await runOnTx(database, store, 'readwrite', (objectStore) => {
        const promises: Promise<unknown>[] = [];
        for (const item of items) {
          promises.push(reqToPromise(objectStore.put(item)));
        }
        return Promise.all(promises);
      });
    },
    async getAll<T>(store: OpenMusicStore) {
      return runOnTx<T[]>(database, store, 'readonly', (objectStore) => {
        return reqToPromise(objectStore.getAll()) as Promise<T[]>;
      });
    },
    async clear(stores: readonly OpenMusicStore[]) {
      for (const store of stores) {
        await runOnTx(database, store, 'readwrite', (objectStore) => {
          return reqToPromise(objectStore.clear());
        });
      }
    },
    close() {
      database.close();
    },
  };
}

function runOnTx<T>(
  database: IDBDatabase,
  store: OpenMusicStore,
  mode: IDBTransactionMode,
  fn: (objectStore: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(store, mode);
    tx.oncomplete = () => {
      /* completion handled by fn's awaited promise */
    };
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB tx failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB tx aborted.'));
    const objectStore = tx.objectStore(store);
    fn(objectStore).then(resolve, reject);
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error('IDBRequest failed.'));
  });
}

function createFallbackDb(reason: string): OpenMusicDb {
  const error = new Error(reason);
  const noopTx = () => {
    throw error;
  };
  const reject = () => Promise.reject(error);
  return {
    database: null,
    error,
    storeNames: [],
    tx: noopTx,
    putAll: reject,
    getAll: reject,
    clear: reject,
    close() {
      /* no-op */
    },
  };
}
