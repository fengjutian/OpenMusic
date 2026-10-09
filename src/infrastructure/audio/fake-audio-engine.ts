/**
 * Fake `AudioEnginePort`. Drives a virtual clock so the whole playback state
 * machine can be exercised in unit tests and in the mock build without any
 * native audio module.
 *
 * IMPORTANT: this file is not a product feature. Production wiring picks the
 * native engine through `infrastructure/audio/create-audio-engine.ts`.
 */

import type { AudioEnginePort, AudioEvent, PlayableSource, Unsubscribe } from '../../domain/ports.js';

export interface FakeAudioEngineOptions {
  /** Virtual milliseconds advanced per real `tickMs`. Default: 1:1. */
  speed?: number;
  tickMs?: number;
  /** Fail `load` for this track id, to reach the error/retry state. */
  failTrackIds?: string[];
  /** Simulated time to become ready, in virtual ms. */
  loadDelayMs?: number;
}

export class FakeAudioEngine implements AudioEnginePort {
  private readonly listeners = new Set<(event: AudioEvent) => void>();
  private readonly options: Required<FakeAudioEngineOptions>;

  private current: PlayableSource | null = null;
  private durationMs = 0;
  private positionMs = 0;
  private playing = false;
  private volume = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(options: FakeAudioEngineOptions = {}) {
    this.options = {
      speed: options.speed ?? 1,
      tickMs: options.tickMs ?? 250,
      failTrackIds: options.failTrackIds ?? [],
      loadDelayMs: options.loadDelayMs ?? 120,
    };
  }

  subscribe(listener: (event: AudioEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load(source: PlayableSource): Promise<void> {
    if (this.disposed) throw new Error('engine disposed');

    // Guard against out-of-order loads (spec §20): a late callback for an old
    // request must never win over a newer one.
    this.stopTimer();
    this.playing = false;
    this.positionMs = source.startMs ?? 0;
    this.current = source;

    if (this.options.failTrackIds.includes(source.trackId)) {
      this.emit({ type: 'error', code: 'DECODE_FAILED', message: '无法播放这个文件' });
      throw new Error(`load failed for ${source.trackId}`);
    }

    this.emit({ type: 'buffering', buffered: true });
    this.durationMs = 240_000;
    this.emit({
      type: 'loaded',
      sourceId: source.requestId,
      durationMs: this.durationMs,
    });
  }

  async play(): Promise<void> {
    if (!this.current) return;
    this.playing = true;
    this.startTimer();
    this.emit({ type: 'play' });
  }

  async pause(): Promise<void> {
    this.playing = false;
    this.stopTimer();
    this.emit({ type: 'pause' });
  }

  async seek(positionMs: number): Promise<void> {
    this.positionMs = Math.max(0, Math.min(positionMs, this.durationMs));
    this.emit({ type: 'position', positionMs: this.positionMs });
  }

  async setVolume(value: number): Promise<void> {
    this.volume = Math.max(0, Math.min(1, value));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopTimer();
    this.current = null;
    this.playing = false;
    this.listeners.clear();
  }

  // --- test helpers -------------------------------------------------------

  getVolume(): number {
    return this.volume;
  }

  getState(): { positionMs: number; durationMs: number; playing: boolean } {
    return { positionMs: this.positionMs, durationMs: this.durationMs, playing: this.playing };
  }

  /** Simulate a focus loss (call, another app, headphone unplug). */
  emitFocusLost(): void {
    this.playing = false;
    this.stopTimer();
    this.emit({ type: 'pause' });
  }

  /**
   * Push an event as if the platform had produced it. Tests use this to replay
   * late callbacks from a superseded load (technical spec §20 / §26).
   */
  emitEvent(event: AudioEvent): void {
    this.emit(event);
  }

  private startTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.positionMs += this.options.tickMs * this.options.speed;
      if (this.durationMs > 0 && this.positionMs >= this.durationMs) {
        this.positionMs = this.durationMs;
        this.playing = false;
        this.stopTimer();
        this.emit({ type: 'ended' });
        return;
      }
      this.emit({ type: 'position', positionMs: this.positionMs });
    }, this.options.tickMs);
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private emit(event: AudioEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}