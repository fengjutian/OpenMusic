/**
 * Player UI binding. Pages call intents here; they never touch the engine.
 *
 * Fine-grained subscriptions (spec §6): the mini player subscribes to the
 * playback slice only, so a position tick does not re-render a 1000-row list.
 */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from '@lynx-js/react';

import { getServices } from '../../app/services.js';
import { libraryActions } from '../../application/stores.js';
import type { PlaybackSnapshot } from '../../application/player-coordinator.js';
import type { PlaybackStatus, Track } from '../../domain/models.js';
import type { PlaybackContext } from '../../domain/playback.js';
import { MiniPlayer } from './playback.jsx';

export function usePlayerSnapshot(): PlaybackSnapshot | null {
  const services = getServices();
  return useSyncExternalStore(
    services.player.subscribe,
    services.player.getPlaybackSnapshot,
    services.player.getPlaybackSnapshot,
  );
}

export interface PlayerIntent {
  playTracks: (context: PlaybackContext, tracks: Track[], startIndex: number) => Promise<void>;
  playAtIndex: (index: number) => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  cycleMode: () => Promise<void>;
  retry: () => Promise<void>;
  playNextInQueue: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  moveInQueue: (from: number, to: number) => void;
  clearManualItems: () => void;
}

export function usePlayerIntents(): PlayerIntent {
  const services = getServices();

  const playTracks = useCallback(
    async (context: PlaybackContext, tracks: Track[], startIndex: number) => {
      services.analytics.track('play_request', {
        source_kind: context.kind,
        track_count: tracks.length,
      });
      try {
        await services.player.playQueue(context, tracks, startIndex);
        services.analytics.track('play_success', { source_kind: context.kind });
      } catch {
        services.analytics.track('play_error', { source_kind: context.kind });
      }
    },
    [services],
  );

  return useMemo<PlayerIntent>(
    () => ({
      playTracks,
      playAtIndex: (index) => services.player.playAtIndex(index),
      toggle: () => services.player.toggle(),
      next: () => services.player.next(),
      previous: () => services.player.previous(),
      seek: async (ms: number) => {
        services.analytics.track('seek', {});
        await services.player.seek(ms);
      },
      cycleMode: async () => {
        await services.player.cycleMode();
      },
      retry: () => services.player.retry(),
      playNextInQueue: (track) => services.player.playNextInQueue(track),
      addToQueue: (track) => services.player.addToQueue(track),
      removeFromQueue: (id) => services.player.removeFromQueue(id),
      moveInQueue: (from, to) => services.player.moveInQueue(from, to),
      clearManualItems: () => services.player.clearManualItems(),
    }),
    [services, playTracks],
  );
}

/** Full player state, including queue bookkeeping. Used by now-playing + queue. */
export function usePlayerFull() {
  const services = getServices();
  return useSyncExternalStore(
    services.player.subscribe,
    services.player.getSnapshot,
    services.player.getSnapshot,
  );
}

export function useLikeToggle() {
  const services = getServices();

  return useCallback(
    async (track: Track) => {
      const previousLiked = libraryActions.isLiked(track.id);

      libraryActions.begin(track.id);
      libraryActions.optimisticSet(track.id, !previousLiked);
      services.analytics.track('like_toggle', { liked: !previousLiked });

      try {
        await services.repository.setLiked(track.id, !previousLiked);
      } catch {
        // Roll back the optimistic flip and tell the user why.
        libraryActions.rollback(track.id, previousLiked, '收藏没保存成功，已恢复原状态');
      } finally {
        libraryActions.end(track.id);
      }
    },
    [services],
  );
}

/** Restores the previous queue on launch. Never auto-plays with sound (§10.4). */
export function useRestorePlayer() {
  const services = getServices();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const tracks: Track[] = [];
      try {
        const page = await services.repository.listTracks();
        tracks.push(...page.items);
      } catch {
        // Library unavailable — restore cannot proceed; the UI shows idle.
      }
      if (cancelled) return;

      await services.player.restore((id) => tracks.find((t) => t.id === id));
    })();

    return () => {
      cancelled = true;
    };
  }, [services]);
}

/**
 * `MiniPlayer` wired to the store.
 *
 * Kept separate from the presentational component so that a position tick only
 * re-renders the 60px strip, never the page behind it.
 */
export function ConnectedMiniPlayer({
  onExpand,
}: {
  onExpand: () => void;
}) {
  const services = getServices();
  const status = usePlayerStatus();
  const progress = usePlayerProgress();
  const track = usePlaybackTrack();
  const intents = usePlayerIntents();

  if (!track) return null;

  return (
    <MiniPlayer
      track={track}
      status={status}
      positionMs={progress.positionMs}
      durationMs={progress.durationMs}
      onToggle={() => void intents.toggle()}
      onNext={() => void intents.next()}
      onExpand={onExpand}
      onRetry={() => {
        services.analytics.track('play_error', { reason: 'manual_retry' });
        void intents.retry();
      }}
    />
  );
}

/** The currently loaded track object, or null. Stable across position ticks. */
export function usePlaybackTrack(): Track | null {
  const services = getServices();
  const getSnapshot = useCallback(() => {
    const { queue } = services.player.getSnapshot();
    return queue ? (queue.tracks[queue.index] ?? null) : null;
  }, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}
export function useCurrentTrackId(): string | null {
  const services = getServices();
  const getSnapshot = useCallback(() => {
    const { queue } = services.player.getSnapshot();
    return queue ? (queue.tracks[queue.index]?.id ?? null) : null;
  }, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}

/**
 * Coarse transport status only.
 *
 * Components subscribe to this instead of the full snapshot so a 250ms
 * position tick never re-renders a page (technical spec §6). The getter returns
 * a primitive, so `useSyncExternalStore` bails out when nothing changed.
 */
export function usePlayerStatus(): PlaybackStatus {
  const services = getServices();
  const getSnapshot = useCallback(() => services.player.getSnapshot().status, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}

export interface PlayerProgress {
  positionMs: number;
  durationMs: number;
}

/** Position + duration, rounded so 60Hz re-renders collapse to ~4Hz. */
export function usePlayerProgress(): PlayerProgress {
  const services = getServices();
  const getSnapshot = useCallback(() => {
    const snapshot = services.player.getSnapshot();
    return {
      positionMs: Math.round(snapshot.positionMs / 250) * 250,
      durationMs: snapshot.durationMs,
    };
  }, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}