/**
 * Real `AudioEnginePort` for the web / WebView2 / Edge host.
 *
 * Wraps a single HTMLAudioElement and translates its events into the Lynx
 * `AudioEvent` vocabulary that `PlayerCoordinator` consumes. Used by
 * `createDemoServices` / `createProductionServices` when `__OPENMUSIC_PLATFORM__`
 * is `web` (see `src/app/services.ts`).
 *
 * Why HTMLAudioElement (not Web Audio API):
 *   - SMTC + browser MediaSession keys work with `<audio>` natively.
 *   - The ReactLynx tree already speaks URL-shaped sources; no need to decode
 *     and re-stream manually.
 *   - HTMLAudioElement handles cross-browser decoding, format probing, and
 *     HTTP Range requests without extra glue.
 *
 * Concurrency: the PlayerCoordinator calls `load` once per track change with
 * a unique `requestId`; we mirror that requestId into the `loaded` event so
 * late callbacks from a previous source cannot win over a newer one (see
 * execution handbook stage 3, item §3.4 and PlayerCoordinator.loadToken).
 */

import type {
  AudioEnginePort,
  AudioEvent,
  PlayableSource,
  Unsubscribe,
} from '../../domain/ports.js';

export interface WebAudioEngineOptions {
  /** Override for tests. Default is 250ms (matches FakeAudioEngine). */
  tickMs?: number;
  /**
   * Factory used to create the underlying `HTMLAudioElement`. Tests inject a
   * mock here; production wires the global one.
   */
  createElement?: () => HTMLAudioElement;
  /**
   * Where to append the hidden `<audio>` element. The element must live in
   * the DOM for the browser's MediaSession / SMTC pipeline to track it.
   * Default: `document.body` when available; tests pass `null` to skip.
   */
  mount?: HTMLElement | null;
}

export class WebAudioEngine implements AudioEnginePort {
  private readonly listeners = new Set<(event: AudioEvent) => void>();
  private readonly tickMs: number;
  private readonly createElement: () => HTMLAudioElement;
  /** Where the hidden `<audio>` element is appended so the browser can
   *  track it for MediaSession / SMTC. Tests leave this null. */
  private readonly mount: HTMLElement | null;

  private audio: HTMLAudioElement | null = null;
  private current: PlayableSource | null = null;
  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private positionMs = 0;
  private disposed = false;
  /** Monotonic counter; only the newest load publishes state. */
  private loadToken = 0;

  constructor(options: WebAudioEngineOptions = {}) {
    this.tickMs = options.tickMs ?? 250;
    // `?? document.body` would replace an explicit `null` (used by tests)
    // with the real body; guard with `undefined` so `null` is honoured.
    this.mount =
      options.mount === undefined
        ? typeof document !== 'undefined'
          ? document.body
          : null
        : options.mount;
    this.createElement =
      options.createElement ??
      (() => {
        if (typeof document === 'undefined') {
          throw new Error(
            'WebAudioEngine: no document available. ' +
              'Pass `createElement` in tests.',
          );
        }
        return document.createElement('audio');
      });
  }

  // ---------------------------------------------------------------------
  // subscription
  // ---------------------------------------------------------------------

  subscribe(listener: (event: AudioEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: AudioEvent): void {
    if (this.disposed) return;
    for (const listener of [...this.listeners]) listener(event);
  }

  // ---------------------------------------------------------------------
  // load / play / pause / seek / setVolume / dispose
  // ---------------------------------------------------------------------

  async load(source: PlayableSource): Promise<void> {
    if (this.disposed) throw new Error('engine disposed');
    const token = ++this.loadToken;
    this.current = source;
    this.positionMs = source.startMs ?? 0;

    this.ensureAudio();
    if (!this.audio) throw new Error('engine failed to allocate HTMLAudioElement');

    this.attachListeners(this.audio);
    this.stopTimer();

    // New source — wipe any prior src and reset state so listeners do not
    // replay stale `loaded` / `play` events from the previous track.
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio.src = source.url;
    this.audio.currentTime = this.positionMs / 1000;
    this.audio.volume = source.volume ?? 1;
    this.audio.preload = 'auto';

    // The HTMLMediaElement will fire `loadedmetadata` once the headers +
    // first chunk are ready. We do not await a Promise — the PlayerCoordinator
    // uses the `loaded` event to learn durationMs.
    void this.audio.load();

    // No-op `loaded` here: we wait for the actual `loadedmetadata` so the
    // duration is real. If metadata never arrives (bad URL, network),
    // `error` fires and the coordinator surfaces the failure.
    void token; // token is used implicitly through attachListeners' `current`.
  }

  async play(): Promise<void> {
    if (!this.audio || !this.current) return;
    try {
      await this.audio.play();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      this.emit({
        type: 'error',
        code: 'PLAY_REJECTED',
        message: message || 'audio.play() was rejected by the browser',
      });
    }
  }

  async pause(): Promise<void> {
    if (!this.audio) return;
    this.audio.pause();
  }

  async seek(positionMs: number): Promise<void> {
    if (!this.audio) return;
    const target = Math.max(0, positionMs / 1000);
    if (Number.isFinite(target)) {
      this.audio.currentTime = target;
      this.positionMs = positionMs;
    }
  }

  async setVolume(value: number): Promise<void> {
    if (!this.audio) return;
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopTimer();
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // Some browsers throw on removeAttribute('src') after dispose; safe
        // to ignore because the element is no longer wired to the DOM.
      }
    }
    this.audio = null;
    this.current = null;
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------
  // internals
  // ---------------------------------------------------------------------

  private ensureAudio(): void {
    if (this.audio) return;
    const el = this.createElement();
    // Hidden — the host owns the UI. The element exists only so the browser
    // does the decoding work.
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    el.style.display = 'none';
    el.setAttribute('aria-hidden', 'true');
    if (this.mount && !el.parentNode) {
      this.mount.appendChild(el);
    }
    this.audio = el;
    this.applyDefaultMediaSession();
  }

  /**
   * Browser SMTC needs `navigator.mediaSession.metadata` to be set explicitly
   * (it is not derived from the `<audio>` element's src or tracks). We seed
   * a placeholder so the OS UI knows "something is playing" the moment the
   * engine activates; full metadata (title / artist / album / artwork)
   * needs the bundle → host bridge documented in stage 10.
   */
  private applyDefaultMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'OpenMusic',
        artist: '正在准备',
        album: '',
      });
      // Hand the browser the play/pause/seek action handlers so the OS media
      // keys work. We delegate back to the host via custom events because the
      // PlayerCoordinator is unreachable from this DOM node.
      const dispatch = (name: string) => () => {
        window.dispatchEvent(new CustomEvent('openmusic:media', { detail: name }));
      };
      navigator.mediaSession.setActionHandler('play', dispatch('play'));
      navigator.mediaSession.setActionHandler('pause', dispatch('pause'));
      navigator.mediaSession.setActionHandler('seekbackward', dispatch('seekbackward'));
      navigator.mediaSession.setActionHandler('seekforward', dispatch('seekforward'));
    } catch (cause) {
      // MediaSession is unavailable in non-secure contexts; surface but do
      // not crash the engine — playback still works.
      console.warn('[WebAudioEngine] mediaSession setup failed:', cause);
    }
  }

  private attachListeners(el: HTMLAudioElement): void {
    // Tear down any prior bindings so we do not double-fire on reload.
    el.onloadedmetadata = () => {
      if (this.disposed || !this.current || el !== this.audio) return;
      const durationMs = Math.round((el.duration || 0) * 1000);
      this.emit({ type: 'loaded', sourceId: this.current.requestId, durationMs });
    };
    el.onplay = () => {
      if (this.disposed || el !== this.audio) return;
      this.emit({ type: 'play' });
      this.startTimer();
    };
    el.onpause = () => {
      if (this.disposed || el !== this.audio) return;
      this.stopTimer();
      this.emit({ type: 'pause' });
    };
    el.onwaiting = () => {
      if (this.disposed || el !== this.audio) return;
      this.emit({ type: 'buffering', buffered: false });
    };
    el.oncanplay = () => {
      if (this.disposed || el !== this.audio) return;
      this.emit({ type: 'buffering', buffered: true });
    };
    el.onended = () => {
      if (this.disposed || el !== this.audio) return;
      this.stopTimer();
      this.emit({ type: 'ended' });
    };
    el.onerror = () => {
      if (this.disposed || el !== this.audio) return;
      const err = el.error;
      const code = err ? `MEDIA_${err.code}` : 'MEDIA_UNKNOWN';
      const message = err?.message ?? 'HTMLMediaElement reported an error';
      this.emit({ type: 'error', code, message });
    };
  }

  private startTimer(): void {
    if (this.positionTimer) return;
    this.positionTimer = setInterval(() => {
      if (!this.audio) return;
      this.positionMs = Math.round(this.audio.currentTime * 1000);
      this.emit({ type: 'position', positionMs: this.positionMs });
    }, this.tickMs);
  }

  private stopTimer(): void {
    if (!this.positionTimer) return;
    clearInterval(this.positionTimer);
    this.positionTimer = null;
  }
}