/**
 * `LocalMusicRepository` — implementation of `MusicRepository` over a
 * concrete list of `Track`s. The list is provided at construction (typically
 * by the host's file picker → object URL flow) and held in memory.
 *
 * Why this exists
 * ---------------
 * The web demo host's file picker feeds `File` objects into the bundle via
 * a host-resolved list of tracks (see `src/app/services.ts`). For Android /
 * Windows the same repository is what `LocalMusicRepository` (with a SQLite
 * backend) will hand to the player once stage 4 lands; the contract is
 * identical to `MockMusicRepository` so swapping is a one-line change.
 *
 * Scope (stage 9.3)
 * -----------------
 *   - In-memory storage (no SQLite yet — that is stage 4).
 *   - No ID3 parsing: title comes from the filename, artists/album stay
 *     empty until `MetadataReaderPort` lands. The contract still flows through
 *     the mapper so consumers do not change when real metadata arrives.
 *   - Object URLs (`blob:`) are resolved by `WebAudioEngine.load(url)` on
 *     the web host. Native hosts would translate the same opaque `url`
 *     string to a native file handle.
 */

import { AppError, CancellationError } from '../../domain/errors.js';
import type {
  AlbumDetail,
  AlbumRef,
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
import type {
  MusicRepository,
  RequestContext,
} from '../../domain/ports.js';
import { normalizeQuery, relevanceScore } from '../../domain/search.js';

export interface LocalMusicRepositoryOptions {
  /** All tracks available in the user's library. */
  tracks: Track[];
  /** Initial liked set; defaults to none. */
  initialLiked?: Iterable<ID>;
}

export class LocalMusicRepository implements MusicRepository {
  protected tracks: Track[];
  protected trackIndex: Map<ID, Track>;
  protected playlists = new Map<ID, Playlist>();
  protected liked: Set<ID>;
  protected history: ID[] = [];

  constructor(options: LocalMusicRepositoryOptions) {
    if (!options.tracks) {
      throw new Error('LocalMusicRepository: `tracks` is required.');
    }
    this.tracks = options.tracks.map((track) => ({ ...track }));
    this.trackIndex = new Map(this.tracks.map((track) => [track.id, track]));
    this.liked = new Set(options.initialLiked ?? []);
  }

  /**
   * Replace the in-memory catalog contents. Used by subclasses that hydrate
   * from a persistent store (e.g. `IndexedDbLocalMusicRepository` reading
   * its `tracks` / `liked` rows back out of `IndexedDB` on construction).
   * Public so the persistence layer can call it; not part of the
   * `MusicRepository` contract.
   */
  loadCatalog(options: { tracks: Track[]; initialLiked?: Iterable<ID> }): void {
    this.tracks = options.tracks.map((track) => ({ ...track }));
    this.trackIndex = new Map(this.tracks.map((track) => [track.id, track]));
    if (this.tracks.length === 0) {
      // Empty stores are fine — but `trackIndex` must reflect reality.
    }
    this.liked = new Set(options.initialLiked ?? []);
    this.history = [];
    this.playlists.clear();
  }

  // ---------------------------------------------------------------------
  // lookup helpers
  // ---------------------------------------------------------------------

  private async gate(ctx?: RequestContext): Promise<void> {
    ctx?.signal?.throwIfAborted?.();
    if (ctx?.signal?.aborted) throw new CancellationError();
  }

  private find(id: ID): Track {
    const track = this.trackIndex.get(id);
    if (!track) {
      throw new AppError('unavailable', '这首歌已不在本地曲库中');
    }
    return track;
  }

  private playableTracks(): Track[] {
    return this.tracks.filter((track) => track.playable !== false);
  }

  private uniqueArtists(): ArtistDetail[] {
    const map = new Map<ID, ArtistDetail>();
    for (const track of this.tracks) {
      for (const artist of track.artists) {
        if (!map.has(artist.id)) {
          map.set(artist.id, {
            id: artist.id,
            name: artist.name,
            avatarUrl: `asset://avatar/${artist.id}`,
            hotTracks: [],
            albums: [],
          });
        }
      }
    }
    return [...map.values()];
  }

  private uniqueAlbums(): AlbumRef[] {
    const map = new Map<ID, AlbumRef>();
    for (const track of this.tracks) {
      const album = track.album;
      if (album && !map.has(album.id)) {
        map.set(album.id, {
          id: album.id,
          title: album.title,
          coverUrl: album.coverUrl,
          year: album.year,
        });
      }
    }
    return [...map.values()];
  }

  private toTrackItem(track: Track) {
    return {
      kind: 'track' as const,
      id: track.id,
      title: track.title,
      subtitle: track.artists.map((artist) => artist.name).join(' / '),
      coverUrl: track.coverUrl,
      track,
    };
  }

  // ---------------------------------------------------------------------
  // MusicCatalog
  // ---------------------------------------------------------------------

  async getHome(ctx?: RequestContext): Promise<HomePayload> {
    await this.gate(ctx);
    const playable = this.playableTracks();
    return {
      greetingName: '音乐爱好者',
      continueListening: this.history.length
        ? {
            id: 'continue',
            title: '继续收听',
            subtitle: '接着上次播放',
            layout: 'horizontal',
            items: this.history.slice(0, 5).map((id) => this.toTrackItem(this.find(id))),
          }
        : undefined,
      shelves: [
        {
          id: 'recent',
          title: '最近播放',
          subtitle: '本地',
          layout: 'horizontal',
          items: this.history.slice(0, 5).map((id) => this.toTrackItem(this.find(id))),
        },
        {
          id: 'all',
          title: '本地曲库',
          subtitle: `${playable.length} 首`,
          layout: 'horizontal',
          items: playable.slice(0, 12).map((track) => this.toTrackItem(track)),
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
    const needle = normalizeQuery(query);
    if (!needle) {
      return {
        query,
        tracks: [],
        artists: [],
        albums: [],
        playlists: [],
        hasResults: false,
        suggestions: [],
      };
    }
    const lower = needle.toLowerCase();
    const tracks = this.playableTracks()
      .map((track) => ({
        track,
        score: relevanceScore(
          {
            title: track.title,
            artists: track.artists.map((a) => ({ name: a.name })),
            album: track.album ? { title: track.album.title } : undefined,
          },
          lower,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.track.title.localeCompare(b.track.title))
      .map((entry) => entry.track);

    const artists = this.uniqueArtists().filter((artist) => artist.name.toLowerCase().includes(lower));
    const albums = this.uniqueAlbums().filter((album) => album.title.toLowerCase().includes(lower));

    return {
      query,
      tracks: type === 'all' || type === 'track' ? tracks : [],
      artists: type === 'all' || type === 'artist' ? artists : [],
      albums: type === 'all' || type === 'album' ? albums : [],
      playlists: [],
      hasResults: tracks.length + artists.length + albums.length > 0,
      suggestions: [],
    };
  }

  async getPlaylist(id: ID, ctx?: RequestContext): Promise<Playlist> {
    await this.gate(ctx);
    const liked = this.playableTracks().filter((track) => this.liked.has(track.id));
    if (id === 'pl_liked') {
      return {
        id: 'pl_liked',
        title: '喜欢的音乐',
        description: '你在本地收藏的歌曲',
        coverUrl: this.tracks[0]?.coverUrl ?? '',
        creatorName: 'OpenMusic',
        trackCount: liked.length,
        tracks: liked,
      };
    }
    throw new AppError('unavailable', '这个歌单不存在或已被删除');
  }

  async getAlbum(id: ID, ctx?: RequestContext): Promise<AlbumDetail> {
    await this.gate(ctx);
    const tracks = this.tracks.filter((track) => track.album?.id === id);
    if (tracks.length === 0) {
      throw new AppError('unavailable', '这张专辑不存在或已被删除');
    }
    const first = tracks[0];
    return {
      id,
      title: first.album?.title ?? '未知专辑',
      coverUrl: first.album?.coverUrl ?? '',
      year: first.album?.year,
      artist: first.artists[0],
      tracks,
    };
  }

  async getArtist(id: ID, ctx?: RequestContext): Promise<ArtistDetail> {
    await this.gate(ctx);
    const artist = this.uniqueArtists().find((a) => a.id === id);
    if (!artist) throw new AppError('unavailable', '找不到这位歌手');
    const tracks = this.tracks.filter((track) => track.artists.some((a) => a.id === id));
    return {
      ...artist,
      hotTracks: tracks,
      albums: this.uniqueAlbums().filter((album) =>
        tracks.some((track) => track.album?.id === album.id),
      ),
    };
  }

  async getLyrics(trackId: ID, ctx?: RequestContext): Promise<LyricLine[]> {
    void trackId;
    void ctx;
    return [];
  }

  async getLibrary(ctx?: RequestContext): Promise<LibraryPayload> {
    await this.gate(ctx);
    return {
      likedTracks: this.playableTracks().filter((track) => this.liked.has(track.id)),
      playlists: [...this.playlists.values()],
      albums: this.uniqueAlbums(),
      artists: this.uniqueArtists(),
      recentTracks: this.history.map((id) => this.find(id)),
    };
  }

  async listTracks(
    cursor?: string,
    limit = 30,
    ctx?: RequestContext,
  ): Promise<PageResult<Track>> {
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

  // ---------------------------------------------------------------------
  // FavoritesPort + PlaybackHistoryPort
  // ---------------------------------------------------------------------

  async setLiked(trackId: ID, liked: boolean, ctx?: RequestContext): Promise<void> {
    await this.gate(ctx);
    if (!this.trackIndex.has(trackId)) {
      throw new AppError('unavailable', '这首歌已不在本地曲库中');
    }
    if (liked) this.liked.add(trackId);
    else this.liked.delete(trackId);
  }

  isLiked(trackId: ID): boolean {
    return this.liked.has(trackId);
  }

  markPlayed(trackId: ID): void {
    this.history = [trackId, ...this.history.filter((id) => id !== trackId)].slice(0, 50);
  }

  recent(limit = 50): readonly ID[] {
    return this.history.slice(0, limit);
  }

  // ---------------------------------------------------------------------
  // Test / host helpers
  // ---------------------------------------------------------------------

  /** Number of tracks the repository currently holds. */
  size(): number {
    return this.tracks.length;
  }

  /** Register a pre-built playlist (used by tests). */
  registerPlaylist(playlist: Playlist): void {
    this.playlists.set(playlist.id, playlist);
  }
}