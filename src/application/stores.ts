/**
 * Cross-page state (technical spec §6). Only state that must survive a page
 * switch lives here; page-local state stays in components.
 */

import type { ThemePreference } from '../domain/models.js';
import type { SafeAreaInsets, WindowSize } from '../domain/ports.js';
import { createStore } from './create-store.js';

// ---------------------------------------------------------------------------
// navigation
// ---------------------------------------------------------------------------

export type RouteKey =
  | 'home'
  | 'search'
  | 'library'
  | 'profile'
  | 'playlist'
  | 'album'
  | 'artist'
  | 'now-playing'
  | 'queue'
  | 'settings';

export type BottomTabKey = 'home' | 'search' | 'library' | 'profile';

export interface RouteEntry {
  key: RouteKey;
  /** Detail routes only receive an id — never a whole object (spec §7). */
  id?: string;
}

export interface NavigationState {
  tab: BottomTabKey;
  stack: RouteEntry[];
  /** Per-tab scroll offset for "回到顶部" and scroll restoration. */
  scrollByTab: Record<BottomTabKey, number>;
  nowPlayingVisible: boolean;
  queueVisible: boolean;
}

export const navigationStore = createStore<NavigationState>({
  tab: 'home',
  stack: [{ key: 'home' }],
  scrollByTab: { home: 0, search: 0, library: 0, profile: 0 },
  nowPlayingVisible: false,
  queueVisible: false,
});

export const navigationActions = {
  switchTab(tab: BottomTabKey): void {
    navigationStore.setState((prev) =>
      prev.tab === tab
        ? // Re-tapping the current tab scrolls back to top (spec §8).
          { scrollByTab: { ...prev.scrollByTab, [tab]: 0 } }
        : { tab, stack: [{ key: tab }], nowPlayingVisible: false, queueVisible: false },
    );
  },

  push(entry: RouteEntry): void {
    navigationStore.setState((prev) => ({ stack: [...prev.stack, entry] }));
  },

  pop(): boolean {
    let popped = false;
    navigationStore.setState((prev) => {
      if (prev.stack.length <= 1) return {};
      popped = true;
      return { stack: prev.stack.slice(0, -1) };
    });
    return popped;
  },

  resetTo(entry: RouteEntry): void {
    navigationStore.setState({ stack: [entry] });
  },

  openNowPlaying(): void {
    navigationStore.setState({ nowPlayingVisible: true });
  },

  closeNowPlaying(): void {
    navigationStore.setState({ nowPlayingVisible: false });
  },

  toggleQueue(): void {
    navigationStore.setState((prev) => ({ queueVisible: !prev.queueVisible }));
  },

  closeQueue(): void {
    navigationStore.setState({ queueVisible: false });
  },

  setScroll(tab: BottomTabKey, offset: number): void {
    navigationStore.setState((prev) => ({ scrollByTab: { ...prev.scrollByTab, [tab]: offset } }));
  },
};

// ---------------------------------------------------------------------------
// library
// ---------------------------------------------------------------------------

export interface LibraryState {
  likedTrackIds: string[];
  /** Ids with an in-flight like toggle, so the row can show a spinner. */
  pendingIds: string[];
  syncError: string | null;
}

export const libraryStore = createStore<LibraryState>({
  likedTrackIds: [],
  pendingIds: [],
  syncError: null,
});

export const libraryActions = {
  hydrate(ids: string[]): void {
    libraryStore.setState({ likedTrackIds: ids, syncError: null });
  },

  begin(trackId: string): void {
    libraryStore.setState((prev) => ({
      pendingIds: prev.pendingIds.includes(trackId)
        ? prev.pendingIds
        : [...prev.pendingIds, trackId],
    }));
  },

  /** Optimistic flip, applied before the request resolves. */
  optimisticSet(trackId: string, liked: boolean): void {
    libraryStore.setState((prev) => {
      const has = prev.likedTrackIds.includes(trackId);
      if (liked === has) return {};
      return {
        likedTrackIds: liked
          ? [...prev.likedTrackIds, trackId]
          : prev.likedTrackIds.filter((id) => id !== trackId),
      };
    });
  },

  /** Rollback after a failed write (spec §8). */
  rollback(trackId: string, previousLiked: boolean, message: string): void {
    libraryStore.setState((prev) => ({
      likedTrackIds: previousLiked
        ? prev.likedTrackIds.includes(trackId)
          ? prev.likedTrackIds
          : [...prev.likedTrackIds, trackId]
        : prev.likedTrackIds.filter((id) => id !== trackId),
      syncError: message,
    }));
  },

  end(trackId: string): void {
    libraryStore.setState((prev) => ({
      pendingIds: prev.pendingIds.filter((id) => id !== trackId),
    }));
  },

  isLiked(trackId: string): boolean {
    return libraryStore.getState().likedTrackIds.includes(trackId);
  },
};

// ---------------------------------------------------------------------------
// session
// ---------------------------------------------------------------------------

export interface SessionState {
  theme: ThemePreference;
  /** Resolved from `theme` + platform preference; components read this. */
  resolvedTheme: 'dark' | 'light';
  reduceMotion: boolean;
  volume: number;
  online: boolean;
  safeArea: SafeAreaInsets;
  windowSize: WindowSize;
  settingsOpen: boolean;
  toast: { message: string; action?: { label: string; run: () => void } } | null;
}

export const sessionStore = createStore<SessionState>({
  theme: 'dark',
  resolvedTheme: 'dark',
  reduceMotion: false,
  volume: 1,
  online: true,
  safeArea: { top: 0, bottom: 0, left: 0, right: 0 },
  windowSize: { width: 390, height: 844 },
  settingsOpen: false,
  toast: null,
});

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const sessionActions = {
  setTheme(theme: ThemePreference): void {
    sessionStore.setState({ theme, resolvedTheme: theme === 'system' ? 'dark' : theme });
  },

  setResolvedTheme(resolved: 'dark' | 'light'): void {
    sessionStore.setState({ resolvedTheme: resolved });
  },

  setVolume(volume: number): void {
    sessionStore.setState({ volume });
  },

  setOnline(online: boolean): void {
    sessionStore.setState({ online });
  },

  setSafeArea(safeArea: SafeAreaInsets): void {
    sessionStore.setState({ safeArea });
  },

  setWindowSize(windowSize: WindowSize): void {
    sessionStore.setState({ windowSize });
  },

  setReduceMotion(reduceMotion: boolean): void {
    sessionStore.setState({ reduceMotion });
  },

  openSettings(): void {
    sessionStore.setState({ settingsOpen: true });
  },

  closeSettings(): void {
    sessionStore.setState({ settingsOpen: false });
  },

  /** Toasts auto-dismiss after 2–3s (product spec §8). */
  toast(message: string, action?: { label: string; run: () => void }): void {
    if (toastTimer) clearTimeout(toastTimer);
    sessionStore.setState({ toast: { message, action } });
    toastTimer = setTimeout(() => {
      sessionStore.setState({ toast: null });
      toastTimer = null;
    }, 2600);
  },
};