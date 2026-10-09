/**
 * Stage 10 catalog export tests. Round-trip + schema-version guard.
 */

import { describe, expect, it } from '@rstest/core';

import { AppError } from '../../../domain/errors.js';
import type {
  AlbumDetail,
  ArtistDetail,
  ID,
  LibraryPayload,
  LyricLine,
  PageResult,
  Playlist,
  SearchPayload,
  Track,
} from '../../../domain/models.js';
import type { MusicRepository, RequestContext } from '../../../domain/ports.js';
import {
  CATALOG_EXPORT_SCHEMA_VERSION,
  CatalogExportError,
  exportCatalog,
  parseCatalogExport,
} from '../catalog-exporter.js';

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `track ${id}`,
    artists: [{ id: 'ar_1', name: '林听白' }],
    album: { id: 'al_1', title: '本地专辑', coverUrl: '', year: 2024 },
    coverUrl: '',
    durationMs: 200_000,
    playable: true,
    audioUrl: `blob:http://localhost/${id}`,
    source: 'local',
    ...overrides,
  };
}

/**
 * Test-local fake so we don't have to fight `MockMusicRepository`'s
 * hardcoded history. Implements just enough of `MusicRepository` for the
 * exporter to walk.
 */
class StubRepo implements MusicRepository {
  private readonly tracks: Track[];
  private readonly likedSet: Set<string>;
  constructor(tracksArg: Track[], likedIds: string[] = []) {
    this.tracks = tracksArg;
    this.likedSet = new Set(likedIds);
  }
  async listTracks(cursor?: string, limit = 30): Promise<PageResult<Track>> {
    const offset = cursor ? Number(cursor) : 0;
    const items = this.tracks.slice(offset, offset + limit);
    const next = offset + limit;
    return {
      items,
      hasMore: next < this.tracks.length,
      nextCursor: next < this.tracks.length ? String(next) : undefined,
    };
  }
  async getLibrary(): Promise<LibraryPayload> {
    return {
      likedTracks: this.tracks.filter((t) => this.likedSet.has(t.id)),
      playlists: [],
      albums: [],
      artists: [],
      recentTracks: this.tracks,
    };
  }
  async getHome(): ReturnType<MusicRepository['getHome']> {
    return {
      greetingName: 'ok',
      continueListening: undefined,
      shelves: [],
    };
  }
  async search(): Promise<SearchPayload> {
    return {
      query: '',
      tracks: [],
      artists: [],
      albums: [],
      playlists: [],
      hasResults: false,
      suggestions: [],
    };
  }
  async getPlaylist(_id: ID, _ctx?: RequestContext): Promise<Playlist> {
    throw new AppError('unavailable', 'not used');
  }
  async getAlbum(_id: ID, _ctx?: RequestContext): Promise<AlbumDetail> {
    throw new AppError('unavailable', 'not used');
  }
  async getArtist(_id: ID, _ctx?: RequestContext): Promise<ArtistDetail> {
    throw new AppError('unavailable', 'not used');
  }
  async getLyrics(_id: ID, _ctx?: RequestContext): Promise<LyricLine[]> {
    return [];
  }
  async setLiked(_id: ID, _liked: boolean, _ctx?: RequestContext): Promise<void> {
    /* not used */
  }
  isLiked(trackId: string) {
    return this.likedSet.has(trackId);
  }
  markPlayed() {
    /* not used */
  }
  recent() {
    return [];
  }
}

describe('CatalogExporter (stage 10)', () => {
  it('emits a v1 document with tracks, likes, and playlists', async () => {
    const repo = new StubRepo(
      [
        track('tr_01'),
        track('tr_02', { audioUrl: 'asset://local/tr_02' }),
        track('tr_03'),
      ],
      ['tr_01'],
    );
    const exported = await exportCatalog(repo, { source: 'unit-test' });
    expect(exported.schemaVersion).toBe(CATALOG_EXPORT_SCHEMA_VERSION);
    expect(exported.source).toBe('unit-test');
    expect(exported.tracks.length).toBe(3);
    expect(exported.tracks.find((t) => t.id === 'tr_01')?.audioUrl).toBeNull();
    expect(
      exported.tracks.find((t) => t.id === 'tr_02')?.audioUrl,
    ).toBe('asset://local/tr_02');
    expect(exported.likedIds).toEqual(['tr_01']);
  });

  it('round-trips through JSON.parse without losing the schema marker', async () => {
    const repo = new StubRepo([track('tr_01'), track('tr_02')]);
    const exported = await exportCatalog(repo);
    const parsed = parseCatalogExport(JSON.stringify(exported));
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.tracks.map((t) => t.id)).toEqual(['tr_01', 'tr_02']);
  });

  it('rejects unsupported schema versions', () => {
    const wrong = JSON.stringify({
      schemaVersion: 999,
      exportedAt: 0,
      source: 'x',
      tracks: [],
      likedIds: [],
      playlists: [],
    });
    expect(() => parseCatalogExport(wrong)).toThrowError(CatalogExportError);
    try {
      parseCatalogExport(wrong);
    } catch (cause) {
      expect(cause).toBeInstanceOf(CatalogExportError);
      expect((cause as CatalogExportError).code).toBe('unsupported-version');
    }
  });

  it('rejects malformed JSON with a parse-error code', () => {
    expect(() => parseCatalogExport('not json')).toThrowError(CatalogExportError);
    try {
      parseCatalogExport('not json');
    } catch (cause) {
      expect((cause as CatalogExportError).code).toBe('parse');
    }
  });
});
