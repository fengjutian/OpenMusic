/**
 * Domain models. Pure data + rules.
 *
 * Invariants enforced by this layer:
 *  - no imports from `application`, `infrastructure`, `ui`, `platform`
 *  - no `window` / `document` / Web Storage / browser audio APIs
 */

export type ID = string;

export interface ArtistRef {
  id: ID;
  name: string;
  avatarUrl?: string;
}

export interface AlbumRef {
  id: ID;
  title: string;
  coverUrl?: string;
  /** Year the album was first released, used for the "年份" library sort. */
  year?: number;
}

export interface Track {
  id: ID;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  coverUrl?: string;
  durationMs: number;
  playable: boolean;
  /**
   * Local-first: a playable track always carries a resolvable source. Remote
   * tracks get one only after a `ContentProvider.resolve()` call.
   */
  audioUrl?: string;
  explicit?: boolean;
  /** Why `playable === false`, shown verbatim in the UI. Already localised. */
  unavailableReason?: string;
  /** Provenance, used by the analytics layer and by `ContentProvider` namespacing. */
  source: TrackSource;
  filePath?: string;
  sizeBytes?: number;
  trackNo?: number;
  genre?: string;
}

export type TrackSource = 'local' | 'provider';

export interface Playlist {
  id: ID;
  title: string;
  description?: string;
  coverUrl?: string;
  creatorName?: string;
  trackCount?: number;
  tracks?: Track[];
}

export interface AlbumDetail extends AlbumRef {
  artist?: ArtistRef;
  description?: string;
  tracks: Track[];
}

export interface ArtistDetail {
  id: ID;
  name: string;
  avatarUrl?: string;
  bio?: string;
  hotTracks: Track[];
  albums: AlbumRef[];
}

export interface LyricLine {
  startMs: number;
  endMs?: number;
  text: string;
  translation?: string;
}

export interface PageResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/** A shelf / section rendered on the discover tab. */
export interface HomeShelf {
  id: string;
  title: string;
  subtitle?: string;
  layout: 'horizontal' | 'grid';
  items: HomeItem[];
}

export type HomeItem =
  | { kind: 'track'; id: string; title: string; subtitle: string; coverUrl?: string; track: Track }
  | { kind: 'playlist'; id: ID; title: string; subtitle: string; coverUrl?: string; playlist: Playlist }
  | { kind: 'album'; id: ID; title: string; subtitle: string; coverUrl?: string; album: AlbumRef };

export interface HomePayload {
  greetingName?: string;
  /** Shown only when the user has play history. */
  continueListening?: HomeShelf;
  shelves: HomeShelf[];
}

export type SearchType = 'all' | 'track' | 'artist' | 'album' | 'playlist';

export interface SearchPayload {
  query: string;
  tracks: Track[];
  artists: ArtistRef[];
  albums: AlbumRef[];
  playlists: Playlist[];
  /** True when at least one bucket has results. Drives `empty` vs `success`. */
  hasResults: boolean;
  suggestions: string[];
}

export interface LibraryPayload {
  likedTracks: Track[];
  playlists: Playlist[];
  albums: AlbumRef[];
  artists: ArtistRef[];
  recentTracks: Track[];
}

export type PlaybackMode = 'sequential' | 'repeat-one' | 'shuffle';

export type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'error';

export type ThemePreference = 'dark' | 'light' | 'system';