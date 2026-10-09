/**
 * PlayerStateMachine — owns transport intents and the status / position /
 * error / mode fields.
 *
 * Pure mechanics of "play" / "pause" / "next" / "previous" live here. The
 * engine load race and the persistence of mode/position are deliberately
 * split out into `engine-adapter` and `player-persistence` so each file can
 * be read in isolation.
 */

import { nextIndex, previousIndex } from '../domain/playback.js';
import type { PlaybackMode } from '../domain/models.js';
import type { QueueState } from '../domain/playback.js';

export interface TransportHost {
  readonly queue: QueueState | null;
  readonly mode: PlaybackMode;
  readonly shuffleOrder: readonly number[];
  readonly hasError: boolean;
  currentPositionMs(): number;
  replaceQueue(next: QueueState): void;
  loadCurrent(positionMs: number, autoplay: boolean): Promise<void>;
  cycleMode(): Promise<PlaybackMode>;
  setMode(mode: PlaybackMode): Promise<void>;
  setStatusError(message: string): void;
  rebuildShuffleOrder(): void;
}

export class PlayerStateMachine {
  constructor(private readonly host: TransportHost) {}

  async toggle(): Promise<void> {
    if (!this.host.queue) return;
    if (this.canResume()) {
      await this.host.loadCurrent(this.host.currentPositionMs(), true);
    } else {
      await this.host.loadCurrent(0, true);
    }
  }

  async play(): Promise<void> {
    if (!this.host.queue) return;
    if (this.canResume()) {
      await this.host.loadCurrent(this.host.currentPositionMs(), true);
    } else {
      await this.host.loadCurrent(0, true);
    }
  }

  async pause(): Promise<void> {
    await this.host.loadCurrent(0, false);
  }

  async next(): Promise<void> {
    if (!this.host.queue) return;
    const next = nextIndex({
      tracks: this.host.queue.tracks,
      index: this.host.queue.index,
      mode: this.host.mode,
      shuffleOrder: [...this.host.shuffleOrder],
    });
    if (next === null) {
      this.host.setStatusError('已到队列末尾');
      return;
    }
    this.host.replaceQueue({ ...this.host.queue, index: next });
    await this.host.loadCurrent(0, true);
  }

  async previous(): Promise<void> {
    if (!this.host.queue) return;
    if (this.host.currentPositionMs() > 3000) {
      await this.host.loadCurrent(0, true);
      return;
    }
    const index = previousIndex({
      tracks: this.host.queue.tracks,
      index: this.host.queue.index,
      mode: this.host.mode,
    });
    this.host.replaceQueue({ ...this.host.queue, index });
    await this.host.loadCurrent(0, true);
  }

  async cycleMode(): Promise<PlaybackMode> {
    const next = await this.host.cycleMode();
    if (next === 'shuffle') this.host.rebuildShuffleOrder();
    return next;
  }

  private canResume(): boolean {
    return Boolean(this.host.queue?.tracks.length) && !this.host.hasError;
  }
}