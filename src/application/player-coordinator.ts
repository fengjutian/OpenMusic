/**
 * PlayerCoordinator (technical spec §20): the ONLY orchestrator of the audio
 * engine. UI dispatches intents; it never calls the engine, and it never keeps
 * its own copy of "is it playing".
 *
 * Race conditions this class exists to absorb (spec §26):
 *  - rapid taps on next/previous
 *  - callbacks from a previous load arriving after a newer one
 *  - seek followed immediately by a track change
 *  - audio focus loss mid-playback
 */

import { AppError } from '../domain/errors.js';
import type { PlaybackMode, PlaybackStatus, Track } from '../domain/models.js';
import type { AudioEnginePort, AudioEvent, SettingsPort } from '../domain/ports.js';
import {
  addToQueue,
  clearManualItems,
  currentTrack,
  modeLabel,
  moveInQueue,
  nextIndex,
  nextMode,
  playNext,
  previousIndex,
  removeFromQueue,
  shuffledOrder,
} from '../domain/playback.js';
import type { PlaybackContext, QueueState } from '../domain/playback.js';

export interface PlayerSnapshot {
  queue: QueueState | null;
  status: PlaybackStatus;
  positionMs: number;
  durationMs: number;
  mode: PlaybackMode;
  volume: number;
  error: AppError | null;
  /** True while a load is in flight; drives the spinner state. */
  loading: boolean;
}

export interface PlaybackSnapshot {
  track: Track;
  positionMs: number;
  durationMs: number;
  contextLabel: string;
  mode: PlaybackMode;
}

export const PLAYER_PERSIST_KEY = 'player.restore.v1';

interface PersistedPlayer {
  trackId: string;
  contextId: string;
  contextKind: PlaybackContext['kind'];
  contextTitle: string;
  queueTrackIds: string[];
  index: number;
  positionMs: number;
  mode: PlaybackMode;
}

export class PlayerCoordinator {
  private queue: QueueState | null = null;
  private status: PlaybackStatus = 'idle';
  private positionMs = 0;
  private durationMs = 0;
  private mode: PlaybackMode = 'sequential';
  private volume = 1;
  private error: AppError | null = null;
  private shuffleOrder: number[] = [];

  /** Monotonic token; only the newest load may publish state. */
  private loadToken = 0;
  private listeners = new Set<() => void>();
  private unsubscribeEngine: (() => void) | null = null;
  private lastPersistedPositionMs = 0;
  private disposed = false;

  constructor(
    private readonly engine: AudioEnginePort,
    private readonly settings: SettingsPort,
  ) {}

  // --- subscription -------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot = (): PlayerSnapshot => ({
    queue: this.queue,
    status: this.status,
    positionMs: this.positionMs,
    durationMs: this.durationMs,
    mode: this.mode,
    volume: this.volume,
    error: this.error,
    loading: this.status === 'loading' || this.status === 'buffering',
  });

  /** Narrow snapshot used by the mini player and the lock-screen style header. */
  getPlaybackSnapshot = (): PlaybackSnapshot | null => {
    const track = currentTrack(this.queue);
    if (!track || !this.queue) return null;
    return {
      track,
      positionMs: this.positionMs,
      durationMs: this.durationMs || track.durationMs,
      contextLabel: this.queue.context.title,
      mode: this.mode,
    };
  };

  start(): void {
    if (this.unsubscribeEngine) return;
    this.unsubscribeEngine = this.engine.subscribe(this.handleEngineEvent);
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribeEngine?.();
    this.unsubscribeEngine = null;
    this.listeners.clear();
    void this.engine.dispose();
  }

  // --- intents -------------------------------------------------------------

  async playQueue(
    context: PlaybackContext,
    tracks: Track[],
    startIndex: number,
    startMs = 0,
  ): Promise<void> {
    if (tracks.length === 0) return;
    const index = Math.max(0, Math.min(startIndex, tracks.length - 1));
    this.queue = { context, tracks: tracks.slice(), index, manualIds: [] };
    this.rebuildShuffleOrder();
    await this.loadCurrent(startMs, true);
  }

  async toggle(): Promise<void> {
    if (this.status === 'playing') {
      await this.pause();
    } else {
      await this.resume();
    }
  }

  async play(): Promise<void> {
    if (!this.queue) return;
    if (this.status === 'idle' || this.status === 'error') {
      await this.loadCurrent(this.positionMs, true);
      return;
    }
    await this.resume();
  }

  async pause(): Promise<void> {
    await this.engine.pause();
    this.persist(true);
  }

  async next(): Promise<void> {
    if (!this.queue) return;
    const next = nextIndex({
      tracks: this.queue.tracks,
      index: this.queue.index,
      mode: this.mode,
      shuffleOrder: this.shuffleOrder,
    });
    if (next === null) {
      // End of queue: either loop or stop. Stopping is less surprising than
      // silently restarting from the top.
      this.set({ status: 'paused' });
      return;
    }
    this.queue = { ...this.queue, index: next };
    await this.loadCurrent(0, true);
  }

  async previous(): Promise<void> {
    if (!this.queue) return;
    // Common player convention: >3s in, restart the track first.
    if (this.positionMs > 3000) {
      await this.seek(0);
      return;
    }
    const index = previousIndex({ tracks: this.queue.tracks, index: this.queue.index, mode: this.mode });
    this.queue = { ...this.queue, index };
    await this.loadCurrent(0, true);
  }

  async seek(positionMs: number): Promise<void> {
    await this.engine.seek(Math.max(0, positionMs));
  }

  async cycleMode(): Promise<PlaybackMode> {
    const mode = nextMode(this.mode);
    this.set({ mode });
    if (mode === 'shuffle') this.rebuildShuffleOrder();
    await this.persist(false);
    return mode;
  }

  async setMode(mode: PlaybackMode): Promise<void> {
    this.set({ mode });
    if (mode === 'shuffle') this.rebuildShuffleOrder();
    await this.persist(false);
  }

  async setVolume(volume: number): Promise<void> {
    this.set({ volume });
    await this.engine.setVolume(volume);
  }

  playNextInQueue(track: Track): void {
    if (!this.queue) return;
    this.queue = playNext(this.queue, track);
    this.publish();
  }

  addToQueue(track: Track): void {
    if (!this.queue) return;
    const withTrack = addToQueue(this.queue, track);
    this.queue = {
      ...withTrack,
      manualIds: withTrack.manualIds.includes(track.id)
        ? withTrack.manualIds
        : [...withTrack.manualIds, track.id],
    };
    this.publish();
  }

  removeFromQueue(trackId: string): void {
    if (!this.queue) return;
    const removingCurrent = this.queue.tracks[this.queue.index]?.id === trackId;
    this.queue = removeFromQueue(this.queue, trackId);
    if (removingCurrent) {
      void this.loadCurrent(0, true);
      return;
    }
    this.publish();
  }

  moveInQueue(from: number, to: number): void {
    if (!this.queue) return;
    this.queue = moveInQueue(this.queue, from, to);
    this.publish();
  }

  clearManualItems(): void {
    if (!this.queue) return;
    this.queue = clearManualItems(this.queue);
    this.publish();
  }

  async retry(): Promise<void> {
    if (!this.queue) return;
    this.error = null;
    await this.loadCurrent(this.positionMs, true);
  }

  /** Jump straight to a queue entry (used by the queue sheet). */
  async playAtIndex(index: number, startMs = 0): Promise<void> {
    if (!this.queue) return;
    if (index < 0 || index >= this.queue.tracks.length) return;
    this.queue = { ...this.queue, index };
    await this.loadCurrent(startMs, true);
  }

  /** Called when the platform reports an audio-focus loss (call, other app). */
  handleFocusLost(): void {
    if (this.status === 'playing') {
      this.set({ status: 'paused' });
      this.persist(true);
    }
  }

  // --- restore -------------------------------------------------------------

  /**
   * Restores metadata only (spec §10.4): the UI shows the previous track
   * immediately, the resource is validated asynchronously, and we never
   * auto-play with sound.
   */
  async restore(
    hydrateTrack: (trackId: string) => Track | undefined,
  ): Promise<boolean> {
    const raw = await this.settings.get<PersistedPlayer | null>(PLAYER_PERSIST_KEY, null);
    if (!raw || !Array.isArray(raw.queueTrackIds) || raw.queueTrackIds.length === 0) return false;

    const tracks = raw.queueTrackIds.map(hydrateTrack).filter((t): t is Track => Boolean(t));
    if (tracks.length === 0) return false;

    const index = Math.min(Math.max(0, raw.index), tracks.length - 1);
    this.queue = {
      context: {
        id: raw.contextId,
        kind: raw.contextKind,
        title: raw.contextTitle,
      },
      tracks,
      index,
      manualIds: [],
    };
    this.mode = raw.mode ?? 'sequential';
    this.positionMs = raw.positionMs ?? 0;
    this.durationMs = tracks[index]?.durationMs ?? 0;
    this.rebuildShuffleOrder();
    this.set({ status: 'paused' });
    return true;
  }

  // --- internals -----------------------------------------------------------

  private async loadCurrent(startMs: number, autoplay: boolean): Promise<void> {
    const track = currentTrack(this.queue);
    if (!track) return;

    if (!track.playable || !track.audioUrl) {
      this.set({
        status: 'error',
        error: new AppError(
          'unavailable',
          track.unavailableReason ?? '这首歌暂时无法播放，已为你保留队列',
        ),
      });
      return;
    }

    const token = ++this.loadToken;
    this.set({ status: 'loading', error: null, positionMs: startMs });

    try {
      await this.engine.load({
        requestId: `${track.id}:${token}`,
        trackId: track.id,
        url: track.audioUrl,
        startMs,
        volume: this.volume,
      });
    } catch {
      if (token !== this.loadToken) return; // stale load
      this.set({
        status: 'error',
        error: new AppError('unknown', '播放失败，请重试或跳到下一首'),
      });
      return;
    }

    if (token !== this.loadToken) return; // a newer load won the race
    if (autoplay) await this.resume();
  }

  private async resume(): Promise<void> {
    await this.engine.play();
  }

  private handleEngineEvent = (event: AudioEvent): void => {
    if (this.disposed) return;
    switch (event.type) {
      case 'loaded':
        // Ignore callbacks for loads we already superseded.
        if (!event.sourceId.endsWith(`:${this.loadToken}`)) return;
        this.set({ durationMs: event.durationMs, loading: false });
        break;
      case 'play':
        this.set({ status: 'playing', error: null });
        break;
      case 'pause':
        this.set({ status: 'paused' });
        this.persist(true);
        break;
      case 'position':
        this.set({ positionMs: event.positionMs });
        // Throttled progress writes — never hit the disk on every tick.
        if (Math.abs(event.positionMs - this.lastPersistedPositionMs) > 5_000) {
          this.persist(false);
        }
        break;
      case 'buffering':
        this.set({ status: event.buffered ? 'playing' : 'buffering' });
        break;
      case 'ended':
        void this.next();
        break;
      case 'error':
        this.set({
          status: 'error',
          error: new AppError('unknown', '播放出错了，可以重试或跳到下一首'),
        });
        break;
    }
  };

  private rebuildShuffleOrder(): void {
    const length = this.queue?.tracks.length ?? 0;
    this.shuffleOrder = this.mode === 'shuffle' && length > 0
      ? shuffledOrder(length, Date.now() & 0x7fffffff)
      : [];
    if (this.queue && this.shuffleOrder.length) {
      const position = this.shuffleOrder.indexOf(this.queue.index);
      if (position === -1) {
        // Make sure the current track is reachable in the shuffled sequence.
        this.shuffleOrder.splice(this.shuffleOrder.indexOf(this.shuffleOrder[this.shuffleOrder.length - 1]!), 0, this.queue.index);
      }
    }
  }

  private async persist(force: boolean): Promise<void> {
    const track = currentTrack(this.queue);
    if (!track || !this.queue) return;
    if (!force && Math.abs(this.positionMs - this.lastPersistedPositionMs) <= 5_000) return;
    this.lastPersistedPositionMs = this.positionMs;

    const payload: PersistedPlayer = {
      trackId: track.id,
      contextId: this.queue.context.id,
      contextKind: this.queue.context.kind,
      contextTitle: this.queue.context.title,
      queueTrackIds: this.queue.tracks.map((t) => t.id),
      index: this.queue.index,
      positionMs: this.positionMs,
      mode: this.mode,
    };
    await this.settings.set(PLAYER_PERSIST_KEY, payload);
  }

  private set(patch: Partial<PlayerSnapshot>): void {
    Object.assign(this, {
      status: patch.status ?? this.status,
      positionMs: patch.positionMs ?? this.positionMs,
      durationMs: patch.durationMs ?? this.durationMs,
      mode: patch.mode ?? this.mode,
      volume: patch.volume ?? this.volume,
      error: patch.error !== undefined ? patch.error : this.error,
    });
    this.publish();
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export function playbackModeLabel(mode: PlaybackMode): string {
  return modeLabel(mode);
}