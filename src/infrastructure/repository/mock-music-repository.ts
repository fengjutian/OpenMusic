/**
 * `MockMusicRepository` — the swappable stand-in required by technical spec §2.6
 * ("后端暂缺时使用可替换的 Mock Repository，并清晰标注边界").
 *
 * Boundaries, explicitly:
 *  - data is in-memory only; it is lost on process restart
 *  - latency and failures are simulated so the four async states are reachable
 *  - the contract is identical to `MusicRepository`, so a SQLite-backed
 *    implementation can replace it without touching a single page
 */

import { AppError, CancellationError } from '../../domain/errors.js';
import { mergeById, normalizeQuery, relevanceScore, rewriteSuggestions } from '../../domain/search.js';
import type {
  AlbumDetail,
  ArtistDetail,
  HomePayload,
  ID,
  LibraryPayload,
  LyricLine,
  PageResult,
  Playlist,
  SearchPayload,
  SearchType,
  Track,
} from '../../domain/models.js';
import type { MusicRepository, RequestContext } from '../../domain/ports.js';
import { sortLyrics } from '../../domain/lyrics.js';
import { SEED_LYRICS, SEED_PLAYLISTS, SEED_TRACKS } from './seed-data.js';

export interface MockRepositoryOptions {
  /** Artificial latency in ms; 0 in unit tests. */
  latencyMs?: number;
  /** Fraction of requests that reject, for exercising the error state. */
  failureRate?: number;
  tracks?: Track[];
}

export class MockMusicRepository implements MusicRepository {
  private readonly latencyMs: number;
  private readonly failureRate: number;
  private readonly tracks: Track[];
  private readonly playlists: Playlist[];
  private readonly liked = new Set<ID>(['tr_01', 'tr_03', 'tr_09']);
  private history: ID[] = ['tr_01', 'tr_06', 'tr_09', 'tr_03'];

  constructor(options: MockRepositoryOptions = {}) {
    this.latencyMs = options.latencyMs ?? 180;
    this.failureRate = options.failureRate ?? 0;
    this.tracks = (options.tracks ?? SEED_TRACKS).map((track) => ({ ...track }));
    this.playlists = SEED_PLAYLISTS.map((p) => ({ ...p }));
  }

  private async gate(ctx?: RequestContext): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.latencyMs));
    }
    ctx?.signal?.throwIfAborted?.();
    if (ctx?.signal?.aborted) throw new CancellationError();
    if (this.failureRate > 0 && Math.random() < this.failureRate) {
      throw new AppError('network', '网络不太顺畅，请稍后重试');
    }
  }

  async getHome(ctx?: RequestContext): Promise<HomePayload> {
    await this.gate(ctx);
    const playable = this.tracks.filter((x) => x.playable);

    const continueListening = this.history.length
      ? {
          id: 'continue',
          title: '继续收听',
          subtitle: '接着上次播放',
          layout: 'horizontal' as const,
          items: this.history.slice(0, 5).map((id) => this.toTrackItem(this.find(id))),
        }
      : undefined;

    return {
      greetingName: '音乐爱好者',
      continueListening,
      shelves: [
        {
          id: 'recent',
          title: '最近播放',
          subtitle: '本地',
          layout: 'horizontal',
          items: this.history.slice(0, 5).map((id) => this.toTrackItem(this.find(id))),
        },
        {
          id: 'featured',
          title: '焦点推荐',
          subtitle: '根据你的本地曲库整理',
          layout: 'grid',
          items: this.playlists.map((p) => ({
            kind: 'playlist' as const,
            id: p.id,
            title: p.title,
            subtitle: p.description ?? p.creatorName ?? '',
            coverUrl: p.coverUrl,
            playlist: p,
          })),
        },
        {
          id: 'new',
          title: '新歌速递',
          subtitle: '最近加入本地库',
          layout: 'horizontal',
          items: playable.slice(0, 8).map((track) => this.toTrackItem(track)),
        },
        {
          id: 'albums',
          title: '本地专辑',
          layout: 'horizontal',
          items: this.uniqueAlbums().map((album) => ({
            kind: 'album' as const,
            id: album.id,
            title: album.title,
            subtitle: String(album.year ?? ''),
            coverUrl: album.coverUrl,
            album,
          })),
        },
      ],
    };
  }

  async search(
    query: string,
    type: SearchType = 'all',
    _cursor?: string,
    ctx?: RequestContext,
  ): Promise<SearchPayload> {
    await this.gate(ctx);
    const q = normalizeQuery(query);
    if (!q) {
      return {
        query: q,
        tracks: [],
        artists: [],
        albums: [],
        playlists: [],
        hasResults: false,
        suggestions: [],
      };
    }

    const needle = q.toLowerCase();
    const scored = this.tracks
      .map((track) => ({ track, score: relevanceScore(track, q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
      .map((x) => x.track);

    const artists = this.uniqueArtists().filter((a) => a.name.toLowerCase().includes(needle));
    const albums = this.uniqueAlbums().filter((a) => a.title.toLowerCase().includes(needle));
    const playlists = this.playlists.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        (p.description ?? '').toLowerCase().includes(needle),
    );

    const payload: SearchPayload = {
      query: q,
      tracks: type === 'all' || type === 'track' ? scored : [],
      artists: type === 'all' || type === 'artist' ? artists : [],
      albums: type === 'all' || type === 'album' ? albums : [],
      playlists: type === 'all' || type === 'playlist' ? playlists : [],
      hasResults: scored.length + artists.length + albums.length + playlists.length > 0,
      suggestions: [],
    };

    if (!payload.hasResults) {
      payload.suggestions = rewriteSuggestions(
        q,
        [...new Set(this.tracks.map((x) => x.title))],
      );
    }
    return payload;
  }

  async getPlaylist(id: ID, ctx?: RequestContext): Promise<Playlist> {
    await this.gate(ctx);
    const meta = this.playlists.find((p) => p.id === id);
    const tracks = id === 'pl_liked' ? this.likedTracks() : this.playableTracks();
    if (!meta && id !== 'pl_liked') {
      throw new AppError('unavailable', '这个歌单不存在或已被删除');
    }
    return {
      ...(meta ?? { id, title: '歌单', coverUrl: '' }),
      trackCount: tracks.length,
      tracks,
    };
  }

  async getAlbum(id: ID, ctx?: RequestContext): Promise<AlbumDetail> {
    await this.gate(ctx);
    const inAlbum = this.tracks.filter((track) => track.album?.id === id);
    if (inAlbum.length === 0) throw new AppError('unavailable', '这张专辑不存在或已被删除');
    const head = inAlbum[0]!;
    return {
      id,
      title: head.album!.title,
      coverUrl: head.album!.coverUrl,
      year: head.album!.year,
      artist: head.artists[0],
      tracks: inAlbum,
    };
  }

  async getArtist(id: ID, ctx?: RequestContext): Promise<ArtistDetail> {
    await this.gate(ctx);
    const artist = this.uniqueArtists().find((a) => a.id === id);
    if (!artist) throw new AppError('unavailable', '找不到这位歌手');
    const hotTracks = this.tracks.filter((track) =>
      track.artists.some((a) => a.id === id && track.playable),
    );
    return {
      ...artist,
      hotTracks,
      albums: this.uniqueAlbums().filter((album) =>
        hotTracks.some((track) => track.album?.id === album.id),
      ),
    };
  }

  async getLyrics(trackId: ID, ctx?: RequestContext): Promise<LyricLine[]> {
    await this.gate(ctx);
    return sortLyrics(SEED_LYRICS[trackId] ?? []);
  }

  async getLibrary(ctx?: RequestContext): Promise<LibraryPayload> {
    await this.gate(ctx);
    return {
      likedTracks: this.likedTracks(),
      playlists: this.playlists,
      albums: this.uniqueAlbums(),
      artists: this.uniqueArtists(),
      recentTracks: this.history.map((id) => this.find(id)),
    };
  }

  async setLiked(trackId: ID, liked: boolean, ctx?: RequestContext): Promise<void> {
    await this.gate(ctx);
    if (!this.tracks.some((t) => t.id === trackId)) {
      throw new AppError('unavailable', '这首歌已不在本地曲库中');
    }
    if (liked) this.liked.add(trackId);
    else this.liked.delete(trackId);
  }

  async listTracks(cursor?: string, limit = 30, ctx?: RequestContext): Promise<PageResult<Track>> {
    await this.gate(ctx);
    const offset = cursor ? Number(cursor) : 0;
    const items = this.playableTracks().slice(offset, offset + limit);
    const next = offset + limit;
    return {
      items,
      hasMore: next < this.playableTracks().length,
      nextCursor: next < this.playableTracks().length ? String(next) : undefined,
    };
  }

  /** Records a play so "继续收听" has data. Called by the application layer. */
  markPlayed(trackId: ID): void {
    this.history = [trackId, ...this.history.filter((id) => id !== trackId)].slice(0, 50);
  }

  /** Test/dev helper for the optimistic-like-update rollback path. */
  isLiked(trackId: ID): boolean {
    return this.liked.has(trackId);
  }

  /** Most-recent-first list of played track ids (PlaybackHistoryPort). */
  recent(limit = 50): readonly ID[] {
    return this.history.slice(0, limit);
  }

  /** Mirrors `mergeById` usage: repositories must not hand back duplicates. */
  mergeTracks(existing: Track[], incoming: Track[]): Track[] {
    return mergeById(existing, incoming);
  }

  private find(id: ID): Track {
    const track = this.tracks.find((t) => t.id === id);
    if (!track) throw new AppError('unavailable', '这首歌已不可用');
    return track;
  }

  private likedTracks(): Track[] {
    return this.tracks.filter((t) => this.liked.has(t.id));
  }

  private playableTracks(): Track[] {
    return this.tracks.filter((t) => t.playable);
  }

  private uniqueArtists() {
    const map = new Map<string, { id: ID; name: string; avatarUrl?: string }>();
    for (const track of this.tracks) {
      for (const artist of track.artists) {
        if (!map.has(artist.id)) {
          map.set(artist.id, { ...artist, avatarUrl: `asset://avatar/${artist.id}` });
        }
      }
    }
    return [...map.values()];
  }

  private uniqueAlbums() {
    const map = new Map<string, { id: ID; title: string; coverUrl?: string; year?: number }>();
    for (const track of this.tracks) {
      if (track.album && !map.has(track.album.id)) {
        map.set(track.album.id, { ...track.album });
      }
    }
    return [...map.values()];
  }

  private toTrackItem(track: Track) {
    return {
      kind: 'track' as const,
      id: track.id,
      title: track.title,
      subtitle: track.artists.map((a) => a.name).join(' / '),
      coverUrl: track.coverUrl,
      track,
    };
  }
}