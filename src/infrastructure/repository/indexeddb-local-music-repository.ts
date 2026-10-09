/**
 * Persistent `MusicRepository` for the web / WebView2 / Edge host.
 *
 * Extends `LocalMusicRepository` (in-memory cache) with an `IndexedDB`
 * write-through layer. The split is intentional: reads stay sync against
 * the cache so the existing `MusicRepository` semantics (sync `isLiked`,
 * sync `markPlayed`) keep working unchanged; writes flip the cache and
 * then await an `IndexedDB` commit. On construction the cache is hydrated
 * from `IndexedDB` (or seeded once when the DB is empty), so a refresh
 * preserves the user's catalog without re-importing files.
 *
 * Why extension and not composition
 * ---------------------------------
 * `LocalMusicRepository` already exposes the search / shelf / pagination
 * logic. Wrapping it would require either forwarding every method or
 * re-implementing them. Subclassing keeps the implementation in one place
 * and lets the parent stay self-contained for stage-4 unit tests.
 *
 * Failure modes
 * -------------
 *   - Host without `indexedDB` (rare; documented). `openOpenMusicDb` resolves
 *     with a fallback `OpenMusicDb`. Methods still work using only the
 *     in-memory cache; persistence is silently skipped.
 *   - Schema upgrade fails. Same fallback path. The repository survives
 *     with the seed the bootstrapper handed in.
 *   - Hydration race: a write that lands before `ready()` resolves hits the
 *     cache and the IDB queue. The write goes through after hydration; if
 *     hydration empties the rows out from under us, the next read shows
 *     the post-hydration truth (no orphan likes). `ready()` is the gate
 *     every caller should await before observing state.
 */

import { AppError, CancellationError } from '../../domain/errors.js';
import type {
  ID,
  PageResult,
  Playlist,
  Track,
} from '../../domain/models.js';
import type {
  MusicRepository,
  RequestContext,
} from '../../domain/ports.js';
import {
  type OpenMusicDb,
  type OpenMusicStore,
  openOpenMusicDb,
} from '../database/indexeddb-driver.js';
import { LocalMusicRepository } from './local-music-repository.js';

export interface IndexedDbLocalMusicRepositoryOptions {
  /** First-run seed (typically tracks the host's file picker just imported). */
  seed?: Track[];
  initialLiked?: Iterable<ID>;
  name?: string;
  /** Override for tests: factory used to construct the driver. */
  openDb?: typeof openOpenMusicDb;
}

interface LikedRow {
  trackId: ID;
  likedAt: number;
}

interface HistoryRow {
  trackId: ID;
  playedAt: number;
}

export class IndexedDbLocalMusicRepository
  extends LocalMusicRepository
  implements MusicRepository {
  private db: OpenMusicDb | null = null;
  private readonly openFn: typeof openOpenMusicDb;
  private hydrationError: Error | null = null;
  private readonly readyPromise: Promise<void>;

  constructor(options: IndexedDbLocalMusicRepositoryOptions = {}) {
    super({
      tracks: options.seed ?? [],
      initialLiked: options.initialLiked,
    });
    this.openFn = options.openDb ?? openOpenMusicDb;
    this.readyPromise = this.openAndHydrate(options.name);
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  /**
   * Resolve once hydration finishes. UI/tests should `await ready()` before
   * observing catalog state — until then, only the constructor seed is in
   * the cache.
   */
  async ready(): Promise<void> {
    return this.readyPromise;
  }

  /**
   * True when an `IndexedDB` error prevented persistence. The repository
   * still works in memory; this is for diagnostics.
   */
  get persistentError(): Error | null {
    return this.hydrationError;
  }

  /**
   * Replace the catalog contents and persist them. Used by the host each
   * time the user re-picks a music directory (the host reloads, which
   * re-runs the bootstrap).
   */
  async importTracks(seed: Track[]): Promise<void> {
    await this.readyPromise;
    this.loadCatalog({ tracks: seed });
    if (!this.db || this.db.error) return;
    await this.replaceCatalogInIdb(seed);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  // ---------------------------------------------------------------------
  // Write-through overrides
  // ---------------------------------------------------------------------

  override async setLiked(
    trackId: ID,
    liked: boolean,
    ctx?: RequestContext,
  ): Promise<void> {
    await this.readyPromise;
    await super.setLiked(trackId, liked, ctx);
    if (!this.db || this.db.error) return;
    if (liked) {
      const row: LikedRow = { trackId, likedAt: Date.now() };
      await this.db.putAll('liked', [row]);
    } else {
      // `clear` is the only way to delete by key in our small driver.
      await runOnTxSafely(this.db, 'liked', 'readwrite', (store) => ({
        delete: store.delete(trackId),
      }));
    }
  }

  override markPlayed(trackId: ID): void {
    super.markPlayed(trackId);
    if (!this.db || this.db.error) return;
    const row: HistoryRow = { trackId, playedAt: Date.now() };
    void this.db.putAll('history', [row]);
  }

  override listTracks(
    cursor?: string,
    limit?: number,
    ctx?: RequestContext,
  ): Promise<PageResult<Track>> {
    // `ready()` is awaited inside the override so callers don't need to
    // guard the first call after construction.
    return this.readyPromise.then(() => super.listTracks(cursor, limit, ctx));
  }

  override getHome(ctx?: RequestContext) {
    return this.readyPromise.then(() => super.getHome(ctx));
  }

  override getLibrary(ctx?: RequestContext) {
    return this.readyPromise.then(() => super.getLibrary(ctx));
  }

  override search(
    query: string,
    type?: import('../../domain/models.js').SearchType,
    cursor?: string,
    ctx?: RequestContext,
  ) {
    return this.readyPromise.then(() => super.search(query, type, cursor, ctx));
  }

  override getPlaylist(id: ID, ctx?: RequestContext) {
    return this.readyPromise.then(() => super.getPlaylist(id, ctx));
  }

  override getAlbum(id: ID, ctx?: RequestContext) {
    return this.readyPromise.then(() => super.getAlbum(id, ctx));
  }

  override getArtist(id: ID, ctx?: RequestContext) {
    return this.readyPromise.then(() => super.getArtist(id, ctx));
  }

  override getLyrics(trackId: ID, ctx?: RequestContext) {
    return this.readyPromise.then(() => super.getLyrics(trackId, ctx));
  }

  override registerPlaylist(playlist: Playlist): void {
    super.registerPlaylist(playlist);
    if (!this.db || this.db.error) return;
    void this.db.putAll('playlists', [playlist]);
  }

  // ---------------------------------------------------------------------
  // Internal: open + seed + hydrate
  // ---------------------------------------------------------------------

  private async openAndHydrate(name?: string): Promise<void> {
    try {
      const db = await this.openFn(name ? { name } : undefined);
      this.db = db;
      if (db.error) {
        this.hydrationError = db.error;
        return;
      }
      const existing = await db.getAll<Track>('tracks');
      const callerHasSeed = this.tracks.length > 0;
      const seedDisagreesWithDisk =
        callerHasSeed && this.seedDiffers(this.tracks, existing);

      if (existing.length === 0 && callerHasSeed) {
        // First boot for this user. Persist whatever the bootstrapper passed.
        await db.putAll('tracks', this.tracks);
        if (this.liked.size > 0) {
          const rows = [...this.liked].map<LikedRow>((trackId) => ({
            trackId,
            likedAt: Date.now(),
          }));
          await db.putAll('liked', rows);
        }
      } else if (seedDisagreesWithDisk) {
        // Caller re-imported a different folder — trust the caller, keep
        // likes across reseeds (the file picker does not affect favourites).
        await db.clear(['tracks']);
        await db.putAll('tracks', this.tracks);
      } else {
        // Either no seed supplied (typical refresh after first boot), or
        // seed matches disk. Hydrate likes and history so previous-session
        // state surfaces immediately.
        if (existing.length === 0) {
          // Truly empty — confirm cache reflects that.
          this.loadCatalog({ tracks: [] });
        } else if (callerHasSeed) {
          // Caller passed an identical seed; disk already has it. Hydrate
          // from disk so likes/history side-effects that landed while the
          // connection was idle survive.
          this.loadCatalog({ tracks: existing });
        }
        const likedRows = await db.getAll<LikedRow>('liked');
        const historyRows = await db.getAll<HistoryRow>('history');
        this.loadCatalog({
          tracks: existing,
          initialLiked: likedRows.map((row) => row.trackId),
        });
        this.restoreHistory(historyRows);
      }
    } catch (error) {
      this.hydrationError =
        error instanceof Error ? error : new Error(String(error));
    }
  }

  private seedDiffers(seed: Track[], existing: Track[]): boolean {
    if (seed.length !== existing.length) return true;
    const existingIds = new Set(existing.map((t) => t.id));
    for (const track of seed) {
      if (!existingIds.has(track.id)) return true;
    }
    return false;
  }

  private restoreHistory(rows: HistoryRow[]): void {
    const orderedRows = [...rows].sort((a, b) => b.playedAt - a.playedAt);
    this.history = orderedRows.slice(0, 50).map((row) => row.trackId);
  }

  private async replaceCatalogInIdb(seed: Track[]): Promise<void> {
    if (!this.db) return;
    await this.db.clear(['tracks']);
    if (seed.length > 0) {
      await this.db.putAll('tracks', seed);
    }
  }
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

/**
 * Mirrors `openOpenMusicDb`'s `tx` semantics but quietly swallows the
 * "no DB" case — the parent `setLiked(trackId, false)` already mutated the
 * cache, so a missing store should not throw.
 */
function runOnTxSafely(
  db: OpenMusicDb,
  store: OpenMusicStore,
  mode: IDBTransactionMode,
  fn: (objectStore: IDBObjectStore) => { delete?: IDBRequest },
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (db.error) {
      resolve();
      return;
    }
    try {
      const tx = db.tx(store, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      const objectStore = tx.objectStore(store);
      const { delete: del } = fn(objectStore);
      void del;
    } catch {
      resolve();
    }
  });
}

// Re-export so external callers can `import { AppError, CancellationError }`
// from the repository barrel.
export { AppError, CancellationError };
