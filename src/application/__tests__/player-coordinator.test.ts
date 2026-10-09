import { describe, expect, it } from '@rstest/core';

import { PlayerCoordinator } from '../player-coordinator.js';
import { libraryActions, libraryStore } from '../stores.js';
import { FakeAudioEngine } from '../../infrastructure/audio/fake-audio-engine.js';
import { MemorySettings } from '../../infrastructure/settings/memory-settings.js';
import type { Track } from '../../domain/models.js';
import type { PlaybackContext } from '../../domain/playback.js';

const CONTEXT: PlaybackContext = { id: 'pl_1', kind: 'playlist', title: '测试歌单' };

function track(id: string, overrides: Partial<Track> = {}): Track {
  return {
    id,
    title: `歌 ${id}`,
    artists: [{ id: 'ar_1', name: '歌手' }],
    durationMs: 200_000,
    playable: true,
    audioUrl: `file:///music/${id}.mp3`,
    source: 'local',
    ...overrides,
  };
}

function setup(tracks = [track('a'), track('b'), track('c')]) {
  const engine = new FakeAudioEngine({ tickMs: 10, loadDelayMs: 0 });
  const settings = new MemorySettings();
  const coordinator = new PlayerCoordinator(engine, settings);
  coordinator.start();
  return { engine, settings, coordinator, tracks };
}

describe('PlayerCoordinator', () => {
  it('starts idle with no current track', () => {
    const { coordinator } = setup();
    const snapshot = coordinator.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.queue).toBeNull();
    expect(coordinator.getPlaybackSnapshot()).toBeNull();
  });

  it('plays a queue from the requested index', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 1);

    expect(coordinator.getSnapshot().status).toBe('playing');
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('b');
  });

  it('advances and stops at the end of a sequential queue', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);

    await coordinator.next();
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('b');

    await coordinator.next();
    await coordinator.next();
    expect(coordinator.getSnapshot().status).toBe('paused');
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('c');
  });

  it('repeats the same track in repeat-one mode', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);
    await coordinator.setMode('repeat-one');

    await coordinator.next();
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('a');
  });

  it('restarts the track when previous is pressed after 3s', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 1);
    await coordinator.seek(8_000);

    await coordinator.previous();
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('b');
    expect(coordinator.getSnapshot().positionMs).toBe(0);
  });

  it('goes to the previous track before 3s', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 2);
    await coordinator.seek(500);

    await coordinator.previous();
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('b');
  });

  it('surfaces an error but keeps the queue intact for an unplayable track', async () => {
    const { coordinator } = setup();
    const tracks = [track('a'), track('bad', { playable: false, audioUrl: undefined, unavailableReason: '文件已损坏' })];
    await coordinator.playQueue(CONTEXT, tracks, 1);

    const snapshot = coordinator.getSnapshot();
    expect(snapshot.status).toBe('error');
    expect(snapshot.error?.userMessage).toBe('文件已损坏');
    // The queue survives so the user can retry or skip (spec §10.5).
    expect(snapshot.queue?.tracks).toHaveLength(2);
  });

  it('emits an error event when the engine fails to load', async () => {
    const engine = new FakeAudioEngine({ failTrackIds: ['bad'], tickMs: 10 });
    const coordinator = new PlayerCoordinator(engine, new MemorySettings());
    coordinator.start();

    await coordinator.playQueue(CONTEXT, [track('bad')], 0);
    expect(coordinator.getSnapshot().status).toBe('error');
  });

  it('pauses on audio focus loss', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);
    expect(coordinator.getSnapshot().status).toBe('playing');

    coordinator.handleFocusLost();
    expect(coordinator.getSnapshot().status).toBe('paused');
  });

  it('keeps the newest load when the user taps next rapidly', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);

    // Fire three transitions without awaiting: only the last may win.
    const a = coordinator.next();
    const b = coordinator.next();
    const c = coordinator.next();
    await Promise.all([a, b, c]);

    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('c');
    expect(coordinator.getSnapshot().status).toBe('playing');
  });

  it('discards a stale load callback for a superseded request', async () => {
    const engine = new FakeAudioEngine({ tickMs: 10 });
    const coordinator = new PlayerCoordinator(engine, new MemorySettings());
    coordinator.start();

    await coordinator.playQueue(CONTEXT, [track('a'), track('b')], 0);
    await coordinator.playQueue(CONTEXT, [track('a'), track('b')], 1);
    const before = coordinator.getSnapshot().durationMs;

    // The first track's load finally reports in, long after it was superseded.
    engine.emitEvent({ type: 'loaded', sourceId: 'a:1', durationMs: 999_999 });

    expect(coordinator.getSnapshot().durationMs).toBe(before);
  });

  it('notifies subscribers on state change', async () => {
    const { coordinator, tracks } = setup();
    let calls = 0;
    const unsubscribe = coordinator.subscribe(() => {
      calls += 1;
    });

    await coordinator.playQueue(CONTEXT, tracks, 0);
    expect(calls).toBeGreaterThan(0);

    const beforeUnsubscribe = calls;
    unsubscribe();
    await coordinator.next();
    expect(calls).toBe(beforeUnsubscribe);
  });

  it('persists queue, index, position and mode', async () => {
    const { coordinator, settings, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 1);
    await coordinator.seek(12_000);
    await coordinator.setMode('shuffle');
    await coordinator.pause();

    const saved = await settings.get<Record<string, unknown> | null>('player.restore.v1', null);
    expect(saved).not.toBeNull();
    expect(saved?.['trackId']).toBe('b');
    expect(saved?.['index']).toBe(1);
    expect(saved?.['mode']).toBe('shuffle');
  });

  it('restores metadata without auto-playing', async () => {
    const settings = new MemorySettings();
    const engine = new FakeAudioEngine({ tickMs: 10 });

    const first = new PlayerCoordinator(engine, settings);
    first.start();
    const tracks = [track('a'), track('b')];
    await first.playQueue(CONTEXT, tracks, 1);
    await first.seek(30_000);
    await first.pause();

    const restored = new PlayerCoordinator(engine, settings);
    restored.start();
    const ok = await restored.restore((id) => tracks.find((t) => t.id === id));

    expect(ok).toBe(true);
    const snapshot = restored.getSnapshot();
    expect(snapshot.status).toBe('paused');
    expect(snapshot.positionMs).toBe(30_000);
    expect(restored.getPlaybackSnapshot()?.track.id).toBe('b');
  });

  it('refuses to restore when nothing was persisted', async () => {
    const coordinator = new PlayerCoordinator(new FakeAudioEngine(), new MemorySettings());
    coordinator.start();
    expect(await coordinator.restore(() => undefined)).toBe(false);
  });

  it('plays a specific queue index', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);
    await coordinator.playAtIndex(2);
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('c');
  });

  it('ignores an out-of-range queue index', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);
    await coordinator.playAtIndex(99);
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('a');
  });

  it('survives a seek that arrives after a track change', async () => {
    const { coordinator, tracks } = setup();
    await coordinator.playQueue(CONTEXT, tracks, 0);
    await coordinator.next();
    await coordinator.seek(5_000);
    expect(coordinator.getPlaybackSnapshot()?.track.id).toBe('b');
    expect(coordinator.getSnapshot().positionMs).toBe(5_000);
  });
});

describe('libraryStore optimistic updates', () => {
  it('flips the like state before the write resolves', () => {
    libraryActions.hydrate([]);
    libraryActions.begin('tr_1');
    libraryActions.optimisticSet('tr_1', true);

    expect(libraryStore.getState().likedTrackIds).toContain('tr_1');
    expect(libraryStore.getState().pendingIds).toContain('tr_1');
  });

  it('rolls back to the previous value on failure', () => {
    libraryActions.hydrate(['tr_1']);
    libraryActions.optimisticSet('tr_1', false);
    expect(libraryStore.getState().likedTrackIds).not.toContain('tr_1');

    libraryActions.rollback('tr_1', true, '保存失败');
    expect(libraryStore.getState().likedTrackIds).toContain('tr_1');
    expect(libraryStore.getState().syncError).toBe('保存失败');
  });

  it('clears the pending flag even when the write fails', () => {
    libraryActions.hydrate([]);
    libraryActions.begin('tr_2');
    libraryActions.optimisticSet('tr_2', true);
    libraryActions.rollback('tr_2', false, '保存失败');
    libraryActions.end('tr_2');

    expect(libraryStore.getState().pendingIds).not.toContain('tr_2');
    expect(libraryStore.getState().likedTrackIds).not.toContain('tr_2');
  });

  it('does not double-add an already-liked track', () => {
    libraryActions.hydrate(['tr_3']);
    libraryActions.optimisticSet('tr_3', true);
    expect(libraryStore.getState().likedTrackIds).toEqual(['tr_3']);
  });
});