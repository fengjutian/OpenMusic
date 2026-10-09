/**
 * QueueController — owns queue mutations.
 *
 * The state and engine live on the coordinator; this class only knows how to
 * shape the queue (`playback.ts` has the pure rules) and how to ask the host
 * to start playback when an enqueue/insert should become audible.
 *
 * The host is described by a narrow `PlayerHost` interface rather than the
 * full coordinator class so the dependency direction is `controller → host`
 * only and the coordinator can be typechecked without importing it here.
 */

import { AppError } from '../domain/errors.js';
import type { ID, Track } from '../domain/models.js';
import {
  addToQueue,
  clearManualItems,
  moveInQueue,
  playNext,
  removeFromQueue,
} from '../domain/playback.js';
import type { PlaybackContext, QueueState } from '../domain/playback.js';

/**
 * The slice of the coordinator that queue mutations need.
 * Kept narrow so this file does not pull in engine / persistence / analytics.
 */
export interface PlayerHost {
  readonly queue: QueueState | null;
  replaceQueue(next: QueueState): void;
  loadCurrent(positionMs: number, autoplay: boolean): Promise<void>;
}

export class QueueController {
  constructor(private readonly host: PlayerHost) {}

  setQueue(context: PlaybackContext, tracks: Track[], index: number): QueueState {
    return { context, tracks: tracks.slice(), index, manualIds: [] };
  }

  enqueueNext(track: Track): void {
    if (!this.host.queue) return;
    this.host.replaceQueue(playNext(this.host.queue, track));
  }

  enqueueLast(track: Track): void {
    if (!this.host.queue) return;
    const next = addToQueue(this.host.queue, track);
    this.host.replaceQueue({
      ...next,
      manualIds: next.manualIds.includes(track.id)
        ? next.manualIds
        : [...next.manualIds, track.id],
    });
  }

  remove(trackId: ID): void {
    if (!this.host.queue) return;
    const removingCurrent = this.host.queue.tracks[this.host.queue.index]?.id === trackId;
    const next = removeFromQueue(this.host.queue, trackId);
    this.host.replaceQueue(next);
    if (removingCurrent) {
      void this.host.loadCurrent(0, true);
    }
  }

  move(from: number, to: number): void {
    if (!this.host.queue) return;
    this.host.replaceQueue(moveInQueue(this.host.queue, from, to));
  }

  clearManual(): void {
    if (!this.host.queue) return;
    this.host.replaceQueue(clearManualItems(this.host.queue));
  }

  /** Reject a load that targets an unplayable track, preserving the queue. */
  markTrackUnplayable(track: Track): AppError {
    return new AppError(
      'unavailable',
      track.unavailableReason ?? '这首歌暂时无法播放，已为你保留队列',
    );
  }
}