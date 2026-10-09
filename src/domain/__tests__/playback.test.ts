import { describe, expect, it } from '@rstest/core';

import type { Track } from '../models.js';
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
} from '../playback.js';
import type { PlaybackContext, QueueState } from '../playback.js';

const CONTEXT: PlaybackContext = { id: 'pl_1', kind: 'playlist', title: '测试歌单' };

function track(id: string, title = id): Track {
  return {
    id,
    title,
    artists: [{ id: 'ar_1', name: '测试歌手' }],
    durationMs: 200_000,
    playable: true,
    audioUrl: `file:///music/${id}.mp3`,
    source: 'local',
  };
}

function queue(ids: string[], index = 0): QueueState {
  return { context: CONTEXT, tracks: ids.map((id) => track(id)), index, manualIds: [] };
}

describe('playback mode cycling', () => {
  it('cycles sequential -> repeat-one -> shuffle -> sequential', () => {
    expect(nextMode('sequential')).toBe('repeat-one');
    expect(nextMode('repeat-one')).toBe('shuffle');
    expect(nextMode('shuffle')).toBe('sequential');
  });

  it('has a label for every mode', () => {
    expect(modeLabel('sequential')).toBe('顺序播放');
    expect(modeLabel('repeat-one')).toBe('单曲循环');
    expect(modeLabel('shuffle')).toBe('随机播放');
  });
});

describe('nextIndex', () => {
  it('advances sequentially and stops at the end', () => {
    expect(nextIndex({ tracks: [], index: 0, mode: 'sequential' })).toBeNull();
    expect(nextIndex({ tracks: [track('a'), track('b')], index: 0, mode: 'sequential' })).toBe(1);
    expect(nextIndex({ tracks: [track('a'), track('b')], index: 1, mode: 'sequential' })).toBeNull();
  });

  it('stays on the same track in repeat-one', () => {
    expect(nextIndex({ tracks: [track('a'), track('b')], index: 1, mode: 'repeat-one' })).toBe(1);
  });

  it('follows the shuffled order rather than the natural one', () => {
    const order = shuffledOrder(3, 42);
    expect([...order].sort()).toEqual([0, 1, 2]);

    const state = { tracks: [track('a'), track('b'), track('c')], index: 0, mode: 'shuffle' as const, shuffleOrder: order };
    const position = order.indexOf(0);
    expect(nextIndex(state)).toBe(order[(position + 1) % order.length]);
  });

  it('returns null when the current track is not in the shuffle order', () => {
    expect(
      nextIndex({ tracks: [track('a'), track('b')], index: 0, mode: 'shuffle', shuffleOrder: [1] }),
    ).toBeNull();
  });
});

describe('previousIndex', () => {
  it('wraps to the last track', () => {
    expect(previousIndex({ tracks: [track('a'), track('b')], index: 0, mode: 'sequential' })).toBe(1);
    expect(previousIndex({ tracks: [track('a'), track('b')], index: 1, mode: 'sequential' })).toBe(0);
  });
});

describe('shuffledOrder', () => {
  it('is deterministic for a given seed', () => {
    expect(shuffledOrder(10, 7)).toEqual(shuffledOrder(10, 7));
  });

  it('is a permutation', () => {
    const order = shuffledOrder(20, 123);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});

describe('queue editing', () => {
  it('playNext inserts right after the current track', () => {
    const result = playNext(queue(['a', 'b', 'c'], 0), track('x'));
    expect(result.tracks.map((t) => t.id)).toEqual(['a', 'x', 'b', 'c']);
    expect(result.index).toBe(1);
  });

  it('addToQueue appends and marks the item manual', () => {
    const appended = addToQueue(queue(['a', 'b']), track('x'));
    expect(appended.tracks.map((t) => t.id)).toEqual(['a', 'b', 'x']);
  });

  it('does not duplicate a track that is already queued', () => {
    const result = playNext(queue(['a', 'b', 'c'], 0), track('c'));
    const ids = result.tracks.map((t) => t.id);
    expect(ids.filter((id) => id === 'c')).toHaveLength(1);
  });

  it('removing the current track advances the index, not past the end', () => {
    const result = removeFromQueue(queue(['a', 'b', 'c'], 1), 'b');
    expect(result.tracks.map((t) => t.id)).toEqual(['a', 'c']);
    expect(result.index).toBe(1);
    expect(currentTrack(result)?.id).toBe('c');
  });

  it('removing a track before the current one shifts the index down', () => {
    const result = removeFromQueue(queue(['a', 'b', 'c'], 2), 'a');
    expect(result.index).toBe(1);
    expect(currentTrack(result)?.id).toBe('c');
  });

  it('removing the last remaining track does not produce a negative index', () => {
    const result = removeFromQueue(queue(['a'], 0), 'a');
    expect(result.index).toBe(0);
    expect(currentTrack(result)).toBeNull();
  });

  it('moveInQueue keeps the pointer on the same song', () => {
    const result = moveInQueue(queue(['a', 'b', 'c'], 0), 0, 2);
    expect(result.tracks.map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(currentTrack(result)?.id).toBe('a');
  });

  it('moveInQueue shifts the pointer when an item moves across it', () => {
    const result = moveInQueue(queue(['a', 'b', 'c'], 2), 0, 1);
    expect(result.tracks.map((t) => t.id)).toEqual(['b', 'a', 'c']);
    expect(currentTrack(result)?.id).toBe('c');
  });

  it('clearManualItems keeps context items and follows the current track', () => {
    const withManual: QueueState = { ...queue(['a', 'b', 'c'], 0), manualIds: ['c'] };
    const result = clearManualItems(withManual);
    expect(result.tracks.map((t) => t.id)).toEqual(['a', 'b']);
    expect(currentTrack(result)?.id).toBe('a');
  });
});

describe('currentTrack', () => {
  it('returns null for an empty or missing queue', () => {
    expect(currentTrack(null)).toBeNull();
    expect(currentTrack(queue([]))).toBeNull();
  });

  it('returns null when the index is out of range', () => {
    expect(currentTrack({ ...queue(['a']), index: 5 })).toBeNull();
  });
});