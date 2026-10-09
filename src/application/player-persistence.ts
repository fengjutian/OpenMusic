/**
 * PlayerPersistence — owns save/restore of the player snapshot.
 *
 * Position writes are throttled (every ≥5 s) to keep the disk from being
 * thrashed; key events (pause, play, restore) flush immediately.
 */

import type { ID, PlaybackMode, Track } from '../domain/models.js';
import type { SettingsPort } from '../domain/ports.js';

export const PLAYER_PERSIST_KEY = 'player.restore.v1';

export interface PersistedPlayer {
  trackId: ID;
  contextId: string;
  contextKind: 'playlist' | 'album' | 'artist' | 'library' | 'queue';
  contextTitle: string;
  queueTrackIds: ID[];
  index: number;
  positionMs: number;
  mode: PlaybackMode;
}

export interface PersistHost {
  currentTrack(): Track | null;
  currentPositionMs(): number;
  currentMode(): PlaybackMode;
  /** The queue is part of the snapshot but is owned by the coordinator. */
  currentQueueSnapshot(): {
    contextId: string;
    contextKind: PersistedPlayer['contextKind'];
    contextTitle: string;
    queueTrackIds: ID[];
    index: number;
  } | null;
}

const PERSIST_THROTTLE_MS = 5_000;

export class PlayerPersistence {
  private lastPersistedPositionMs = 0;

  constructor(
    private readonly settings: SettingsPort,
    private readonly host: PersistHost,
  ) {}

  /**
   * Returns true if a write was actually issued. Forces a write when `force`
   * is set, otherwise honours the throttle window.
   */
  async persist(force: boolean): Promise<void> {
    const track = this.host.currentTrack();
    const queue = this.host.currentQueueSnapshot();
    if (!track || !queue) return;
    if (
      !force &&
      Math.abs(this.host.currentPositionMs() - this.lastPersistedPositionMs) <= PERSIST_THROTTLE_MS
    ) {
      return;
    }
    this.lastPersistedPositionMs = this.host.currentPositionMs();

    const payload: PersistedPlayer = {
      trackId: track.id,
      contextId: queue.contextId,
      contextKind: queue.contextKind,
      contextTitle: queue.contextTitle,
      queueTrackIds: queue.queueTrackIds,
      index: queue.index,
      positionMs: this.host.currentPositionMs(),
      mode: this.host.currentMode(),
    };
    await this.settings.set(PLAYER_PERSIST_KEY, payload);
  }

  /**
   * Restores metadata only (spec §10.4): the UI shows the previous track
   * immediately, the resource is validated asynchronously, and we never
   * auto-play with sound.
   */
  async restore(
    hydrateTrack: (trackId: ID) => Track | undefined,
    onSuccess: (snapshot: {
      contextId: string;
      contextKind: PersistedPlayer['contextKind'];
      contextTitle: string;
      tracks: Track[];
      index: number;
      positionMs: number;
      mode: PlaybackMode;
    }) => void,
  ): Promise<boolean> {
    const raw = await this.settings.get<PersistedPlayer | null>(PLAYER_PERSIST_KEY, null);
    if (!raw || !Array.isArray(raw.queueTrackIds) || raw.queueTrackIds.length === 0) {
      return false;
    }

    const tracks = raw.queueTrackIds.map(hydrateTrack).filter((t): t is Track => Boolean(t));
    if (tracks.length === 0) return false;

    const index = Math.min(Math.max(0, raw.index), tracks.length - 1);
    onSuccess({
      contextId: raw.contextId,
      contextKind: raw.contextKind,
      contextTitle: raw.contextTitle,
      tracks,
      index,
      positionMs: raw.positionMs ?? 0,
      mode: raw.mode ?? 'sequential',
    });
    return true;
  }
}