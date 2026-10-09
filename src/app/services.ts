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
 */
export function createDemoServices(): Services {
  return buildServices({
    bridge: createPlatformBridge(),
    engine: new FakeAudioEngine(),
    catalog: new MockMusicRepository({ latencyMs: 160 }),
    settings: new MemorySettings(),
    secure: new MemorySecureStorage(),
    analytics: defaultAnalytics(),
    usingMocks: true,
  });
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