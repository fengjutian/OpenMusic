/**
 * SQLite schema (technical spec §18). The database is the authoritative source
 * for metadata; audio files stay where the user put them.
 *
 * Migrations are append-only and pure strings so they can be unit-tested
 * without a database driver. `src/infrastructure/database/migrator.ts` applies
 * them transactionally against a `SqlDriver`.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
}

export const SCHEMA_VERSION = 1;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial-library',
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_version (
         version INTEGER PRIMARY KEY,
         applied_at INTEGER NOT NULL
       )`,

      `CREATE TABLE IF NOT EXISTS tracks (
         id TEXT PRIMARY KEY,
         file_identity TEXT NOT NULL,
         path TEXT NOT NULL,
         title TEXT NOT NULL,
         album_id TEXT,
         duration_ms INTEGER NOT NULL DEFAULT 0,
         size_bytes INTEGER NOT NULL DEFAULT 0,
         modified_at INTEGER NOT NULL DEFAULT 0,
         content_hash TEXT,
         availability TEXT NOT NULL DEFAULT 'available',
         added_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_identity ON tracks(file_identity)`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title)`,
      `CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album_id)`,

      `CREATE TABLE IF NOT EXISTS artists (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         normalized_name TEXT NOT NULL
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_artists_normalized ON artists(normalized_name)`,

      `CREATE TABLE IF NOT EXISTS albums (
         id TEXT PRIMARY KEY,
         title TEXT NOT NULL,
         album_artist_id TEXT,
         year INTEGER,
         artwork_key TEXT
       )`,

      `CREATE TABLE IF NOT EXISTS track_artists (
         track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
         role TEXT NOT NULL DEFAULT 'primary',
         position INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY (track_id, artist_id, role)
       )`,

      `CREATE TABLE IF NOT EXISTS playlists (
         id TEXT PRIMARY KEY,
         name TEXT NOT NULL,
         type TEXT NOT NULL DEFAULT 'user',
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL,
         deleted_at INTEGER
       )`,

      `CREATE TABLE IF NOT EXISTS playlist_items (
         id TEXT PRIMARY KEY,
         playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
         track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         position INTEGER NOT NULL,
         added_at INTEGER NOT NULL,
         deleted_at INTEGER
       )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_items_unique
         ON playlist_items(playlist_id, track_id) WHERE deleted_at IS NULL`,

      `CREATE TABLE IF NOT EXISTS favorites (
         entity_type TEXT NOT NULL,
         entity_id TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         deleted_at INTEGER,
         PRIMARY KEY (entity_type, entity_id)
       )`,

      `CREATE TABLE IF NOT EXISTS play_history (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         started_at INTEGER NOT NULL,
         completed INTEGER NOT NULL DEFAULT 0,
         position_ms INTEGER NOT NULL DEFAULT 0
       )`,
      `CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id, started_at DESC)`,

      `CREATE TABLE IF NOT EXISTS lyrics (
         track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
         source TEXT NOT NULL,
         language TEXT,
         content TEXT,
         parsed_json TEXT,
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (track_id, source)
       )`,

      `CREATE TABLE IF NOT EXISTS scan_roots (
         id TEXT PRIMARY KEY,
         platform TEXT NOT NULL,
         uri TEXT NOT NULL,
         display_name TEXT NOT NULL,
         permission_state TEXT NOT NULL,
         last_scan_at INTEGER
       )`,

      `CREATE TABLE IF NOT EXISTS scan_runs (
         id TEXT PRIMARY KEY,
         started_at INTEGER NOT NULL,
         finished_at INTEGER,
         status TEXT NOT NULL,
         stats_json TEXT
       )`,

      `CREATE TABLE IF NOT EXISTS settings (
         key TEXT PRIMARY KEY,
         value_json TEXT NOT NULL,
         updated_at INTEGER NOT NULL
       )`,

      `CREATE TABLE IF NOT EXISTS sync_changes (
         id TEXT PRIMARY KEY,
         entity_type TEXT NOT NULL,
         entity_id TEXT NOT NULL,
         operation TEXT NOT NULL,
         payload_json TEXT,
         version INTEGER NOT NULL DEFAULT 1,
         created_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_sync_changes_created ON sync_changes(created_at)`,
    ],
  },
];