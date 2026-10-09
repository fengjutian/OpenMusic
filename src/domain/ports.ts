/**
 * Ports (technical spec §16): every native capability is declared here as a
 * TypeScript interface. Domain depends on these; infrastructure implements
 * them; the UI never imports an implementation directly.
 *
 * Rules enforced by review:
 *  - no platform SDK types leak past this file (no `android.*`, no `Windows.*`)
 *  - every port ships a `fake` implementation so the whole app is runnable
 *    and unit-testable without any native shell
 */

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
} from './models.js';

// ---------------------------------------------------------------------------
// Async plumbing
// ---------------------------------------------------------------------------

export interface RequestContext {
  signal?: AbortSignal;
}

export interface Unsubscribe {
  (): void;
}

// ---------------------------------------------------------------------------
// Storage / settings
// ---------------------------------------------------------------------------

export interface SettingsPort {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Backed by Keystore / Credential Manager. Never used for non-secret data. */
  keys(): Promise<string[]>;
}

export interface SecureStoragePort {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Repository — split into three narrow ports so the UI imports only what it
// uses, and so each can be replaced independently (e.g. history in sync with
// cloud, favorites in a different schema).
// ---------------------------------------------------------------------------

export interface MusicCatalog {
  getHome(ctx?: RequestContext): Promise<HomePayload>;
  search(
    query: string,
    type?: SearchType,
    cursor?: string,
    ctx?: RequestContext,
  ): Promise<SearchPayload>;
  getPlaylist(id: ID, ctx?: RequestContext): Promise<Playlist>;
  getAlbum(id: ID, ctx?: RequestContext): Promise<AlbumDetail>;
  getArtist(id: ID, ctx?: RequestContext): Promise<ArtistDetail>;
  getLyrics(trackId: ID, ctx?: RequestContext): Promise<LyricLine[]>;
  getLibrary(ctx?: RequestContext): Promise<LibraryPayload>;
  listTracks(cursor?: string, limit?: number, ctx?: RequestContext): Promise<PageResult<Track>>;
}

export interface FavoritesPort {
  setLiked(trackId: ID, liked: boolean, ctx?: RequestContext): Promise<void>;
  isLiked(trackId: ID): boolean;
}

export interface PlaybackHistoryPort {
  /** Records a play so "继续收听" / "最近播放" can show it. */
  markPlayed(trackId: ID): void;
  /** Most-recent-first list of played track ids. */
  recent(limit?: number): readonly ID[];
}

/** Legacy combined port. New code should depend on one of the three above. */
export type MusicRepository = MusicCatalog & FavoritesPort & PlaybackHistoryPort;

// ---------------------------------------------------------------------------
// Media scanner / metadata
// ---------------------------------------------------------------------------

export interface FileRef {
  /** Platform-stable id when the OS provides one (Android MediaStore id). */
  platformId?: string;
  /** Canonical, user-readable path. Kept for display only. */
  path: string;
  /** Canonical comparison key: normalised path + size + mtime. */
  identity: string;
}

export interface ScanRoot {
  id: string;
  displayName: string;
  uri: string;
  permissionState: 'granted' | 'denied' | 'needs-grant';
}

export interface ScanCursor {
  offset: number;
  pageToken?: string;
}

export interface DiscoveredFile extends FileRef {
  sizeBytes: number;
  modifiedAt: number;
  extension: string;
}

export interface FileStat {
  exists: boolean;
  sizeBytes: number;
  modifiedAt: number;
}

export interface MediaMetadata {
  title?: string;
  artists?: string[];
  album?: string;
  albumArtist?: string;
  year?: number;
  trackNo?: number;
  discNo?: number;
  genre?: string;
  durationMs?: number;
  /** Object URL / native handle for the embedded cover. */
  artwork?: string;
  lyrics?: string;
}

export interface MediaScannerPort {
  selectRoots(): Promise<ScanRoot[]>;
  scan(root: ScanRoot, cursor?: ScanCursor): Promise<PageResult<DiscoveredFile>>;
  stat(ref: FileRef): Promise<FileStat>;
}

export interface MetadataReaderPort {
  read(ref: FileRef): Promise<MediaMetadata>;
}

// ---------------------------------------------------------------------------
// Audio engine
// ---------------------------------------------------------------------------

export type AudioEvent =
  | { type: 'loaded'; sourceId: string; durationMs: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'position'; positionMs: number }
  | { type: 'buffering'; buffered: boolean }
  | { type: 'ended' }
  | { type: 'error'; code: string; message: string };

export interface PlayableSource {
  /** Identity of the load request, used to reject stale callbacks. */
  requestId: string;
  trackId: ID;
  url: string;
  /** 0..1 */
  volume?: number;
  startMs?: number;
}

export interface AudioEnginePort {
  load(source: PlayableSource): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(positionMs: number): Promise<void>;
  setVolume(value: number): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: (event: AudioEvent) => void): Unsubscribe;
}

// ---------------------------------------------------------------------------
// Content providers (optional, §21)
// ---------------------------------------------------------------------------

export interface ProviderCapabilities {
  search: boolean;
  lyrics: boolean;
  /** Requires an account / user consent before use. */
  requiresAuth: boolean;
  /**
   * Display name shown in the UI next to data sourced from this provider
   * (e.g. "网易云音乐"). Stage 10 item 6: every result must carry its
   * source so users can see which third party their data flowed through.
   */
  providerName: string;
}

export interface ResolvedPlayable {
  url: string;
  expiresAt?: number;
  bitrateKbps?: number;
}

export interface ContentProvider {
  readonly id: string;
  capabilities(): ProviderCapabilities;
  search(
    query: string,
    cursor?: string,
    ctx?: RequestContext,
  ): Promise<PageResult<Track>>;
  resolve(id: string, ctx?: RequestContext): Promise<ResolvedPlayable>;
  getLyrics?(id: string, ctx?: RequestContext): Promise<LyricLine[]>;
  /**
   * Drop credentials + cached state. After `revoke()` resolves, the
   * provider must answer `capabilities().requiresAuth === true` again
   * (no token cached) and any future call should treat the user as
   * un-authenticated. Idempotent: a second call is a no-op.
   */
  revoke(): Promise<void>;
}

// ---------------------------------------------------------------------------
// System integration
// ---------------------------------------------------------------------------

export type WindowSize = { width: number; height: number };

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PlatformCapabilities {
  platform: 'android' | 'windows';
  /** True when the real native module answered. */
  native: boolean;
  /** True when media buttons / system media integration are live. */
  systemMediaControls: boolean;
  /** True when we can read real safe-area insets. */
  safeArea: boolean;
  /** True when window size tracking is live (Windows breakpoints). */
  resizable: boolean;
  /** File-system scanning / import is implemented on this platform. */
  fileImport: boolean;
  /** System media controls (SMTC / MediaSession) are wired. */
  systemNowPlaying: boolean;
}

export interface PlatformSignals {
  readonly platform: 'android' | 'windows';
  capabilities(): PlatformCapabilities;
  safeAreaInsets(): SafeAreaInsets;
  windowSize(): WindowSize;
}

export interface MediaControl {
  onAudioFocusChange(listener: (focused: boolean) => void): Unsubscribe;
  onMediaButton(listener: (command: 'play' | 'pause' | 'next' | 'previous') => void): Unsubscribe;
}

export interface AppLifecycle {
  onAppStateChange(listener: (state: 'active' | 'background') => void): Unsubscribe;
}

/** Legacy combined port. New code should depend on the narrow ones. */
export type PlatformBridgePort = PlatformSignals & MediaControl & AppLifecycle;

export interface AnalyticsPort {
  track(event: string, props?: Record<string, string | number | boolean>): void;
}