/**
 * Dependency graph root.
 *
 * Wiring order matters and is the reason this file exists:
 *   theme -> platform adapter -> repository/engine implementations -> app services
 * A page must never construct an implementation itself.
 */

import { FakeAudioEngine } from '../infrastructure/audio/fake-audio-engine.js';
import { MemorySecureStorage, MemorySettings } from '../infrastructure/settings/memory-settings.js';
import { MockMusicRepository } from '../infrastructure/repository/mock-music-repository.js';
import type { MusicRepository, SettingsPort } from '../domain/ports.js';
import { PlayerCoordinator } from '../application/player-coordinator.js';
import {
  ConsoleAnalytics,
  PrivacyFilteringAnalytics,
  createPlatformBridge,
} from '../platform/bridge.js';
import type { AnalyticsPort, PlatformBridgePort } from '../domain/ports.js';

export interface Services {
  repository: MusicRepository;
  settings: SettingsPort;
  player: PlayerCoordinator;
  bridge: PlatformBridgePort;
  analytics: AnalyticsPort;
  /** True when no native shell answered — the app runs on fakes. */
  usingMocks: boolean;
}

let instance: Services | null = null;

export function getServices(): Services {
  if (instance) return instance;

  const bridge = createPlatformBridge();
  const settings: SettingsPort = new MemorySettings();
  const repository = new MockMusicRepository({ latencyMs: 160 });
  const analytics = new PrivacyFilteringAnalytics(
    new ConsoleAnalytics(),
    `s_${Math.floor(Date.now() / 1000)}`,
  );

  // Native engine selection lives here; the fake is the only implementation
  // wired up until android/windows hosts land. Swap in `NativeAudioEngine`
  // behind the same `AudioEnginePort` — no UI change required.
  const player = new PlayerCoordinator(new FakeAudioEngine(), settings);
  player.start();

  instance = {
    repository,
    settings,
    player,
    bridge,
    analytics,
    usingMocks: !bridge.capabilities().native,
  };
  return instance;
}

/** Test seam. */
export function resetServices(): void {
  instance?.player.dispose();
  instance = null;
}

export { MemorySecureStorage };