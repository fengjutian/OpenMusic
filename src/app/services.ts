/**
 * Composition root.
 *
 * Three factories, one shape. Callers pick the one that matches the boot
 * context:
 *   - `createProductionServices(adapters)`  // real native shell answered
 *   - `createDemoServices()`                // explicit dev/demo flag
 *   - `createTestServices(overrides)`       // unit/component tests
 *
 * Rules (technical spec §11/§16, execution handbook §一阶段 1):
 *   - Domain does not import this file. UI and tests do.
 *   - The returned `Services` exposes only port interfaces, never concrete
 *     infrastructure classes (so swapping in the SQLite-backed catalog or the
 *     platform keystore does not change call sites).
 *   - Side effects are owned by `Services.start()` and `Services.dispose()`.
 *     Neither factory calls `start()` automatically — the React tree owns
 *     the lifecycle via `ServicesProvider`.
 */

import { PlayerCoordinator } from '../application/player-coordinator.js';
import { libraryStore } from '../application/stores.js';
import type {
  AnalyticsPort,
  AudioEnginePort,
  MusicCatalog,
  MusicRepository,
  PlatformBridgePort,
  SecureStoragePort,
  SettingsPort,
} from '../domain/ports.js';
import { FakeAudioEngine } from '../infrastructure/audio/fake-audio-engine.js';
import { WebAudioEngine } from '../infrastructure/audio/web-audio-engine.js';
import { IndexedDbLocalMusicRepository } from '../infrastructure/repository/indexeddb-local-music-repository.js';
import { LocalMusicRepository } from '../infrastructure/repository/local-music-repository.js';
import { MockMusicRepository } from '../infrastructure/repository/mock-music-repository.js';
import {
  MemorySecureStorage,
  MemorySettings,
} from '../infrastructure/settings/memory-settings.js';
import {
  ConsoleAnalytics,
  PrivacyFilteringAnalytics,
  createPlatformBridge,
} from '../platform/bridge.js';

/**
 * Public shape returned by every factory. Exposes port interfaces only —
 * no concrete `MemorySettings`, no `MockMusicRepository`. The deprecated
 * `repository` field still exists during the screen migration; new code must
 * depend on `catalog` (the narrow port).
 */
export interface Services {
  /** @deprecated use `catalog`; will be removed when every screen migrates. */
  readonly repository: MusicRepository;
  readonly catalog: MusicCatalog;
  readonly settings: SettingsPort;
  readonly secure: SecureStoragePort;
  readonly player: PlayerCoordinator;
  readonly bridge: PlatformBridgePort;
  readonly analytics: AnalyticsPort;
  /** True when the underlying implementations are not real native modules. */
  readonly usingMocks: boolean;

  /** Idempotent: subsequent calls are no-ops. Called by `ServicesProvider`. */
  start(): void;
  /** Idempotent: tears down subscriptions and disposes the engine. */
  dispose(): void;
}

/**
 * The web demo host needs an `audioUrl` for every playable track so the
 * `WebAudioEngine` can actually fetch a real file. `assets/audio/sample.mp3`
 * is committed to the repo for stage 9 verification — replace with the
 * user's own library once `LocalMusicRepository` lands in stage 4.
 *
 * The URL is resolved relative to the host page, not relative to the bundle,
 * because the bundle is served from `dist/` while the asset lives at the
 * project root.
 */
const WEB_DEMO_AUDIO_URL = '../assets/audio/sample.mp3';

/**
 * Detect whether we are running in a web platform context (browser,
 * WebView2, Edge) — main thread OR worker scope. Web workers share
 * IndexedDB with the main thread on the same origin, so the catalog and
 * persistence layer work correctly even when the ReactLynx bundle runs
 * inside web-core's worker (where `document` is undefined).
 *
 * `isWebHost()` (now specialised for the audio engine) keeps the
 * main-thread-only check because `HTMLAudioElement` defaults to
 * `document.body` for MediaSession tracking and that path does not exist
 * in a pure worker context.
 */
function isWebPlatform(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof globalThis.process === 'undefined'
  );
}

/**
 * Detect whether `HTMLAudioElement` is available in this realm. The web
 * main thread has it; web workers cannot attach it to a DOM for
 * MediaSession tracking, so this stays main-thread-only.
 */
function isWebHost(): boolean {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

/**
 * Select the audio engine for the current build context.
 *
 * - web host (WebView2 / Edge): `WebAudioEngine` against HTMLAudioElement
 * - everything else (ReactLynx native): `FakeAudioEngine` until
 *   `NativeAudioEngine` lands in stage 3 (skipped per user instruction
 *   2026-10-09; see ADR-0003).
 *
 * Tests can still pass an explicit override through `TestOverrides.engine`.
 */
function pickAudioEngine(explicit?: AudioEnginePort): AudioEnginePort {
  if (explicit) return explicit;
  return isWebHost() ? new WebAudioEngine() : new FakeAudioEngine();
}

/**
 * Stage-10 bridge: subscribe the audio engine to `PlayerCoordinator` so the
 * browser's `MediaSession` (OS-level media keys, taskbar thumbnail)
 * reflects the current track. The host already wires `MediaSession.action`
 * events back into the bundle via `CustomEvent('openmusic:media')` (see
 * `WebAudioEngine.applyDefaultMediaSession`); metadata flowing the other
 * direction was missing.
 *
 * Safe in non-web contexts: `WebAudioEngine.updateNowPlaying` no-ops when
 * `navigator.mediaSession` is unavailable, so the FakeAudioEngine path
 * (the only one in RN-native / unit tests) is unchanged.
 */
function wireMediaSessionBridge(
  player: PlayerCoordinator,
  engine: AudioEnginePort,
): void {
  if (typeof engine !== 'object' || engine === null) return;
  if (typeof (engine as { updateNowPlaying?: unknown }).updateNowPlaying !== 'function') {
    return;
  }
  const updatable = engine as unknown as {
    updateNowPlaying(
      metadata: MediaMetadataInit,
      playbackState: 'none' | 'paused' | 'playing',
    ): void;
  };
  player.subscribe(() => {
    const snapshot = player.getPlaybackSnapshot();
    if (!snapshot) {
      updatable.updateNowPlaying(
        { title: 'OpenMusic', artist: '正在准备', album: '' },
        'none',
      );
      return;
    }
    const { track } = snapshot;
    updatable.updateNowPlaying(
      {
        title: track.title,
        artist: track.artists.map((a) => a.name).join(' / '),
        album: track.album?.title ?? '',
        artwork: track.coverUrl ? [{ src: track.coverUrl }] : undefined,
      },
      // PlayerCoordinator's status is one of playing / paused / loading /
      // error / idle; MediaSession only knows three states — collapsed.
      snapshot.durationMs > 0 && hasPlayingIntent(player)
        ? 'playing'
        : 'paused',
    );
  });
}

/**
 * `PlayerCoordinator` does not directly expose `isPlaying`, but
 * `getSnapshot().status` is the cleanest signal for the bridge. Wrapped
 * here so the shape changes do not leak into `MediaSession` calls.
 */
function hasPlayingIntent(player: PlayerCoordinator): boolean {
  return player.getSnapshot().status === 'playing';
}

/** Adapters provided by the native shell. `createProductionServices` requires every field. */
export interface NativeAdapters {
  bridge: PlatformBridgePort;
  engine: AudioEnginePort;
  catalog: MusicCatalog;
  settings: SettingsPort;
  secure: SecureStoragePort;
}

/** Per-field overrides accepted by `createTestServices`. Any omitted field gets the demo impl. */
export interface TestOverrides {
  bridge?: PlatformBridgePort;
  engine?: AudioEnginePort;
  catalog?: MusicCatalog;
  settings?: SettingsPort;
  secure?: SecureStoragePort;
  analytics?: AnalyticsPort;
}

interface OpenMusicImportGlobals {
  /**
   * When the host's file picker finishes, it assigns the resulting tracks
   * here. The bootstrap reads this on first call and uses `LocalMusicRepository`
   * instead of the Mock seed. Production Android / Windows builds wire
   * SQLite-backed equivalents instead of this hand-off.
   *
   * `Track[]` flows across the realm boundary as plain JSON because
   * `File` objects cannot cross a worker boundary, but `audioUrl`
   * stays as a blob: URL the host created via `URL.createObjectURL`.
   */
  __openmusicImportedTracks?: import('../domain/models.js').Track[];
}

// ---------------------------------------------------------------------------
// Shared builder — the three factories differ only in which inputs they
// resolve; everything downstream (player wiring + lifecycle) is identical.
// ---------------------------------------------------------------------------

interface BuildInputs {
  bridge: PlatformBridgePort;
  engine: AudioEnginePort;
  catalog: MusicCatalog;
  settings: SettingsPort;
  secure: SecureStoragePort;
  analytics: AnalyticsPort;
  /** Whether the inputs come from mocks; surfaced via `Services.usingMocks`. */
  usingMocks: boolean;
}

function buildServices(inputs: BuildInputs): Services {
  const player = new PlayerCoordinator(inputs.engine, inputs.settings, inputs.bridge);
  wireMediaSessionBridge(player, inputs.engine);

  let started = false;
  let disposed = false;

  const services: Services = {
    repository: combineRepository(inputs.catalog),
    catalog: inputs.catalog,
    settings: inputs.settings,
    secure: inputs.secure,
    player,
    bridge: inputs.bridge,
    analytics: inputs.analytics,
    usingMocks: inputs.usingMocks,
    start() {
      if (started || disposed) return;
      player.start();
      started = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      started = false;
      void player.dispose();
    },
  };
  return services;
}

/**
 * `MusicRepository` is the legacy combined port. Mock already implements the
 * three narrow ports. For real adapters we synthesize a thin facade so legacy
 * call sites keep working during the migration.
 */
function combineRepository(catalog: MusicCatalog): MusicRepository {
  const favorites = catalog as Partial<MusicRepository>;
  if (
    typeof favorites.setLiked === 'function' &&
    typeof favorites.isLiked === 'function' &&
    typeof favorites.markPlayed === 'function' &&
    typeof favorites.recent === 'function'
  ) {
    return catalog as MusicRepository;
  }
  return {
    ...catalog,
    setLiked: async () => {
      throw new Error('FavoritesPort not implemented by current catalog');
    },
    isLiked: () => false,
    markPlayed: () => {
      /* no-op for read-only catalog */
    },
    recent: () => [],
  };
}

function defaultAnalytics(): AnalyticsPort {
  return new PrivacyFilteringAnalytics(
    new ConsoleAnalytics(),
    `s_${Math.floor(Date.now() / 1000)}`,
  );
}

// ---------------------------------------------------------------------------
// Public factories
// ---------------------------------------------------------------------------

/**
 * Production wiring. The native shell must answer every port.
 *
 * Throws if any adapter is missing — there is no silent fallback to mocks.
 * The handbook rejects "代码已经写好，但本机没有 SDK" as completion evidence;
 * the same rule applies here: missing adapters mean the app is not bootable
 * and the caller must surface the error.
 */
export function createProductionServices(adapters: NativeAdapters): Services {
  const required: Array<keyof NativeAdapters> = [
    'bridge',
    'engine',
    'catalog',
    'settings',
    'secure',
  ];
  for (const key of required) {
    if (!adapters[key]) {
      throw new Error(
        `createProductionServices: missing adapter "${String(key)}". ` +
          `Production boot requires every native adapter.`,
      );
    }
  }
  return buildServices({
    bridge: adapters.bridge,
    engine: adapters.engine,
    catalog: adapters.catalog,
    settings: adapters.settings,
    secure: adapters.secure,
    analytics: defaultAnalytics(),
    usingMocks: false,
  });
}

/**
 * Demo wiring. Used only when the app boots without a native shell — the
 * current reality on every dev machine. The capability matrix records this;
 * `usingMocks: true` lets the UI surface a "demo build" badge.
 *
 * On the web build the engine is real (HTMLAudioElement); the catalog is
 * also persistent when `indexedDB` is available. `usingMocks` reflects that
 * — `bridge.capabilities().native` is `false` until a real WebView2 host
 * installs its bridge (see `windows/host/index.html`).
 */
export function createDemoServices(): Services {
  const onWebHost = isWebHost();
  const onWebPlatform = isWebPlatform();
  const imported = readImportedTracks();
  const catalog: MusicCatalog = onWebPlatform
    ? // Web platform (main thread or worker): persistent IndexedDB-backed
      // catalog. The seed comes from the host's file picker (or the
      // `#seed-imports=N` debug query); IDB hydrates on its own if a prior
      // session left tracks behind.
      new IndexedDbLocalMusicRepository({ seed: imported ?? undefined })
    : imported
      ? // Non-web but tracks were supplied: pure in-memory, no persistence
        // (the only such case today is RN-native Android builds).
        new LocalMusicRepository({ tracks: imported })
      : // Fall back to the seed catalog with simulated latency.
        new MockMusicRepository({
          latencyMs: 160,
          audioUrl: onWebHost ? WEB_DEMO_AUDIO_URL : undefined,
        });
  const services = buildServices({
    bridge: createPlatformBridge(),
    engine: pickAudioEngine(),
    catalog,
    settings: new MemorySettings(),
    secure: new MemorySecureStorage(),
    analytics: defaultAnalytics(),
    // Web demo with persistent IDB + a real HTMLAudioElement is closer to
    // a production build than a pure Fake build, but settings + secure
    // are still in-memory. Reporting `usingMocks: true` keeps the UI
    // honest about those layers.
    usingMocks: true,
  });
  return services;
}

/**
 * Pull host-picked tracks off the global bridge. `globalThis` is the only
 * channel that survives the lynx-view worker boundary without a richer
 * bridge protocol (stage 10 work).
 */
function readImportedTracks(): import('../domain/models.js').Track[] | null {
  const g = globalThis as unknown as OpenMusicImportGlobals;
  const tracks = g.__openmusicImportedTracks;
  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) return null;
  // Defensive copy: the host may overwrite the slot on the next reload.
  return tracks.map((track) => ({ ...track }));
}

/**
 * Test wiring. Defaults to the same mock impls as `createDemoServices`, but
 * any port can be swapped for a stub. Used by component tests that need to
 * observe player events or short-circuit I/O.
 */
export function createTestServices(overrides: TestOverrides = {}): Services {
  return buildServices({
    bridge: overrides.bridge ?? createPlatformBridge(),
    engine: overrides.engine ?? new FakeAudioEngine({ tickMs: 5, loadDelayMs: 0 }),
    catalog: overrides.catalog ?? new MockMusicRepository({ latencyMs: 0 }),
    settings: overrides.settings ?? new MemorySettings(),
    secure: overrides.secure ?? new MemorySecureStorage(),
    analytics: overrides.analytics ?? defaultAnalytics(),
    usingMocks: !overrides.engine && !overrides.catalog,
  });
}

/** Library store is owned by application; re-exported for tests that bootstrap it. */
export { libraryStore };