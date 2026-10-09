/**
 * EngineAdapter — translates `AudioEvent`s into host state changes.
 *
 * The monotonic `loadToken` is enforced in the coordinator's `loadCurrent`;
 * the adapter consumes the resulting events and drops late callbacks whose
 * request id no longer matches the current token (technical spec §20 / §26).
 */

import type { AppError } from '../domain/errors.js';
import type { AudioEvent } from '../domain/ports.js';

export interface EngineHost {
  currentTrackId(): string | null;
  currentPositionMs(): number;
  loadToken(): number;
  setStatus(status: 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'error'): void;
  setError(error: AppError | null): void;
  setPositionMs(positionMs: number): void;
  setDurationMs(durationMs: number): void;
  persistNow(): Promise<void>;
  notifyEnded(): Promise<void>;
  setErrorGeneric(): void;
}

export class EngineAdapter {
  constructor(private readonly host: EngineHost) {}

  /**
   * Single point that consumes engine events. Late events from superseded
   * loads are dropped by token; otherwise the host is called with the
   * translated state transition.
   */
  handleEvent(event: AudioEvent): void {
    switch (event.type) {
      case 'loaded': {
        if (!this.requestIdMatchesCurrent(event.sourceId)) return;
        this.host.setDurationMs(event.durationMs);
        this.host.setStatus('playing');
        return;
      }
      case 'play':
        this.host.setStatus('playing');
        this.host.setError(null);
        return;
      case 'pause':
        this.host.setStatus('paused');
        void this.host.persistNow();
        return;
      case 'position':
        this.host.setPositionMs(event.positionMs);
        if (Math.abs(event.positionMs - this.host.currentPositionMs()) > 5_000) {
          void this.host.persistNow();
        }
        return;
      case 'buffering':
        this.host.setStatus(event.buffered ? 'playing' : 'buffering');
        return;
      case 'ended':
        void this.host.notifyEnded();
        return;
      case 'error':
        this.host.setErrorGeneric();
        return;
    }
  }

  private requestIdMatchesCurrent(sourceId: string): boolean {
    return sourceId === this.requestIdFor(this.host.loadToken());
  }

  private requestIdFor(token: number): string {
    return `${this.host.currentTrackId() ?? 'no-track'}:${token}`;
  }
}