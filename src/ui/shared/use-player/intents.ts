/**
 * Player intent surface. `usePlayerIntents()` returns the single bag of
 * mutation functions pages can call. Analytics is wired through
 * `tracedIntent` so the surface does not need to know about the analytics
 * sink.
 */

import { useCallback, useMemo } from '@lynx-js/react';

import { useServices } from '../../../app/services-context.js';
import { libraryActions } from '../../../application/stores.js';
import { tracedIntent } from '../../../application/traced-intent.js';
import type { PlaybackContext } from '../../../domain/playback.js';
import type { Track } from '../../../domain/models.js';

export interface PlayerIntent {
  /**
   * Build a context around a list of tracks and start playback at the index.
   * This is the **only** entry point pages should use to start a queue;
   * `playAtIndex` is reserved for jumping inside an existing queue.
   */
  playTrackList: (source: PlaybackContextSource, tracks: Track[], startIndex: number) => Promise<void>;
  playAtIndex: (index: number) => Promise<void>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  cycleMode: () => Promise<void>;
  retry: () => Promise<void>;
  /** Add a track right after the current one. Does not start playback. */
  enqueueNext: (track: Track) => void;
  /** Append a track to the end of the queue. Does not start playback. */
  enqueueLast: (track: Track) => void;
  removeFromQueue: (trackId: string) => void;
  moveInQueue: (from: number, to: number) => void;
  clearManualItems: () => void;
}

/**
 * `source` describes where a list of tracks came from so the playback context
 * carries a stable, machine-readable id (used for persistence and analytics)
 * plus a human label (shown in the mini player).
 */
export interface PlaybackContextSource {
  /** `"playlist:pl_1"`, `"search:晚风"`, `"shelf:recent"`, ... */
  id: string;
  /** `"playlist" | "album" | "artist" | "library" | "queue"`. */
  kind: PlaybackContext['kind'];
  /** User-visible title for the mini player header. */
  title: string;
}

export function buildPlaybackContext(source: PlaybackContextSource): PlaybackContext {
  return { id: source.id, kind: source.kind, title: source.title };
}

export function usePlayerIntents(): PlayerIntent {
  const services = useServices();

  const playTrackList = useCallback(
    async (source: PlaybackContextSource, tracks: Track[], startIndex: number) => {
      const context = buildPlaybackContext(source);
      await tracedIntent(
        services.analytics,
        {
          request: 'play_request',
          success: 'play_success',
          error: 'play_error',
        },
        { source_kind: context.kind, track_count: tracks.length },
        () => services.player.playQueue(context, tracks, startIndex),
      );
    },
    [services],
  );

  return useMemo<PlayerIntent>(
    () => ({
      playTrackList,
      playAtIndex: (index) => services.player.playAtIndex(index),
      toggle: () => services.player.toggle(),
      next: () => services.player.next(),
      previous: () => services.player.previous(),
      seek: async (ms: number) => {
        // Silent: seek fires every few hundred ms during scrubbing.
        await services.player.seek(ms);
      },
      cycleMode: async () => {
        await services.player.cycleMode();
      },
      retry: () => services.player.retry(),
      enqueueNext: (track) => services.player.enqueueNext(track),
      enqueueLast: (track) => services.player.enqueueLast(track),
      removeFromQueue: (id) => services.player.removeFromQueue(id),
      moveInQueue: (from, to) => services.player.moveInQueue(from, to),
      clearManualItems: () => services.player.clearManualItems(),
    }),
    [services, playTrackList],
  );
}

/**
 * Optimistic like toggle with rollback. Lives next to intents because it is
 * the only place that orchestrates `libraryStore` + `repository.setLiked`
 * together.
 */
export function useLikeToggle() {
  const services = useServices();

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
  const services = useServices();

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

// Re-export for the restoration hook above.
import { useEffect } from '@lynx-js/react';