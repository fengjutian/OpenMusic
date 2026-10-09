/**
 * Stage 10 — data export format (execution handbook §13 stage-10 item 1).
 *
 * Two-platform data compatibility hinges on a stable, versioned JSON shape
 * the same `MusicRepository` (Android + Windows) can round-trip. The
 * exporter here emits `schemaVersion: 1` documents; the importer rejects
 * unknown versions so we never silently mis-import older or newer data.
 *
 * Why JSON, not a binary format
 * -----------------------------
 * The handbook permits both. JSON is human-readable, diff-friendly, and
 * trivially writable in the current `IndexedDbLocalMusicRepository`
 * implementation. A binary format (proto / msgpack) belongs in a future
 * change once the schema stabilises.
 *
 * What is NOT exported
 * --------------------
 * - `audioUrl`: object URLs (blob:) are session-scoped and meaningless on
 *   another machine. Imported libraries must re-link files via the file
 *   picker; the importer keeps the `Track` shell and flags `audioUrl`
 *   absent so the UI can show a "重新选择文件" affordance.
 * - `playbackHistory`: per-device signal; the receiving side computes a
 *   fresh one.
 */

import type { Track } from '../../domain/models.js';
import type { MusicRepository } from '../../domain/ports.js';

export const CATALOG_EXPORT_SCHEMA_VERSION = 1 as const;

export interface CatalogExportV1 {
  readonly schemaVersion: typeof CATALOG_EXPORT_SCHEMA_VERSION;
  readonly exportedAt: number;
  readonly source: string;
  readonly tracks: readonly ExportableTrack[];
  readonly likedIds: readonly string[];
  readonly playlists: readonly ExportablePlaylist[];
}

interface ExportableTrack extends Omit<Track, 'audioUrl'> {
  /**
   * Preserved verbatim when the source has a non-`blob:` URL (e.g. an asset
   * scheme); `null` for `blob:` URLs so the receiving side knows to re-link.
   * `undefined` when the source track never had a URL (unplayable stub).
   */
  readonly audioUrl: string | null | undefined;
}

interface ExportablePlaylist {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly coverUrl: string;
  readonly creatorName: string;
  readonly trackIds: readonly string[];
}

export class CatalogExportError extends Error {
  constructor(message: string, public readonly code: 'unsupported-version' | 'parse') {
    super(message);
    this.name = 'CatalogExportError';
  }
}

export interface ExportOptions {
  /** Human-readable source label, e.g. "windows-web". Persisted in the export. */
  source?: string;
}

/**
 * Pull every track + like + playlist from a `MusicRepository` and serialise
 * it as a `CatalogExportV1` document. List pagination is honoured so the
 * exporter does not load the whole library at once on 10k-track catalogs.
 */
export async function exportCatalog(
  repo: MusicRepository,
  options: ExportOptions = {},
): Promise<CatalogExportV1> {
  const tracks: ExportableTrack[] = [];
  let cursor: string | undefined;
  do {
    const page = await repo.listTracks(cursor, 500);
    for (const track of page.items) {
      tracks.push(serializeTrack(track));
    }
    cursor = page.nextCursor;
  } while (cursor);

  const library = await repo.getLibrary();
  const likedIds = library.likedTracks.map((t) => t.id);
  const playlists: ExportablePlaylist[] = library.playlists.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description ?? '',
    coverUrl: p.coverUrl ?? '',
    creatorName: p.creatorName ?? '',
    trackIds: (p.tracks ?? []).map((t) => t.id),
  }));

  return {
    schemaVersion: CATALOG_EXPORT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    source: options.source ?? 'openmusic',
    tracks,
    likedIds,
    playlists,
  };
}

/**
 * Parse a `CatalogExportV1` JSON string. Throws `CatalogExportError` on
 * unsupported schema versions or malformed JSON; the caller is responsible
 * for surfacing the failure to the UI.
 */
export function parseCatalogExport(raw: string): CatalogExportV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CatalogExportError(
      '导出文件不是有效 JSON',
      'parse',
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new CatalogExportError('导出文件根必须是对象', 'parse');
  }
  const candidate = parsed as Partial<CatalogExportV1>;
  if (candidate.schemaVersion !== CATALOG_EXPORT_SCHEMA_VERSION) {
    throw new CatalogExportError(
      `不支持的 schemaVersion=${String(candidate.schemaVersion)}（当前 ${CATALOG_EXPORT_SCHEMA_VERSION}）`,
      'unsupported-version',
    );
  }
  if (!Array.isArray(candidate.tracks) || !Array.isArray(candidate.likedIds) || !Array.isArray(candidate.playlists)) {
    throw new CatalogExportError('导出文件缺少 tracks / likedIds / playlists 数组', 'parse');
  }
  return candidate as CatalogExportV1;
}

function serializeTrack(track: Track): ExportableTrack {
  // `blob:` URLs are session-scoped (URL.createObjectURL); strip them so the
  // receiving side knows to ask the user to re-link. Other schemes (e.g.
  // `asset://`) survive the round-trip. Tracks without a URL at all keep
  // `undefined` so the importer can flag them as "needs relink".
  const isBlob = typeof track.audioUrl === 'string' && track.audioUrl.startsWith('blob:');
  return {
    ...track,
    audioUrl: isBlob ? null : track.audioUrl,
  };
}
