/**
 * PlayerCoordinator — composition root for the four player roles.
 *
 * The class itself is intentionally thin; each responsibility lives in its
 * own file (queue-controller / player-state-machine / engine-adapter /
 * player-persistence). The public surface that pages and tests consume is
 * unchanged so this refactor stays invisible to the UI.
 *
 * Roles:
 *   - QueueController: queue mutations (insert / remove / move)
 *   - PlayerStateMachine: transport intents (play / pause / next / previous)
 *   - EngineAdapter: load race + AudioEvent translation
 *   - PlayerPersistence: throttled save + restore
 */

import { AppError } from '../domain/errors.js';
import type { ID, PlaybackMode, PlaybackStatus, Track } from '../domain/models.js';
import type {
  AudioEnginePort,
  AudioEvent,
  PlatformBridgePort,
  SettingsPort,
} from '../domain/ports.js';
import { currentTrack, nextMode, shuffledOrder } from '../domain/playback.js';
import type { PlaybackContext, QueueState } from '../domain/playback.js';
import type { EngineHost } from './engine-adapter.js';
import { EngineAdapter } from './engine-adapter.js';
import type { PersistHost } from './player-persistence.js';
import { PlayerPersistence } from './player-persistence.js';
import type { TransportHost } from './player-state-machine.js';
import { PlayerStateMachine } from './player-state-machine.js';
import type { PlayerHost } from './queue-controller.js';
import { QueueController } from './queue-controller.js';

export interface PlayerSnapshot {
  queue: QueueState | null;
  status: PlaybackStatus;
  positionMs: number;
  durationMs: number;
  mode: PlaybackMode;
  volume: number;
  error: AppError | null;
  loading: boolean;
}

export interface PlaybackSnapshot {
  track: Track;
  positionMs: number;
  durationMs: number;
  contextLabel: string;
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

  /** Monotonic token; only the newest load may publish state (spec §20). */
  private loadToken = 0;
  private listeners = new Set<() => void>();
  private unsubscribeEngine: (() => void) | null = null;
  private unsubscribeFocus: (() => void) | null = null;
  private unsubscribeMediaButton: (() => void) | null = null;
  private started = false;
  private disposed = false;

  // Roles — constructed after state fields so their host closures see
  // consistent read access via the methods below.
  private readonly queueController: QueueController;
  private readonly stateMachine: PlayerStateMachine;
  private readonly engineAdapter: EngineAdapter;
  private readonly persistence: PlayerPersistence;

  constructor(
    private readonly engine: AudioEnginePort,
    settings: SettingsPort,
    /**
     * When supplied, the coordinator subscribes to platform audio focus and
     * media-button events in `start()`. Tests can omit it.
     */
    private readonly bridge?: PlatformBridgePort,
  ) {
    const queueHost: PlayerHost = {
      get queue() {
        return (this as unknown as PlayerCoordinator).queue;
      },
      replaceQueue: (next) => (this as unknown as PlayerCoordinator).replaceQueue(next),
      loadCurrent: (positionMs, autoplay) =>
        (this as unknown as PlayerCoordinator).loadCurrent(positionMs, autoplay),
    } as PlayerHost;
    this.queueController = new QueueController(queueHost);

    const transportHost: TransportHost = {
      get queue() {
        return (this as unknown as PlayerCoordinator).queue;
      },
      get mode() {
        return (this as unknown as PlayerCoordinator).mode;
      },
      get shuffleOrder() {
        return (this as unknown as PlayerCoordinator).shuffleOrder;
      },
      get hasError() {
        return (this as unknown as PlayerCoordinator).error !== null;
      },
      currentPositionMs: () => (this as unknown as PlayerCoordinator).positionMs,
      replaceQueue: (next) => (this as unknown as PlayerCoordinator).replaceQueue(next),
      loadCurrent: (positionMs, autoplay) =>
        (this as unknown as PlayerCoordinator).loadCurrent(positionMs, autoplay),
      setStatusError: (message) => (this as unknown as PlayerCoordinator).setStatusError(message),
      cycleMode: async () => (this as unknown as PlayerCoordinator).cycleModeInternal(),
      setMode: async (mode) => (this as unknown as PlayerCoordinator).setModeInternal(mode),
      rebuildShuffleOrder: () => (this as unknown as PlayerCoordinator).rebuildShuffleOrder(),
    } as TransportHost;
    this.stateMachine = new PlayerStateMachine(transportHost);

    const engineHost: EngineHost = {
      currentTrackId: () => currentTrack(this.queue)?.id ?? null,
      currentPositionMs: () => this.positionMs,
      currentDurationMs: () => this.durationMs,
      loadToken: () => this.loadToken,
      bumpLoadToken: () => ++this.loadToken,
      setStatus: (status) => this.setStateField('status', status),
      setError: (error) => this.setStateField('error', error),
      setPositionMs: (ms) => this.setStateField('positionMs', ms),
      setDurationMs: (ms) => this.setStateField('durationMs', ms),
      persistNow: async () => this.persistence.persist(false),
      notifyEnded: async () => this.next(),
      setErrorGeneric: () =>
        this.setStateField(
          'error',
          new AppError('unknown', '播放出错了，可以重试或跳到下一首'),
        ),
    };
    this.engineAdapter = new EngineAdapter(engine, engineHost);

    const persistHost: PersistHost = {
      currentTrack: () => currentTrack(this.queue),
      currentPositionMs: () => this.positionMs,
      currentMode: () => this.mode,
      currentQueueSnapshot: () => {
        if (!this.queue) return null;
        return {
          contextId: this.queue.context.id,
          contextKind: this.queue.context.kind,
          contextTitle: this.queue.context.title,
          queueTrackIds: this.queue.tracks.map((t) => t.id),
          index: this.queue.index,
        };
      },
    };
    this.persistence = new PlayerPersistence(settings, persistHost);
  }

  // --- subscription -------------------------------------------------------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribeEngine = this.engine.subscribe((event) => this.handleEngineEvent(event));
    if (this.bridge) {
      this.unsubscribeFocus = this.bridge.onAudioFocusChange((focused) => {
        if (!focused) this.handleFocusLost();
      });
      this.unsubscribeMediaButton = this.bridge.onMediaButton((command) => {
        if (command === 'play') void this.play();
        else if (command === 'pause') void this.pause();
        else if (command === 'next') void this.next();
        else if (command === 'previous') void this.previous();
      });
    }
  }

  dispose(): void {
    this.disposed = true;
    this.started = false;
    this.unsubscribeEngine?.();
    this.unsubscribeFocus?.();
    this.unsubscribeMediaButton?.();
    this.unsubscribeEngine = null;
    this.unsubscribeFocus = null;
    this.unsubscribeMediaButton = null;
    this.listeners.clear();
    void this.engine.dispose();
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

  // --- intents -------------------------------------------------------------

  async playQueue(
    context: PlaybackContext,
    tracks: Track[],
    startIndex: number,
    startMs = 0,
  ): Promise<void> {
    if (tracks.length === 0) return;
    const index = Math.max(0, Math.min(startIndex, tracks.length - 1));
    this.queue = this.queueController.setQueue(context, tracks, index);
    this.rebuildShuffleOrder();
    await this.loadCurrent(startMs, true);
  }

  toggle(): Promise<void> { return this.stateMachine.toggle(); }
  play(): Promise<void> { return this.stateMachine.play(); }
  pause(): Promise<void> { return this.stateMachine.pause(); }
  next(): Promise<void> { return this.stateMachine.next(); }
  previous(): Promise<void> { return this.stateMachine.previous(); }

  async cycleMode(): Promise<PlaybackMode> {
    return this.stateMachine.cycleMode();
  }

  async setMode(mode: PlaybackMode): Promise<void> {
    return this.setModeInternal(mode);
  }

  async setVolume(volume: number): Promise<void> {
    this.setStateField('volume', volume);
    await this.engine.setVolume(volume);
  }

  /** `seek` lives on the coordinator because tests depend on it. */
  async seek(positionMs: number): Promise<void> {
    await this.engine.seek(Math.max(0, positionMs));
  }

  enqueueNext(track: Track): void { this.queueController.enqueueNext(track); }
  enqueueLast(track: Track): void { this.queueController.enqueueLast(track); }
  removeFromQueue(trackId: ID): void { this.queueController.remove(trackId); }
  moveInQueue(from: number, to: number): void { this.queueController.move(from, to); }
  clearManualItems(): void { this.queueController.clearManual(); }

  /** Jump straight to a queue entry (used by the queue sheet). */
  async playAtIndex(index: number, startMs = 0): Promise<void> {
    if (!this.queue) return;
    if (index < 0 || index >= this.queue.tracks.length) return;
    this.queue = { ...this.queue, index };
    await this.loadCurrent(startMs, true);
  }

  async retry(): Promise<void> {
    if (!this.queue) return;
    this.setStateField('error', null);
    await this.loadCurrent(this.positionMs, true);
  }

  /** Called when the platform reports an audio-focus loss. */
  handleFocusLost(): void {
    if (this.status === 'playing') {
      this.setStateField('status', 'paused');
      void this.persistence.persist(true);
    }
  }

  /** Used by `useRestorePlayer`. */
  async restore(
    hydrateTrack: (trackId: ID) => Track | undefined,
  ): Promise<boolean> {
    return this.persistence.restore(hydrateTrack, (snapshot) => {
      this.queue = {
        context: {
          id: snapshot.contextId,
          kind: snapshot.contextKind,
          title: snapshot.contextTitle,
        },
        tracks: snapshot.tracks,
        index: snapshot.index,
        manualIds: [],
      };
      this.mode = snapshot.mode;
      this.positionMs = snapshot.positionMs;
      this.durationMs = snapshot.tracks[snapshot.index]?.durationMs ?? 0;
      this.rebuildShuffleOrder();
      this.setStateField('status', 'paused');
    });
  }

  // --- internals -----------------------------------------------------------

  replaceQueue(next: QueueState): void {
    this.queue = next;
    this.publish();
  }

  async loadCurrent(startMs: number, autoplay: boolean): Promise<void> {
    const track = currentTrack(this.queue);
    if (!track) return;

    if (!track.playable || !track.audioUrl) {
      this.setStateField('error', this.queueController.markTrackUnplayable(track));
      this.setStateField('status', 'error');
      return;
    }

    const token = ++this.loadToken;
    this.setStateField('status', 'loading');
    this.setStateField('error', null);
    this.setStateField('positionMs', startMs);

    try {
      await this.engine.load({
        requestId: `${track.id}:${token}`,
        trackId: track.id,
        url: track.audioUrl,
        startMs,
        volume: this.volume,
      });
    } catch {
      if (token !== this.loadToken) return;
      this.setStateField(
        'error',
        new AppError('unknown', '播放失败，请重试或跳到下一首'),
      );
      this.setStateField('status', 'error');
      return;
    }
    if (token !== this.loadToken) return;
    if (autoplay) await this.engine.play();
  }

  rebuildShuffleOrder(): void {
    const length = this.queue?.tracks.length ?? 0;
    this.shuffleOrder = this.mode === 'shuffle' && length > 0
      ? shuffledOrder(length, Date.now() & 0x7fffffff)
      : [];
  }

  /**
   * Cycles the playback mode. Returns the new mode so the state machine can
   * decide whether to rebuild the shuffle order.
   */
  private async cycleModeInternal(): Promise<PlaybackMode> {
    const next = nextMode(this.mode);
    this.setStateField('mode', next);
    if (next === 'shuffle') this.rebuildShuffleOrder();
    await this.persistence.persist(false);
    return next;
  }

  private async setModeInternal(mode: PlaybackMode): Promise<void> {
    this.setStateField('mode', mode);
    if (mode === 'shuffle') this.rebuildShuffleOrder();
    await this.persistence.persist(false);
  }

  /** EngineAdapter uses this to surface "已到队列末尾" without knowing the queue. */
  setStatusError(message: string): void {
    this.setStateField('error', new AppError('unknown', message));
  }

  setStateField<K extends 'status' | 'positionMs' | 'durationMs' | 'mode' | 'volume' | 'error'>(
    field: K,
    value: PlayerSnapshot[K],
  ): void {
    (this as unknown as Record<K, PlayerSnapshot[K]>)[field] = value;
    this.publish();
  }

  private handleEngineEvent(event: AudioEvent): void {
    if (this.disposed) return;
    this.engineAdapter.handleEvent(event);
  }

  private publish(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export { nextMode };
export { PLAYER_PERSIST_KEY } from './player-persistence.js';