/**
 * Pure playback rules. No state, no I/O — these are the functions the unit
 * tests pin down (technical spec §12).
 */

import type { ID, PlaybackMode, Track } from './models.js';

export interface PlaybackContext {
  /** Where the queue came from, e.g. `playlist:pl_1` or `album:al_1`. */
  id: string;
  kind: 'playlist' | 'album' | 'artist' | 'library' | 'queue';
  title: string;
}

export interface QueueState {
  context: PlaybackContext;
  tracks: Track[];
  index: number;
  /** Track ids the user appended by hand; clearing the queue keeps these. */
  manualIds: ID[];
}

/**
 * Deterministic shuffle order. We shuffle indices rather than tracks so that
 * the queue identity stays stable and "下一首" never depends on Math.random
 * being called an extra time.
 */
export function shuffledOrder(length: number, seed: number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  // xorshift32 — small, deterministic, good enough for a listening order.
  let s = seed || 0x9e3779b9;
  for (let i = length - 1; i > 0; i--) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    const j = s % (i + 1);
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

export interface CursorState {
  tracks: Track[];
  index: number;
  mode: PlaybackMode;
  /** Present only in shuffle mode. */
  shuffleOrder?: number[];
}

export function nextIndex(state: CursorState): number | null {
  const { tracks, index, mode } = state;
  if (tracks.length === 0) return null;
  if (mode === 'repeat-one') return index;

  if (mode === 'shuffle' && state.shuffleOrder) {
    const pos = state.shuffleOrder.indexOf(index);
    if (pos === -1) return null;
    const nextPos = (pos + 1) % state.shuffleOrder.length;
    return state.shuffleOrder[nextPos] ?? null;
  }

  const next = index + 1;
  if (next < tracks.length) return next;
  return null; // end of queue in sequential mode
}

export function previousIndex(state: CursorState): number {
  const prev = state.index - 1;
  if (prev >= 0) return prev;
  // Sequential wraps to the end, like every other player.
  return Math.max(0, state.tracks.length - 1);
}

export function nextMode(current: PlaybackMode): PlaybackMode {
  switch (current) {
    case 'sequential':
      return 'repeat-one';
    case 'repeat-one':
      return 'shuffle';
    case 'shuffle':
      return 'sequential';
  }
}

export function modeLabel(mode: PlaybackMode): string {
  switch (mode) {
    case 'sequential':
      return '顺序播放';
    case 'repeat-one':
      return '单曲循环';
    case 'shuffle':
      return '随机播放';
  }
}

/** Insert a track right after the current one ("下一首播放"). */
export function playNext(queue: QueueState, track: Track): QueueState {
  return insertAt(queue, queue.index + 1, track);
}

export function addToQueue(queue: QueueState, track: Track): QueueState {
  return insertAt(queue, queue.tracks.length, track);
}

function insertAt(queue: QueueState, at: number, track: Track): QueueState {
  const position = Math.max(0, Math.min(at, queue.tracks.length));
  const existing = queue.tracks.findIndex((t) => t.id === track.id);
  if (existing >= 0) {
    // Already queued — move it instead of duplicating.
    const tracks = queue.tracks.slice();
    tracks.splice(existing, 1);
    const index = existing <= queue.index ? queue.index - 1 : queue.index;
    tracks.splice(Math.max(0, Math.min(position - 1, tracks.length)), 0, track);
    return { ...queue, tracks, index: Math.max(0, index) };
  }
  const tracks = queue.tracks.slice();
  tracks.splice(position, 0, track);
  return { ...queue, tracks, index: position };
}

export function removeFromQueue(queue: QueueState, trackId: ID): QueueState {
  const at = queue.tracks.findIndex((t) => t.id === trackId);
  if (at < 0) return queue;
  const tracks = queue.tracks.slice();
  tracks.splice(at, 1);

  let index = queue.index;
  if (at < queue.index) index -= 1;
  else if (at === queue.index) index = Math.min(index, tracks.length - 1);

  return {
    ...queue,
    tracks,
    index: Math.max(0, index),
    manualIds: queue.manualIds.filter((id) => id !== trackId),
  };
}

export function moveInQueue(queue: QueueState, from: number, to: number): QueueState {
  const tracks = queue.tracks.slice();
  if (from < 0 || from >= tracks.length) return queue;
  const target = Math.max(0, Math.min(to, tracks.length - 1));
  const [moved] = tracks.splice(from, 1);
  if (!moved) return queue;
  tracks.splice(target, 0, moved);

  // Keep pointing at the *same song*, not the same position.
  let index = queue.index;
  if (queue.index === from) index = target;
  else if (from < queue.index && target >= queue.index) index -= 1;
  else if (from > queue.index && target <= queue.index) index += 1;

  return { ...queue, tracks, index };
}

/** Drop everything the user appended, keep the original context. */
export function clearManualItems(queue: QueueState): QueueState {
  const keep = queue.tracks.filter((t) => !queue.manualIds.includes(t.id));
  const current = queue.tracks[queue.index];
  const nextIndexInKeep = current ? keep.findIndex((t) => t.id === current.id) : -1;
  return {
    ...queue,
    tracks: keep,
    index: nextIndexInKeep >= 0 ? nextIndexInKeep : 0,
    manualIds: [],
  };
}

export function currentTrack(queue: QueueState | null): Track | null {
  if (!queue || queue.tracks.length === 0) return null;
  return queue.tracks[queue.index] ?? null;
}