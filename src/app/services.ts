/**
 * Dependency graph root.
 *
 * `createServices(opts)` is the single composition point. Pages and tests
 * call this to obtain a fully wired `Services` bag; the legacy `getServices()`
 * module-level singleton is kept for one release so call sites can migrate
 * incrementally — see the review note "服务装配隐式串联".
 *
 * Wiring order matters and is the reason this file exists:
 *   theme -> platform adapter -> repository/engine implementations -> app services
 * A page must never construct an implementation itself.
 */

import { FakeAudioEngine } from '../infrastructure/audio/fake-audio-engine.js';
import { MemorySecureStorage, MemorySettings } from '../infrastructure/settings/memory-settings.js';
import { MockMusicRepository } from '../infrastructure/repository/mock-music-repository.js';
import type { MusicRepository } from '../domain/ports.js';
import { PlayerCoordinator } from '../application/player-coordinator.js';
import {
  ConsoleAnalytics,
  PrivacyFilteringAnalytics,
  createPlatformBridge,
} from '../platform/bridge.js';
import type { AnalyticsPort, PlatformBridgePort } from '../domain/ports.js';
import { libraryStore } from '../application/stores.js';

export interface Services {
  /** @deprecated prefer `catalog`; kept until #5 split lands in screens. */
  repository: MusicRepository;
  catalog: MusicRepository;
  settings: MemorySettings;
  player: PlayerCoordinator;
  bridge: PlatformBridgePort;
  analytics: AnalyticsPort;
  /** True when no native shell answered — the app runs on fakes. */
  usingMocks: boolean;
}

export interface CreateServicesOptions {
  /** Provide a custom bridge in tests. The default reads from the real global. */
  bridge?: PlatformBridgePort;
  /** Override the analytics sink. Defaults to `ConsoleAnalytics`. */
  analyticsSink?: AnalyticsPort;
  /** Override the catalog. Defaults to the in-memory mock. */
  catalog?: MusicRepository;
}

/**
 * Build a fresh `Services` instance.
 *
 * Two important contracts:
 *  - side effects (media-button subscription, app-state subscription) are
 *    registered here, not in `App.tsx`. There is exactly one site that
 *    wires platform events, so re-renders cannot double-subscribe.
 *  - the returned `player` is already started. Callers do not need to
 *    invoke `start()` themselves.
 */
export function createServices(opts: CreateServicesOptions = {}): Services {
  const bridge = opts.bridge ?? createPlatformBridge();
  const settings = new MemorySettings();
  const catalog = opts.catalog ?? new MockMusicRepository({ latencyMs: 160 });
  const analytics = new PrivacyFilteringAnalytics(
    opts.analyticsSink ?? new ConsoleAnalytics(),
    `s_${Math.floor(Date.now() / 1000)}`,
  );

  // Native engine selection lives here; the fake is the only implementation
  // wired up until android/windows hosts land. Swap in `NativeAudioEngine`
  // behind the same `AudioEnginePort` — no UI change required.
  const player = new PlayerCoordinator(new FakeAudioEngine(), settings, bridge);
  player.start();

  return {
    repository: catalog,
    catalog,
    settings,
    player,
    bridge,
    analytics,
    usingMocks: !bridge.capabilities().native,
  };
}

let cached: Services | null = null;

/**
 * Lazy default singleton, kept for the call sites that have not yet been
 * migrated. After a sweep, this can be replaced by an app-level provider
 * that calls `createServices` once.
 */
export function getServices(): Services {
  if (cached) return cached;
  cached = createServices();
  return cached;
}

/** Test seam. */
export function resetServices(): void {
  cached?.player.dispose();
  cached = null;
}

export { MemorySecureStorage, libraryStore };
