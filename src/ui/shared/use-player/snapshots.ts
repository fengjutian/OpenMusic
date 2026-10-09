/**
 * Player store subscriptions. Each hook returns a **single** slice so a 250ms
 * position tick never re-renders a 1000-row list (technical spec §6).
 *
 * Hooks here are read-only. Mutations live in `intents.ts`.
 */

import { useCallback, useSyncExternalStore } from '@lynx-js/react';

import { useServices } from '../../../app/services-context.js';
import type { PlaybackSnapshot } from '../../../application/player-coordinator.js';
import type { PlaybackStatus, Track } from '../../../domain/models.js';

export function usePlayerSnapshot(): PlaybackSnapshot | null {
  const services = useServices();
  return useSyncExternalStore(
    services.player.subscribe,
    services.player.getPlaybackSnapshot,
    services.player.getPlaybackSnapshot,
  );
}

/** Full player state, including queue bookkeeping. Used by now-playing + queue. */
export function usePlayerFull() {
  const services = useServices();
  return useSyncExternalStore(
    services.player.subscribe,
    services.player.getSnapshot,
    services.player.getSnapshot,
  );
}

/** Id of the track currently loaded in the player, or null. */
export function useCurrentTrackId(): string | null {
  const services = useServices();
  const getSnapshot = useCallback(() => {
    const { queue } = services.player.getSnapshot();
    return queue ? (queue.tracks[queue.index]?.id ?? null) : null;
  }, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}

/** The currently loaded track object, or null. Stable across position ticks. */
export function usePlaybackTrack(): Track | null {
  const services = useServices();
  const getSnapshot = useCallback(() => {
    const { queue } = services.player.getSnapshot();
    return queue ? (queue.tracks[queue.index] ?? null) : null;
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
  const services = useServices();
  const getSnapshot = useCallback(() => services.player.getSnapshot().status, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}

export interface PlayerProgress {
  positionMs: number;
  durationMs: number;
}

/** Position + duration, rounded so 60Hz re-renders collapse to ~4Hz. */
export function usePlayerProgress(): PlayerProgress {
  const services = useServices();
  const getSnapshot = useCallback(() => {
    const snapshot = services.player.getSnapshot();
    return {
      positionMs: Math.round(snapshot.positionMs / 250) * 250,
      durationMs: snapshot.durationMs,
    };
  }, [services]);
  return useSyncExternalStore(services.player.subscribe, getSnapshot, getSnapshot);
}